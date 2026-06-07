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
13. [Local Development Setup](#13-local-development-setup)
14. [Deployment to Vercel and Environment Variables](#14-deployment-to-vercel-and-environment-variables)

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
| Static pages (About, Members, Events, Programs, Chapters, Publications, Admin, Donate, Home) | Sanity Studio → Static Pages | Admin / volunteer editors — see [`docs/content-author-guide.md`](./content-author-guide.md) for the full slug reference and the content-driven vs. code-driven distinction |
| Constitution, bylaws | `apps/web/content/*.mdx` files | Developer (requires code deploy) |
| Chapters | Platform API / Supabase Studio | Admin |
| Awards | Platform API (SPEC-5, planned) | Admin |

### Two kinds of menus — know which one you're editing

Since the **SPEC-15 navigation redesign** (2026-06-07), the site has two fundamentally different ways a page ends up under a menu — admins should understand this distinction before granting editor access or fielding "why isn't my page showing up" questions:

1. **Content-driven (Programs menu only)** — the menu itself is generated live from Sanity: any `static_page` document with `section: "programs"` automatically appears in the Programs dropdown, ordered by its `sort_order`, linking to `/programs/<slug>`. **No code change is ever needed** to add, remove, reorder, or relabel a Programs entry — it's a pure content-authoring operation.
2. **Code-driven (every other menu)** — About Us, Members, Events, Chapters, Publications, Admin, Donate, and the Home page sections are all hardcoded in `apps/web/app/components/nav-bar.tsx` (and `app/page.tsx` for the home page). The menu structure, labels, and target routes are fixed in code. A content author can only fill in the **content** of those fixed pages — by creating a `static_page` doc whose `slug` exactly matches the value the page is hard-wired to look up. Adding a brand-new item to one of these menus requires a developer (a small spec/code change), not a Studio operation.

The full slug reference table and step-by-step authoring instructions for both cases live in **[`docs/content-author-guide.md`](./content-author-guide.md)** — that's the canonical doc to hand to volunteer editors. It is kept in sync with `apps/web/app/components/nav-bar.tsx`; if the nav is ever restructured again, update both.

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

## 13. Local Development Setup

This is the canonical reference for running the project on a developer machine. (`README.md` links here instead of duplicating these steps — keep this section in sync if the setup flow changes.)

### Prerequisites

| Tool | Required version | Purpose |
|---|---|---|
| Node.js | v20+ | Runtime |
| pnpm | v11+ | Package manager (monorepo workspaces) |
| Docker Desktop | latest | Runs the local Supabase stack |
| Supabase CLI | v2.0+ | Local Postgres + Auth + Studio + Mailpit |
| Stripe CLI | latest (optional) | Webhook testing |

```bash
# Verify all tools
echo "Node:     $(node --version)"
echo "pnpm:     $(pnpm --version)"
echo "Docker:   $(docker --version)"
echo "Supabase: $(supabase --version)"
```

### Initial setup (once)

```bash
git clone <repo-url>
cd membership-event-registration
pnpm install

# Start local Supabase (PostgreSQL + Auth + Studio + Mailpit)
supabase start

# Configure environment — fill in the values printed by `supabase status`
cp apps/web/.env.example apps/web/.env.local

# Push schema and seed reference data
cd apps/web
npx prisma db push
npx prisma db seed
cd ../..
```

### Running and verifying

```bash
pnpm dev   # starts Next.js on http://localhost:3000
```

| Service | URL |
|---|---|
| Frontend + API | http://localhost:3000 |
| Supabase Studio | http://127.0.0.1:54323 |
| Mailpit (email) | http://127.0.0.1:54324 |

```bash
curl http://localhost:3000
curl http://localhost:3000/api/memberships/types

cd apps/web && npx prisma studio   # visual DB browser on :5555
```

### `.env` vs `.env.local` vs `.env.example` — what each file is for

The `apps/web/` directory contains three env-related files that are easy to confuse:

| File | Loaded by | Committed to git? | Purpose |
|---|---|---|---|
| `.env.example` | Nothing at runtime — it's a template | ✅ Yes (placeholder values only, no secrets) | Lists every variable the app needs. New developers `cp` it to `.env.local` and fill in real values. |
| `.env.local` | Next.js, at dev/build/runtime (`pnpm dev`, `pnpm build`, `pnpm start`) | ❌ No — gitignored | Your real local secrets and connection strings: Supabase keys, Sanity tokens, Stripe test keys, Resend keys, etc. |
| `.env` | **The Prisma CLI only** (`prisma db push`, `prisma migrate`, `prisma db seed`, `prisma studio`) | ❌ No — gitignored | Must contain `DATABASE_URL` and `DIRECT_URL`. Prisma's CLI loader reads `.env`, not `.env.local`, so these two values are duplicated here. |

> **Why this matters:** if you change your database connection string, update it in **both** `.env.local` (so the running app connects correctly) and `.env` (so `prisma db push` / `prisma studio` / `prisma db seed` connect to the same database). Forgetting `.env` is a common cause of "my migration ran but the app still shows old data."

---

## 14. Deployment to Vercel and Environment Variables

> For the full first-time environment provisioning runbook — creating Supabase cloud projects, configuring Auth, Stripe, Sanity, and storage buckets — see [`deployment-manual.md`](./deployment-manual.md). This section is the canonical reference for **Vercel-specific operations**: connecting the repo, the environment variable list, triggering deploys, and rolling back. (`deployment-manual.md` links here for the variable table instead of duplicating it.)

### Connecting the repository

1. Go to `vercel.com` → **Add New Project**
2. Import the repository from GitHub
3. Set **Root Directory** to `apps/web`
4. Framework preset: **Next.js** (auto-detected)

### Environment variables reference

Set these in **Vercel → Project → Settings → Environment Variables**. Scope each one to **Preview** (staging) and/or **Production** as appropriate — staging and production point at separate Supabase/Stripe/Sanity/Resend projects (see `deployment-manual.md` Environment Overview).

| Variable | Where to find | Expose to client? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | ✅ Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon key | ✅ Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key | ❌ Server only |
| `DATABASE_URL` | Supabase → Settings → Database → Connection string → Pooling (port 6543) + `?pgbouncer=true` | ❌ Server only |
| `DIRECT_URL` | Supabase → Settings → Database → Connection string → Direct (port 5432) | ❌ Server only |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | Sanity manage → Project settings | ✅ Yes |
| `NEXT_PUBLIC_SANITY_DATASET` | Sanity manage → Datasets | ✅ Yes |
| `SANITY_API_TOKEN` | Sanity manage → API → Tokens | ❌ Server only |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys | ❌ Server only |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard → Developers → Webhooks → signing secret | ❌ Server only |
| `RESEND_API_KEY` | Resend dashboard → API keys | ❌ Server only |
| `RESEND_FROM_EMAIL` | Your verified sender domain, e.g. `noreply@odishasociety.org` | ❌ Server only |
| `RESEND_ORG_NAME` | Full legal org name, e.g. `The Odisha Society of the Americas` | ❌ Server only |
| `RESEND_ORG_EIN` | IRS EIN number, e.g. `12-3456789` (used on charity receipts) | ❌ Server only |
| `ADMIN_NOTIFICATION_EMAIL` | Email address that receives membership expiry alerts | ❌ Server only |
| `NEXT_PUBLIC_SITE_URL` | Full site URL, e.g. `https://odishasociety.org` (no trailing slash) | ✅ Yes |
| `CRON_SECRET` | Generate with `openssl rand -base64 32` — store in password manager | ❌ Server only |

> **Never** set `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, or `SANITY_API_TOKEN` as `NEXT_PUBLIC_` variables — that exposes them to every visitor's browser. Variables marked "✅ Yes" are safe for client exposure by design (anon/public keys); everything else must stay server-only.

### Triggering a deployment

Push to the `main` branch → Vercel auto-deploys to **Production**. Pushing any other branch creates a **Preview** deployment (used for staging).

### Rolling back a deployment

Go to **Project → Deployments**, find the last good deployment, and click **Promote to Production**.

> Database schema changes are **not** auto-rolled-back by Prisma — see [§11 Database Operations](#11-database-operations) for manually reverting a schema change.

---

*Last updated: 2026-06-07 · Maintainer: platform admin*
