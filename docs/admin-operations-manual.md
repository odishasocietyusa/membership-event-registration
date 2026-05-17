# Admin Operations Manual

**Odisha Society of the Americas · OSA Community Platform**

This manual covers day-to-day administration of the live platform. It assumes the application is already deployed — see [`deployment-manual.md`](./deployment-manual.md) for first-time setup.

> **Security note:** This document contains no secrets or credentials. All sensitive values are referenced by name only. Never share your admin account credentials or service role key.

---

## Table of Contents

1. [Admin Account Setup](#1-admin-account-setup)
2. [Member Management](#2-member-management)
3. [Membership Management](#3-membership-management)
4. [Payments and Refunds](#4-payments-and-refunds)
5. [Chapter Management](#5-chapter-management)
6. [RLS Policy Setup](#6-rls-policy-setup)
7. [Content Management (Sanity CMS)](#7-content-management-sanity-cms)
8. [Cron Job and Expiry Reminders](#8-cron-job-and-expiry-reminders)
9. [Stripe Operations](#9-stripe-operations)
10. [Resend and Email Operations](#10-resend-and-email-operations)
11. [Database Operations](#11-database-operations)
12. [Monitoring and Troubleshooting](#12-monitoring-and-troubleshooting)

---

## 1. Admin Account Setup

### Promoting a user to admin

The `role` field on the `members` table controls admin access. There is no self-service promotion — it must be done by an existing admin or directly in Supabase Studio.

**Via API (existing admin required):**
```bash
curl -X PUT https://<your-domain>/api/members/<member-id>/role \
  -H "Authorization: Bearer <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"role": "admin"}'
```

**Via Supabase Studio (first admin — no existing admin available):**
1. Go to `https://supabase.com/dashboard` → your project → **Table Editor → members**
2. Find the member row by email
3. Click the row → edit the `role` field → change from `member` to `admin`
4. Save

> The role change takes effect immediately on the next API request. No restart needed.

### Revoking admin access

```bash
curl -X PUT https://<your-domain>/api/members/<member-id>/role \
  -H "Authorization: Bearer <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"role": "member"}'
```

Or set `role = 'member'` directly in Supabase Studio.

### Getting an access token for API calls

Use the Supabase anon key to sign in and retrieve a JWT:

```bash
curl -X POST https://<supabase-project-url>/auth/v1/token?grant_type=password \
  -H "apikey: <NEXT_PUBLIC_SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"email": "<admin-email>", "password": "<admin-password>"}'
```

The response includes `access_token` — use it as the Bearer token for all admin API calls below. Tokens expire after 1 hour; repeat to refresh.

---

## 2. Member Management

### Link a Google auth account to an existing member record

When a member registered via form before Google OAuth was available, or when an admin pre-created a member record, the `user_id` field is null. After the member signs in with Google, link their auth identity to their record:

```bash
curl -X POST https://<your-domain>/api/admin/link-member \
  -H "Authorization: Bearer <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"email": "member@example.com", "userId": "<supabase-auth-user-id>"}'
```

To find the `userId`, go to Supabase Dashboard → **Authentication → Users** and search by email.

**Responses:**
- `200` — linked successfully (or was already linked to the same account — idempotent)
- `404` — no member row found with that email
- `409` — member row already linked to a *different* account

### View a member's full profile (admin)

```bash
curl https://<your-domain>/api/members/<member-id> \
  -H "Authorization: Bearer <admin-access-token>"
```

Returns the full member object including soft-deleted fields.

### List all members with pagination

```bash
curl "https://<your-domain>/api/members?page=1&limit=20&status=active" \
  -H "Authorization: Bearer <admin-access-token>"
```

Query parameters:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | int | 1 | Page number |
| `limit` | int | 20 | Results per page (max 100) |
| `status` | string | — | Filter by `active`, `expired`, `suspended` |

### Suspend a member

```bash
curl -X PUT https://<your-domain>/api/members/<member-id> \
  -H "Authorization: Bearer <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"memberStatus": "suspended"}'
```

### Reactivate a suspended member

```bash
curl -X PUT https://<your-domain>/api/members/<member-id> \
  -H "Authorization: Bearer <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"memberStatus": "active"}'
```

### GDPR export for a member (admin-initiated)

```bash
curl https://<your-domain>/api/members/<member-id>/export \
  -H "Authorization: Bearer <admin-access-token>"
```

Returns a JSON bundle of the member's profile, family members, and payment records. Save the response as a file and send it to the member securely (not via unencrypted email).

### Soft-delete a member account

```bash
curl -X DELETE https://<your-domain>/api/members/<member-id> \
  -H "Authorization: Bearer <admin-access-token>"
```

Sets `deleted_at` — the row is never physically removed. The member's login session is invalidated on the next request. To fully remove the auth identity, go to Supabase Dashboard → **Authentication → Users** and delete the user there as well.

---

## 3. Membership Management

### List all memberships (with optional status filter)

```bash
curl "https://<your-domain>/api/memberships?status=pending&page=1&limit=20" \
  -H "Authorization: Bearer <admin-access-token>"
```

Status values: `pending`, `active`, `expired`, `cancelled`, `rejected`

### Approve a pending membership application

```bash
curl -X POST https://<your-domain>/api/memberships/<membership-id>/approve \
  -H "Authorization: Bearer <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"note": "Verified payment receipt #12345"}'
```

On approval the membership status becomes `active` and the member's `role` is automatically promoted to `member` if it was previously `guest`.

### Reject a pending membership application

```bash
curl -X POST https://<your-domain>/api/memberships/<membership-id>/reject \
  -H "Authorization: Bearer <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Duplicate application — member already holds an active membership"}'
```

### Assign an honorary membership

Honorary memberships are free, immediately active, and not shown in the public membership type listing. Use for board members, lifetime contributors, or special recognition.

```bash
curl -X POST https://<your-domain>/api/memberships/honorary/assign \
  -H "Authorization: Bearer <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"memberEmail": "honoree@example.com", "note": "Awarded at 2025 convention"}'
```

- If no member row exists with that email, the request returns `404` — create the member record first via Supabase Studio.
- If the member already has an active honorary membership, returns `409`.

### Override a membership status directly

For edge cases (payment confirmed outside Stripe, manual correction):

```bash
curl -X PUT https://<your-domain>/api/memberships/<membership-id>/status \
  -H "Authorization: Bearer <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "active", "note": "Payment confirmed via check #4821"}'
```

### Cancel any membership (admin)

```bash
curl -X DELETE https://<your-domain>/api/memberships/<membership-id> \
  -H "Authorization: Bearer <admin-access-token>"
```

Sets status to `cancelled`. Does not trigger a Stripe refund — issue refunds separately via the payments API if needed.

---

## 4. Payments and Refunds

### List all payments

```bash
curl "https://<your-domain>/api/payments?page=1&limit=20" \
  -H "Authorization: Bearer <admin-access-token>"
```

### Issue a refund

```bash
curl -X POST https://<your-domain>/api/payments/<payment-id>/refund \
  -H "Authorization: Bearer <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Member relocated outside USA — ineligible for membership"}'
```

- Triggers a full refund via Stripe.
- Records `refund_reason` and `approved_by` (your admin member ID) in the `payments` table for 501(c)(3) audit trail.
- Partial refunds are not supported via API — use the Stripe Dashboard for partial amounts.

### Verify a payment manually (Stripe Dashboard)

1. Go to `dashboard.stripe.com` → **Payments**
2. Search by email or Stripe payment intent ID
3. Confirm `status = succeeded` and `metadata.memberId` matches the member's ID in your database

### Re-trigger a missed webhook event

If a Stripe webhook delivery failed (e.g., your server was briefly down):

1. Go to Stripe Dashboard → **Developers → Webhooks → your endpoint**
2. Find the failed event in the event log
3. Click **Resend** — this replays the event to your `/api/webhooks/stripe` endpoint

All webhook handlers are idempotent (keyed on `stripe_event_id`) — resending a previously processed event is safe.

---

## 5. Chapter Management

### List all chapters (public — no auth needed)

```bash
curl https://<your-domain>/api/chapters
```

### Create a new chapter

```bash
curl -X POST https://<your-domain>/api/chapters \
  -H "Authorization: Bearer <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "new-england",
    "displayName": "New England Chapter",
    "states": ["MA", "CT", "RI", "ME", "NH", "VT"]
  }'
```

### Update a chapter's display name or states

```bash
curl -X PUT https://<your-domain>/api/chapters/<chapter-id> \
  -H "Authorization: Bearer <admin-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"displayName": "New England Chapter", "states": ["MA", "CT", "RI"]}'
```

### Update a chapter president

Chapter president changes are **not** writable via the API (annual, rare operation). Use Supabase Studio:

1. Go to Supabase Dashboard → **Table Editor → chapters**
2. Find the chapter row by `id`
3. Edit the `president_member_id` field — enter the UUID from the `members` table
4. Save

---

## 6. RLS Policy Setup

Row Level Security (RLS) policies are defence-in-depth against direct database access. They are applied once per environment via SQL and do not need to be repeated unless tables are dropped and recreated.

> **When to apply:** After running `prisma db push` on a fresh Supabase project. Check `Supabase Dashboard → Table Editor → <table> → RLS` to confirm policies are active.

### Check current RLS status

In Supabase Dashboard → **Table Editor**, each table shows a shield icon. Green = RLS enabled. Grey = RLS off (not safe for production).

Alternatively, run in the **SQL Editor**:
```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

### Apply all RLS policies

Run the following in **Supabase Dashboard → SQL Editor** (one block at a time to catch errors):

#### `members` table

```sql
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE members FORCE ROW LEVEL SECURITY;

-- Member reads their own row only
CREATE POLICY members_select_own ON members
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Admin reads all rows
CREATE POLICY members_select_admin ON members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.deleted_at IS NULL
    )
  );

-- Member updates their own row
CREATE POLICY members_update_own ON members
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin updates any row
CREATE POLICY members_update_admin ON members
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.deleted_at IS NULL
    )
  );

-- JIT sync: authenticated user inserts their own row
CREATE POLICY members_insert_jit ON members
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
```

#### `family_members` table

```sql
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

-- Member reads their own family members
CREATE POLICY family_select_own ON family_members
  FOR SELECT TO authenticated
  USING (
    primary_member_id IN (
      SELECT id FROM members WHERE user_id = auth.uid()
    )
  );

-- Member inserts and updates their own family members
CREATE POLICY family_insert_own ON family_members
  FOR INSERT TO authenticated
  WITH CHECK (
    primary_member_id IN (
      SELECT id FROM members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY family_update_own ON family_members
  FOR UPDATE TO authenticated
  USING (
    primary_member_id IN (
      SELECT id FROM members WHERE user_id = auth.uid()
    )
  );

-- Admin full access
CREATE POLICY family_admin ON family_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.user_id = auth.uid() AND m.role = 'admin'
    )
  );
```

#### `chapters` table

```sql
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;

-- Public read (no auth required)
CREATE POLICY chapters_select_public ON chapters
  FOR SELECT TO anon, authenticated
  USING (true);

-- Admin write
CREATE POLICY chapters_write_admin ON chapters
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.user_id = auth.uid() AND m.role = 'admin'
    )
  );
```

#### `payment_records` table

```sql
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;

-- Member reads their own payments
CREATE POLICY payments_select_own ON payment_records
  FOR SELECT TO authenticated
  USING (
    member_id IN (
      SELECT id FROM members WHERE user_id = auth.uid()
    )
  );

-- Admin reads and updates all payments
CREATE POLICY payments_admin ON payment_records
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.user_id = auth.uid() AND m.role = 'admin'
    )
  );
```

### Verify a policy is working

After applying, test that a non-admin user cannot read another member's row:

```bash
# Sign in as a regular member and get their access token
# Then attempt to read a different member's row by ID
curl https://<your-domain>/api/members/<other-member-id> \
  -H "Authorization: Bearer <member-access-token>"
# Expected: 403 Forbidden
```

---

## 7. Content Management (Sanity CMS)

### Accessing Sanity Studio

Sanity Studio is embedded in the application at `/studio`. Only users with a Sanity account that has been granted editor access can publish content.

**To grant a volunteer editor access:**
1. Go to `sanity.io/manage` → your project → **Members**
2. Invite by email → assign role **Editor**
3. The volunteer receives an email invitation to create a Sanity account

### Content types and who manages them

| Content type | Location | Who edits |
|---|---|---|
| Events | Sanity Studio → Events | Volunteer editors |
| News posts | Sanity Studio → News | Volunteer editors |
| Announcements | Sanity Studio → Announcements | Volunteer editors |
| Leadership programme | Sanity Studio → Leadership | Volunteer editors |
| Static pages (About, Members, Activities, Chapters, Publications, Donate) | Sanity Studio → Static Pages | Admin / volunteer editors — see slug reference below |
| Constitution, bylaws | `apps/web/content/*.mdx` files | Developer (requires code deploy) |
| Chapters | Platform API / Supabase Studio | Admin |
| Awards | Platform API (SPEC-5, planned) | Admin |

### Static page slug reference

Each static page in the website fetches its content from Sanity by a fixed slug. To publish content for a page, create a **Static Page** document in Sanity Studio (`/studio`) and set the **Slug** field to exactly the value in the table below.

> The slug must match exactly (case-sensitive, hyphens not underscores). If no Sanity document exists for a slug, the page shows "Coming soon" — it will not error.

#### About Us

| Page | Sanity slug |
|---|---|
| Vision & Mission | `about-vision-mission` |
| Member Rights & Privileges | `about-member-rights` |
| OSA Administration | `about-administration` |
| OSA Committees | `about-committees` |
| Contact Us | `about-contact` |

#### Members

| Page | Sanity slug | Auth required? |
|---|---|---|
| Member Benefits | `members-benefits` | No |
| Policy Documents & Forms | `members-policy` | Yes — logged-in members only |
| Member Search | `members-search` | Yes — logged-in members only |
| BOG Meeting Minutes | `members-bog-minutes` | Yes — logged-in members only |
| Obituary | `obituary` | Yes — logged-in members only |

#### Chapters

| Page | Sanity slug | Auth required? |
|---|---|---|
| Chapter Details | `chapters` | No |
| Chapter Executives | `chapters-executives` | Yes — logged-in members only |
| BOG Documents | `chapters-bog-documents` | Yes — @odishasociety.org email only |

#### Activities

| Page | Sanity slug |
|---|---|
| Annual Convention | `activities-convention` |
| Awards | `activities-awards` |
| Odia Learning | `activities-odia-learning` |
| Odissi Music | `activities-odissi-music` |
| Odisha Development | `activities-odisha-development` |
| OSA Public Library | `activities-library` |
| OSA Higher Education | `activities-higher-education` |
| Professional Networking | `activities-networking` |
| Health & Wellness | `activities-health-wellness` |
| Drama Festival | `activities-drama-festival` |
| Sampark Dori | `activities-sampark-dori` |
| Nilachakra (Kids) | `activities-nilachakra` |
| Women's Forum | `activities-womens-forum` |
| Classified | `activities-classified` |

#### Publications & Utility

| Page | Sanity slug |
|---|---|
| Urmi — Souvenir | `publications-urmi` |
| Utkarsa — Newsletter | `publications-utkarsa` |
| Donate | `donate` |
| About OSA (landing) | `about-us` |

#### How to publish a page for the first time

1. Go to `https://<your-domain>/studio` and sign in with your Sanity account
2. Click **Static Pages** in the left sidebar → **New Static Page**
3. Fill in the **Title** (shown as the page heading on the website)
4. Set the **Slug** field to the exact value from the table above — disable auto-generate if it differs
5. Write the **Body** content using the rich text editor
6. Click **Publish**
7. The live page updates within 60 seconds

---

### Force-revalidate a stale page

Sanity content revalidates automatically every 60 seconds (ISR). If a published change isn't appearing:

1. Wait 60 seconds and hard-refresh the browser (Cmd+Shift+R)
2. If still stale, trigger a manual revalidation by re-publishing the document in Sanity Studio (open → make a trivial edit → publish)
3. If Vercel's cache is stale, go to Vercel Dashboard → your project → **Deployments → Functions** → find the relevant route → **Purge Cache** (or redeploy)

---

## 8. Cron Job and Expiry Reminders

### What the cron job does

The cron job at `GET /api/cron/expiry-reminders` runs daily at 09:00 UTC (configured in `vercel.json`). It:

1. Marks memberships as `expired` where `expiry_date < today` and `member_status = active`
2. Queries members whose membership expires within the next 30 days
3. Sends a reminder email to each expiring member via Resend
4. Sends a summary notification to `ADMIN_NOTIFICATION_EMAIL`

### Trigger the cron job manually

If the scheduled run misfires or you need to run it outside the schedule:

```bash
curl -X GET https://<your-domain>/api/cron/expiry-reminders \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Replace `<CRON_SECRET>` with the value set in your Vercel environment variables.

**Expected response:** `200 OK` with a JSON summary of members expired and reminders sent.

### Check cron execution history

In Vercel Dashboard → your project → **Cron Jobs** — shows the last execution time, status, and response for each scheduled run.

### If reminder emails are not being sent

1. Check `RESEND_API_KEY` is set correctly in Vercel environment variables
2. Check `RESEND_FROM_EMAIL` matches a verified domain in your Resend account
3. Check the Resend dashboard → **Logs** for delivery errors
4. Trigger the cron manually (above) and inspect the response for error details

---

## 9. Stripe Operations

### Switch from test to live mode

Update these two Vercel environment variables for the Production environment (not Preview/Staging):

| Variable | Test value | Live value |
|---|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | `pk_live_...` |
| `STRIPE_SECRET_KEY` | `sk_test_...` | `sk_live_...` |

Redeploy after updating. Stripe test and live modes use separate customer databases — existing test customers do not carry over.

### Rotate the Stripe webhook secret

If the webhook secret is compromised or you register a new endpoint:

1. Go to Stripe Dashboard → **Developers → Webhooks → your endpoint → Reveal signing secret**
2. Copy the new `whsec_...` value
3. Update `STRIPE_WEBHOOK_SECRET` in Vercel environment variables
4. Redeploy (the new secret takes effect immediately after deploy)

### Required webhook events

If you register a new Stripe webhook endpoint (e.g., for a new environment), subscribe to these events:

```
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
```

### Issue a partial refund (not supported by API — use Stripe Dashboard)

1. Go to Stripe Dashboard → **Payments** → find the payment
2. Click **Refund** → enter the partial amount → add a reason
3. Manually update the `payments` table in Supabase Studio to record the refund reason and `approved_by` for the audit trail

---

## 10. Resend and Email Operations

### Verify a sending domain

All outbound email uses the `RESEND_FROM_EMAIL` address (e.g., `noreply@odishasociety.org`). The sending domain must be verified in Resend before production emails will deliver.

1. Go to `resend.com/domains` → **Add domain** → enter `odishasociety.org`
2. Add the DNS records Resend provides (SPF, DKIM, DMARC) to your domain registrar
3. Click **Verify** once DNS has propagated (can take up to 48 hours)

### Check email delivery logs

Go to Resend Dashboard → **Logs** — shows every sent email with delivery status, recipient, subject, and timestamp. Use this to confirm emails are reaching members or to diagnose delivery failures.

### Resend rate limits

Resend's default rate limits depend on your plan. If the cron job sends reminders to many members simultaneously and you hit a rate limit:
- Upgrade your Resend plan, or
- Add a delay between sends in `apps/web/app/api/cron/expiry-reminders/route.ts`

---

## 11. Database Operations

All database commands below should be run from the repository root with `DATABASE_URL` and `DIRECT_URL` pointing to the target Supabase project.

### Re-seed reference data

Safe to run at any time — all seed operations use `upsert` (idempotent):

```bash
# From the repo root, with correct env vars set
cd apps/web
pnpm prisma:seed
```

**When to re-seed:**
- Membership fee prices change (update `prisma/seed.ts` first, then re-seed)
- A new chapter is added to the official OSA chapter list
- An award category is added or renamed

### Push a schema change to production

```bash
# From apps/web/, with DIRECT_URL pointing to production
pnpm prisma:push
```

> Always run `prisma db push` on staging first and verify before applying to production.

### Open Prisma Studio (visual DB browser)

For local exploration only — never run Prisma Studio pointed at production through a local tunnel:

```bash
cd apps/web
pnpm prisma:studio
```

For production data inspection, use **Supabase Dashboard → Table Editor** instead.

### Take a manual database backup

Supabase automatically backs up your database daily (Pro plan and above). To take a manual snapshot:

1. Go to Supabase Dashboard → **Database → Backups**
2. Click **Create backup** — produces a `.sql` dump downloadable from the dashboard

---

## 12. Monitoring and Troubleshooting

### Check application logs

**Vercel:** Project → **Deployments → Functions** — shows real-time logs for each API route invocation. Filter by route path or error level.

**Supabase:** Dashboard → **Logs → API** — shows all requests hitting the PostgREST / Auth APIs directly (bypasses Next.js).

### Common issues and fixes

| Symptom | Likely cause | Fix |
|---|---|---|
| Login redirects to `/login` in a loop | `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` misconfigured | Verify env vars in Vercel dashboard and redeploy |
| API returns 401 for a valid admin token | Token expired (1-hour TTL) | Re-authenticate and get a fresh token |
| Stripe webhook returns 400 | `STRIPE_WEBHOOK_SECRET` mismatch | Rotate webhook secret (see §9) |
| Cron job returns 401 | `CRON_SECRET` mismatch between request and env var | Verify `CRON_SECRET` in Vercel env vars |
| Sanity Studio shows CORS error | App domain not in Sanity CORS origins | Add domain in `sanity.io/manage → API → CORS Origins` |
| Expiry emails not sending | Resend domain not verified or rate limit hit | Check Resend Logs dashboard |
| Member can read another member's data via Supabase Studio psql | RLS not applied | Run §6 RLS policy SQL in Supabase SQL Editor |
| `prisma db push` fails on production | Direct connection required (not pooler) | Ensure `DIRECT_URL` uses port 5432, not 6543 |

### Verify RLS is active in production

Run this in **Supabase Dashboard → SQL Editor**:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('members', 'family_members', 'chapters', 'payment_records')
ORDER BY tablename;
```

All four rows should show `rowsecurity = true`. If any show `false`, apply the policies in §6.

---

*Last updated: 2026-05-17 · Maintainer: platform admin*
