# Deployment Manual

This document is a step-by-step runbook for deploying the OSA platform to a **Staging** (integrated test) environment and a **Production** environment. Follow each section in order for a first-time deployment.

> **Security note:** This document contains no secrets or credentials. All sensitive values are referenced by name and location only. Never commit actual keys, passwords, or tokens to this repository.

---

## Environment Overview

| | Staging | Production |
|---|---|---|
| Purpose | QA and integration testing | Live member-facing site |
| Supabase project | Separate project (`osa-staging`) | Separate project (`osa-production`) |
| Stripe mode | Test keys (`sk_test_...`) | Live keys (`sk_live_...`) |
| Vercel | Preview deployment | Production deployment |
| Domain | `staging.odishasociety.org` or Vercel preview URL | `odishasociety.org` |
| Email sending | Resend test mode | Resend production mode |

Use **separate Supabase projects** for staging and production. Never point staging at production data.

---

## Step 1 — Create Supabase Cloud Projects

Do this twice — once for staging, once for production.

1. Go to `https://supabase.com/dashboard` → **New project**
2. Name: `osa-staging` / `osa-production`
3. Choose a strong database password — store it in your team's password manager (never in this repo)
4. Region: choose closest to your users (e.g. `us-east-1`)
5. Once created, go to **Settings → API** and note:
   - **Project URL** → used as `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → used as `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role secret key** → used as `SUPABASE_SERVICE_ROLE_KEY` (never expose to client)

---

## Step 2 — Configure Supabase Auth (Dashboard — Manual)

These settings are **not** pushed by the CLI. Do this in each Supabase project dashboard.

### 2a. URL Configuration
**Auth → URL Configuration**

| Field | Staging value | Production value |
|-------|--------------|-----------------|
| Site URL | `https://<staging-domain>` | `https://odishasociety.org` |
| Redirect URLs | See list below | See list below |

Add each of these as separate redirect URL entries:
```
https://<your-domain>/auth/confirm
https://<your-domain>/auth/reset-password
```

### 2b. Enable Email Provider
**Auth → Providers → Email**

| Setting | Value |
|---------|-------|
| Enable email signup | ✅ On |
| Confirm email | ✅ On |
| Minimum password length | 8 |
| Secure password change | ✅ On |

### 2c. Configure Google OAuth
**Auth → Providers → Google**

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add authorised redirect URI: `https://<your-supabase-project-ref>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client Secret** into the Supabase Google provider settings
5. Enable the provider

> Use separate Google OAuth credentials for staging and production.

### 2d. Configure SMTP for Email Sending (Production only)
**Auth → SMTP Settings**

Use Resend as the SMTP provider so emails come from `noreply@odishasociety.org`:

| Field | Value |
|-------|-------|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Your Resend API key (from Resend dashboard) |
| Sender email | `noreply@odishasociety.org` |
| Sender name | `OSA Community Platform` |

> Staging can use Supabase's built-in email service (limited to 3 emails/hour) or a separate Resend test key.

---

## Step 3 — Run Database Migrations

`prisma generate` runs **automatically** on every Vercel deploy (via the `postinstall` and `build` scripts). You do not need to run it manually.

Schema push and seed are **one-time operations** per environment. Run the setup script from the repository root with `DIRECT_URL` pointing to the target Supabase project:

```bash
# First-time setup: push schema + generate client + seed reference data
./scripts/db-setup.sh

# Schema changed but data already seeded:
./scripts/db-setup.sh --schema

# Re-seed reference data only (e.g. membership fee price update):
./scripts/db-setup.sh --seed
```

> Ensure `DATABASE_URL` and `DIRECT_URL` in `apps/web/.env.local` (or your shell env) point to the correct cloud project before running.

See [On-Demand Database Operations](#on-demand-database-operations) for when to re-run seed after initial deployment.

---

## Step 4 — Create Supabase Storage Buckets (Manual)

**Storage → New bucket** — create the following in each project:

| Bucket name | Public | Purpose |
|-------------|--------|---------|
| `award-photos` | ✅ Public | Award recipient photos |

---

## Step 5 — Configure Stripe

### Staging
Use Stripe **test mode** keys throughout. Go to `dashboard.stripe.com` → toggle to **Test mode**:
- **Publishable key** starts with `pk_test_`
- **Secret key** starts with `sk_test_`

### Production
Use Stripe **live mode** keys. Go to `dashboard.stripe.com` → toggle to **Live mode**:
- **Publishable key** starts with `pk_live_`
- **Secret key** starts with `sk_live_`

### Stripe Webhook
For each environment, register a webhook endpoint in the Stripe dashboard:

**Developers → Webhooks → Add endpoint**

| Field | Value |
|-------|-------|
| Endpoint URL | `https://<your-domain>/api/webhooks/stripe` |
| Events to listen to | `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` |

Copy the **Webhook signing secret** (starts with `whsec_`) — used as `STRIPE_WEBHOOK_SECRET`.

---

## Step 6 — Configure Sanity CMS

1. Go to `sanity.io/manage` → create a project (or use existing)
2. Note the **Project ID** and **Dataset** name
3. Create an **API token** with Editor permissions: Settings → API → Tokens → Add API token

### 6a. Add CORS Origins (required for Sanity Studio to load)

Sanity Studio runs inside your Next.js app at `/studio`. For it to communicate with the Sanity API, your app's URL must be whitelisted as a CORS origin.

Go to **`sanity.io/manage` → your project → API → CORS Origins → Add CORS origin** and add each URL below. **Enable "Allow credentials"** for each entry.

| Environment | URL to add | Allow credentials |
|-------------|-----------|-------------------|
| Local development | `http://localhost:3000` | ✅ Yes |
| Staging | `https://<your-staging-domain>` | ✅ Yes |
| Production | `https://odishasociety.org` | ✅ Yes |

> **Symptom if missing:** Sanity Studio loads but shows the message _"To access your content you need to add the following URL as a CORS origin to your Sanity project"_. Add the URL shown in that message and reload.

| Variable | Where to find |
|----------|--------------|
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | Sanity manage → Project settings |
| `NEXT_PUBLIC_SANITY_DATASET` | Sanity manage → Datasets (usually `production`) |
| `SANITY_API_TOKEN` | Sanity manage → API → Tokens |

---

## Step 7 — Deploy to Vercel

### 7a. Connect repository
1. Go to `vercel.com` → **Add New Project**
2. Import from GitHub: `utkaln/membership-event-registration`
3. Set **Root Directory** to `apps/web`
4. Framework preset: **Next.js** (auto-detected)

### 7b. Set environment variables
In Vercel → Project → Settings → Environment Variables, add each variable and set its **Environment** scope (Staging = Preview, Production = Production).

The full variable list — where to find each value and whether it's safe to expose to the client — is maintained as a single source of truth in the **[Admin Operations Manual — §14 Deployment to Vercel and Environment Variables](./admin-operations-manual.md#14-deployment-to-vercel-and-environment-variables)**. Use that table when provisioning a new environment so it doesn't drift out of sync with this runbook.

### 7c. Trigger deployment
Push to `main` branch → Vercel auto-deploys to production. Any other branch creates a Preview deployment (staging).

---

## Step 8 — Post-Deployment Verification

Run through these checks after each environment deployment:

### Auth
- [ ] Google OAuth login completes and redirects to dashboard
- [ ] Email/password registration sends a verification email (check inbox or Resend dashboard)
- [ ] Unverified user cannot log in
- [ ] Verified user can log in
- [ ] Forgot password flow sends reset email and allows setting new password

### API
- [ ] `GET /api/auth/me` with a valid token returns the member record
- [ ] `GET /api/awards` returns award data (public, no auth)
- [ ] `POST /api/messages` with a valid token creates a message record

### Payments
- [ ] Stripe checkout session creates successfully
- [ ] Test webhook: `stripe trigger checkout.session.completed --override checkout_session:metadata.memberId=<test-id>` (staging only, requires Stripe CLI)

### CMS
- [ ] `/studio` loads without a CORS error (if it does, add the domain to Sanity CORS origins per Step 6a)
- [ ] `/events` page loads and shows Sanity content
- [ ] Publishing a test event in Sanity Studio reflects on the site within 60 seconds

### Email
- [ ] Send a test message between two members — relay email arrives via Resend

---

## Staging vs Production Checklist

Before promoting staging to production, confirm:

- [ ] All post-deployment verification checks pass on staging
- [ ] Stripe keys switched from test (`sk_test_`) to live (`sk_live_`)
- [ ] Production domain configured in Supabase Auth redirect URLs
- [ ] Production domain added to Sanity CORS origins
- [ ] Resend SMTP configured with production sending domain
- [ ] `CRON_SECRET` is a unique value (different from staging)
- [ ] RLS policies verified — member cannot read another member's data

---

## On-Demand Database Operations

Use the `db-setup.sh` script any time you need to push schema changes or re-seed reference data outside of the normal deploy flow. Always run from the repository root with env vars pointing to the target environment.

### When to re-seed

| Trigger | Command |
|---------|---------|
| First-time environment setup | `./scripts/db-setup.sh` |
| Schema changed (new fields, models, enums) | `./scripts/db-setup.sh --schema` |
| Membership fee price updated in `seed.ts` | `./scripts/db-setup.sh --seed` |
| New chapter or award name added to `seed.ts` | `./scripts/db-setup.sh --seed` |
| Full reset (⚠️ wipes data) | `npx prisma migrate reset` then `./scripts/db-setup.sh` |

### Targeting a specific environment

Set `DATABASE_URL` and `DIRECT_URL` before running:

```bash
# Example: seed production
DATABASE_URL="postgresql://..." DIRECT_URL="postgresql://..." ./scripts/db-setup.sh --seed

# Or export from a .env file
export $(grep -v '^#' apps/web/.env.production | xargs)
./scripts/db-setup.sh --seed
```

### Safe to re-run

All seed operations use `upsert` — running seed multiple times on the same database is safe and idempotent. It will not create duplicate rows or overwrite manually-edited data in other tables.

---

## Rolling Back a Deployment

**Vercel:** Go to Project → Deployments → find the last good deployment → **Promote to Production**

**Database schema:** Prisma does not auto-rollback. If a migration causes issues:
```bash
# Inspect what changed
npx prisma migrate status

# Roll back manually by reverting the schema change and pushing
npx prisma db push
```

> Always test schema changes on staging before applying to production.
