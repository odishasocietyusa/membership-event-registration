# OSA Website — Architecture Reference

**Odisha Society of the Americas · Technical Reference · v1.0**

Stack: `Next.js + Vercel` · `Supabase` · `Sanity CMS` · `Stripe`

---

## 1. System Architecture

### User Roles

| Role | Access |
|------|--------|
| **Public** | No login required |
| **Member** | Auth required · profile + messaging |
| **Author / Volunteer** | Sanity Studio editor |
| **Admin** | Full access · link accounts · refunds |

### Frontend — Next.js on Vercel (App Router · SSG + ISR)

| Page type | Purpose |
|-----------|---------|
| **Static pages** | Constitution, about, awards list, policy docs |
| **Dynamic pages** | Events, news, announcements via ISR |
| **Member portal** | Profile, messaging, membership status |
| **Admin dashboard** | Link accounts · awards entry · refunds |

### API Routes

- `/api/auth`
- `/api/members`
- `/api/awards`
- `/api/messages`
- `/api/webhooks/stripe`
- `/api/admin/link-member`

### Core Services

| Service | Role |
|---------|------|
| **Supabase Auth** | Google OAuth · session JWT · RLS |
| **Supabase DB** | PostgreSQL · members, payments, awards |
| **Supabase Storage** | Event flyers · award photos |
| **Sanity CMS** | Events · news · volunteer-editable content |

### External Integrations

| Service | Role |
|---------|------|
| **Stripe** | Annual + life payments · refunds · donations |
| **Resend** | Transactional email · member message relay |
| **Google OAuth** | Social login via Supabase Auth |
| **Vercel Analytics** | Traffic + error tracking |

### Key Data Flows

**New member registration:**
```
Google login → Member form → Stripe payment → DB record created → Email confirmation
```

**Volunteer publishes content:**
```
Sanity Studio → Publish event → ISR revalidate → Page live (no deploy needed)
```

**Member sends message:**
```
Contact form → API route → Lookup email server-side → Resend relay → Delivered (no email exposed)
```

**Admin links account:**
```
Admin dashboard → Search member by email → Write user_id to members → Account linked
```

**Stripe webhook (renewal):**
```
invoice.paid event → /api/webhooks/stripe → Idempotency check → Update expiry_date
```

---

## 2. Database Schema — Supabase (PostgreSQL)

All tables in Supabase · RLS enforced at DB layer · `auth.users` managed by Supabase Auth

### `members`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid PK` | internal member id |
| `user_id` | `uuid FK → auth.users` | nullable until admin links account |
| `stripe_customer_id` | `text` | links to Stripe customer object |
| `email` | `text unique` | membership registration email |
| `full_name` | `text` | |
| `phone` | `text` | |
| `address` | `jsonb` | street, city, state, zip, country |
| `chapter` | `text FK → chapters` | |
| `membership_type` | `enum` | `annual · life · patron · benefactor` |
| `member_status` | `enum` | `active · expired · suspended` |
| `join_date` | `date` | |
| `expiry_date` | `date` | null for life members |
| `profile_visibility` | `jsonb` | `show_phone · show_email · show_chapter` |
| `role` | `enum` | `member · admin` |
| `souvenir_preference` | `enum` | `electronic · print` |
| `created_at` | `timestamptz` | auto |

### `payments`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid PK` | |
| `member_id` | `uuid FK → members` | |
| `stripe_payment_id` | `text` | Stripe PaymentIntent id |
| `stripe_event_id` | `text unique` | deduplicates webhook events |
| `type` | `enum` | `annual · life · donation · refund` |
| `amount_cents` | `int` | stored as cents — avoids float bugs |
| `currency` | `text` | default usd |
| `status` | `enum` | `succeeded · refunded · failed · pending` |
| `refund_reason` | `text` | nullable · required for 501(c)(3) audit |
| `approved_by` | `uuid FK → members` | admin who approved refund |
| `created_at` | `timestamptz` | auto |

### `family_members`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid PK` | |
| `primary_member_id` | `uuid FK → members` | head of household |
| `full_name` | `text` | |
| `relation` | `enum` | `spouse · child · other` |
| `date_of_birth` | `date` | optional · for youth programmes |
| `created_at` | `timestamptz` | auto |

### `awards`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid PK` | |
| `award_name` | `text` | from OSA defined awards list |
| `year` | `int` | |
| `category` | `enum` | `nomination · competition` |
| `recipient_name` | `text` | non-member recipients possible |
| `recipient_member_id` | `uuid FK → members` | nullable |
| `citation` | `text` | short reason text |
| `photo_url` | `text` | Supabase Storage URL |
| `created_at` | `timestamptz` | auto |

### `messages`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `uuid PK` | |
| `sender_member_id` | `uuid FK → members` | |
| `recipient_member_id` | `uuid FK → members` | |
| `subject` | `text` | |
| `body` | `text` | |
| `sent_at` | `timestamptz` | auto |

### `chapters`

| Field | Type | Notes |
|-------|------|-------|
| `id` | `text PK` | e.g. `"seattle"` · `"florida"` |
| `display_name` | `text` | OSA Seattle Chapter |
| `states` | `text[]` | geographic coverage |
| `president_member_id` | `uuid FK → members` | current term president |
| `created_at` | `timestamptz` | auto |

### Row Level Security (RLS) Policies

| Table | Policy |
|-------|--------|
| `members` | SELECT own row only (`auth.uid() = user_id`) · Admin: SELECT all · Public: no access |
| `payments` | SELECT own payments only · Admin: SELECT + UPDATE all · INSERT via webhook (service role) only |
| `messages` | SELECT sender OR recipient only · INSERT authenticated members · No DELETE permitted |
| `awards` | SELECT public (no auth needed) · INSERT / UPDATE / DELETE admin role only |
| `family_members` | SELECT primary member only · INSERT / UPDATE primary member · Admin full access |
| `chapters` | SELECT public · INSERT / UPDATE / DELETE admin only |

---

## 3. CMS Schema — Sanity

Managed by volunteer authors via Sanity Studio · fetched by Next.js at build time (SSG) or on-demand (ISR) · no member data stored here.

### `event`
```
string    title
slug      slug
datetime  start_date
datetime  end_date
string    location
text      description
image     flyer
url       registration_link
string    chapter (optional)
bool      is_convention
```

### `news_post`
```
string    title
slug      slug
datetime  published_at
string    author_name
image     cover_image
richtext  body (portable text)
string[]  tags
bool      featured
```

### `announcement`
```
string    title
text      body
datetime  published_at
datetime  expires_at
enum      audience: all · members · chapter
string    chapter (optional)
url       cta_link
string    cta_label
```

### `leadership_program`
```
string    program_name
string    recipient_name
int       year
string    chapter
image     photo
text      notes
```

### `static_page`
```
string    title
slug      slug
richtext  body
string    section
int       sort_order
datetime  last_updated
```

### `media_gallery`
```
string    title
datetime  event_date
string    chapter (optional)
image[]   photos
text      description
```

### Content Boundary

| Store | Content |
|-------|---------|
| **Sanity** | Events · news posts · announcements · media galleries · leadership programme certificates · static informational pages (about, history). Editable by volunteer authors with no developer involvement. |
| **Supabase DB** | Member records · payments · awards · messages · family members · chapters. Requires admin or member authentication. Never in Sanity. |
| **Git (MDX)** | Constitution · bylaws · model chapter guidelines · convention guidelines. Change rarely, need version history. Deployed with codebase as static pages. |
| **Supabase Storage** | Event flyers · award recipient photos · file attachments. |
