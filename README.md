# OSA Community Platform

> Membership and Event Management System for The Odisha Society of the Americas

A full-stack platform for managing memberships, event registrations, and community content — built as a single Next.js application with Supabase Auth, Prisma ORM, Stripe payments, and Sanity CMS.

> 📌 **Running this in production? Start here:**
> - **[Admin Operations Manual](./docs/admin-operations-manual.md)** — day-to-day platform administration: members, memberships, payments, content, cron jobs, deployment, and troubleshooting
> - **[Content Author Guide](./docs/content-author-guide.md)** — for volunteer editors publishing content via Sanity Studio

## 🏗️ Tech Stack

- **Framework**: Next.js 15.1.4 (App Router) + Tailwind CSS + React 19
- **API**: Next.js Route Handlers (`app/api/`) — no separate backend
- **Database**: PostgreSQL via Supabase · Prisma 6.2.0 ORM
- **Auth**: Supabase Auth (email/password + Google OAuth)
- **CMS**: Sanity (events, news, announcements, static pages)
- **Payments**: Stripe
- **Email**: Resend
- **Monorepo**: Turborepo + pnpm workspaces

## 📁 Project Structure

```
osa-community-platform/
├── apps/
│   ├── web/          # Next.js app (port 3000) — frontend + API + Prisma
│   └── supabase/     # Local Supabase config
├── packages/
│   ├── shared-types/ # Shared TypeScript types
│   ├── validation/   # Zod validation schemas
│   └── config/       # Shared configuration
├── docs/             # Architecture reference
└── specs/            # Feature specs and SDD workflow
```

## 💻 Local Developer Setup & How to Run

Full step-by-step instructions (tool prerequisites, initial setup, running the dev server, and the `.env` / `.env.local` / `.env.example` distinction) live in the **[Admin Operations Manual — §13 Local Development Setup](./docs/admin-operations-manual.md#13-local-development-setup)**, which is the single source of truth for this so it doesn't drift out of sync in two places.

Quick start:
```bash
git clone <repo-url> && cd membership-event-registration
pnpm install
supabase start
cp apps/web/.env.example apps/web/.env.local   # fill in values from `supabase status`
cd apps/web && npx prisma db push && npx prisma db seed && cd ../..
pnpm dev   # http://localhost:3000
```

## 🧪 Testing

### Playwright E2E Tests

```bash
# Run all e2e tests (Playwright auto-starts Next.js)
pnpm --filter=web test:e2e

# Interactive UI mode
pnpm --filter=web test:e2e:ui

# Single spec
cd apps/web && npx playwright test e2e/memberships.spec.ts
```

### Jest Unit Tests

```bash
pnpm --filter=web test
```

### Manual API Testing

```bash
# Get a token
./scripts/get-auth-token.sh

# Use it
curl http://localhost:3000/api/members/me \
  -H "Authorization: Bearer <token>"
```

## 🧑‍🔬 Managing Test Users

Test users span two systems — Supabase Auth (`auth.users`) and the app database (`Member`, `FamilyMember`). Both must be kept in sync.

### Creating a test user

The simplest path is the normal registration flow:

1. Open `http://localhost:3000/register`
2. Sign up with any email address
3. Supabase sends a confirmation link — open **Mailpit** at `http://127.0.0.1:54324` to get it
4. Click the link, then complete the registration wizard

> **Tip:** If you need multiple test accounts quickly, use address sub-addressing — `you+spouse@gmail.com`, `you+child@gmail.com` — they all route to the same inbox in Mailpit.

### Removing a test user

Cleaning up a test account lets you reuse the same email address in a fresh state (useful when testing primary / spouse email association).

**Option A — SQL (fastest):** Open Supabase Studio at `http://127.0.0.1:54323`, go to **SQL Editor**, and run:

```sql
-- Replace 'test@example.com' with the address you want to remove.
-- Run the statements in this exact order — each step clears a foreign key
-- that would otherwise block the next one.

-- 1. Delete this member's own family members (family_members.primary_member_id → members.id)
DELETE FROM family_members
WHERE primary_member_id = (SELECT id FROM members WHERE email = 'test@example.com');

-- 2. Unlink this user if they were linked as a spouse on someone else's account
UPDATE family_members
SET spouse_user_id = NULL, email = NULL, deleted_at = NOW()
WHERE spouse_user_id = (SELECT id FROM auth.users WHERE email = 'test@example.com');

-- 3. Detach payment records (member_id is nullable — rows are kept for audit purposes)
UPDATE payment_records
SET member_id = NULL
WHERE member_id = (SELECT id FROM members WHERE email = 'test@example.com');

-- 4. Detach any awards linked to this member
UPDATE awards
SET recipient_member_id = NULL
WHERE recipient_member_id = (SELECT id FROM members WHERE email = 'test@example.com');

-- 5. Delete any messages sent or received by this member
DELETE FROM messages
WHERE sender_member_id    = (SELECT id FROM members WHERE email = 'test@example.com')
   OR recipient_member_id = (SELECT id FROM members WHERE email = 'test@example.com');

-- 6. Unset this member as chapter president (if applicable)
UPDATE chapters
SET president_member_id = NULL
WHERE president_member_id = (SELECT id FROM members WHERE email = 'test@example.com');

-- 7. Delete the member row
DELETE FROM members WHERE email = 'test@example.com';

-- 8. Delete the Supabase auth user
DELETE FROM auth.users WHERE email = 'test@example.com';
```

> Run in this exact order. The `members` row can only be deleted after all referencing rows in `family_members`, `messages`, `awards`, and `chapters` have been cleared or removed first.

**Option B — UI tools (no SQL):**

| What to delete | Where |
|---|---|
| `FamilyMember` rows (email / spouseUserId) | Prisma Studio → `FamilyMember` table |
| `Member` row | Prisma Studio → `Member` table |
| Auth user | Supabase Studio → Authentication → Users → ⋮ → Delete user |

Open Prisma Studio with:
```bash
cd apps/web && npx prisma studio   # opens on http://localhost:5555
```

### Testing primary ↔ spouse email association

1. Register **primary member** with email A — complete the registration wizard
2. On the profile page, enter spouse name and spouse email B, then save
3. Log out
4. Register **spouse** with email B — after confirming, the dashboard will show the primary member's profile
5. To reset and repeat, remove the test user for email A (which cascades the `FamilyMember` link) and the test user for email B separately using the steps above

---

## 🔌 API Endpoints (summary)

All endpoints live at `http://localhost:3000/api/...`.

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/auth/me` | ✅ | Get current user |

### Members
| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `GET` | `/api/members/me` | ✅ | Any | Get own record |
| `PUT` | `/api/members/me` | ✅ | Any | Update profile |
| `DELETE` | `/api/members/me` | ✅ | Any | Soft-delete account |
| `GET` | `/api/members/me/family` | ✅ | Any | List family members |
| `POST` | `/api/members/me/family` | ✅ | Any | Add family member |
| `GET` | `/api/members/me/export` | ✅ | Any | GDPR data export |
| `GET` | `/api/members/search` | ✅ | Active | Search members |
| `GET` | `/api/members` | ✅ | Admin | List all members |
| `PUT` | `/api/members/:id/role` | ✅ | Admin | Update role |

### Memberships
| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `GET` | `/api/memberships/types` | ❌ | Public | List membership fee tiers |
| `POST` | `/api/memberships` | ✅ | Any | Apply for membership |
| `GET` | `/api/memberships/me` | ✅ | Any | Get own membership status |
| `DELETE` | `/api/memberships/me` | ✅ | Any | Cancel membership |
| `GET` | `/api/memberships/me/history` | ✅ | Any | Membership history |
| `GET` | `/api/memberships` | ✅ | Admin | List all memberships |
| `POST` | `/api/memberships/:id/approve` | ✅ | Admin | Approve pending |
| `POST` | `/api/memberships/:id/reject` | ✅ | Admin | Reject pending |
| `POST` | `/api/memberships/honorary/assign` | ✅ | Admin | Grant honorary membership |

### Payments
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/payments/me` | ✅ | Own payment history |
| `POST` | `/api/payments/checkout-session` | ✅ | Create Stripe checkout |
| `POST` | `/api/payments/upgrade-session` | ✅ | Create Stripe upgrade checkout |
| `POST` | `/api/webhooks/stripe` | — | Stripe webhook handler |

**Example — apply for membership:**
```bash
curl -X POST http://localhost:3000/api/memberships \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "membershipType": "annualSingle" }'
```

**Example — create checkout session:**
```bash
curl -X POST http://localhost:3000/api/payments/checkout-session \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "membershipType": "annualSingle" }'
```

## 🛠️ Common Commands

```bash
# Dev
pnpm dev
pnpm build
pnpm lint
pnpm format

# Database (from apps/web/)
cd apps/web
npx prisma db push       # sync schema to local DB
npx prisma db seed       # seed membership fee tiers
npx prisma studio        # visual DB browser
npx prisma generate      # regenerate Prisma client after schema change

# Supabase
supabase start
supabase stop
supabase status

# Clean up
pnpm clean
supabase stop --all && docker system prune -f
```

## 📖 Documentation

- **Architecture**: `docs/osa-architecture.md`
- **Admin Operations**: `docs/admin-operations-manual.md`
- **Content Author Guide**: `docs/content-author-guide.md`
- **Feature Specs**: `specs/active/`
- **SDD Workflow**: `specs/README.md`

## 🎯 Implementation Status

- ✅ Turborepo monorepo + Supabase local stack + Prisma schema
- ✅ Supabase Auth — email/password + Google OAuth
- ✅ Full API layer — members, memberships, payments, messages, chapters, webhooks
- ✅ Frontend pages — login, register, dashboard, profile, membership, admin, public content
- ✅ Playwright e2e suite (~66 tests) + Jest unit tests
- ✅ Sanity CMS integration — events, news, announcements
- 📋 Events registration module — planned

## 🤝 Contributing

1. Read `docs/osa-architecture.md` for system design
2. Review active specs in `specs/active/`
3. Follow the spec-driven development workflow (`specs/README.md`)
4. Use TypeScript strict mode, Zod for validation, ESLint + Prettier

## 📝 License

[Add license information]

---

**Built with ❤️ for The Odisha Society of the Americas**
