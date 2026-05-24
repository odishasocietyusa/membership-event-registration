# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ⚠️ IMPORTANT: Spec-Driven Development

**This project uses a spec-driven development workflow.** Before implementing any feature:

1. **Check for existing specs** in `specs/active/`
2. **Create a new spec** if one doesn't exist (use template in `specs/templates/`)
3. **Follow the 4-phase agent workflow:**
   - Phase 1: **Analyst** → `01-analysis.md`
   - Phase 2: **Architect** → `02-design.md`
   - Phase 3: **Implementer** → `03-implementation.md`
   - Phase 4: **QA** → `04-qa-report.md`

📖 **Full documentation:** See `specs/README.md` and the [Spec-Driven Development Workflow](#spec-driven-development-workflow) section below.

---

## Project Overview

OSA Community Platform — a full-stack membership and event management system for The Odisha Society of the Americas. Single Next.js application (App Router) with API routes, Supabase Auth, Prisma ORM, Stripe payments, and Sanity CMS.

📐 **Architecture reference:** See [`docs/osa-architecture.md`](docs/osa-architecture.md) for the target system design — stack, user roles, data flows, database schema (Supabase), CMS schema (Sanity), and content boundaries.

**Key Features:**
- Membership application & approval workflow
- Honorary memberships with admin override capabilities
- Event registration with waitlist management (planned)
- Supabase Auth (email/password + Google OAuth)
- Stripe payment integration
- Role-based access control (`member`, `admin`)

## Tech Stack

- **Framework**: Next.js 15.1.4 — App Router, React 19, Tailwind CSS
- **API**: Next.js Route Handlers (`app/api/**`) — no separate backend server
- **Database**: PostgreSQL via Supabase (local: port 54322)
- **ORM**: Prisma 6.2.0 (schema + seed at `apps/web/prisma/`)
- **Auth**: Supabase Auth (email/password + Google OAuth)
- **CMS**: Sanity (content for events, news, announcements, static pages)
- **Payments**: Stripe
- **Monorepo**: Turborepo 2.3.3 + pnpm
- **Testing**: Jest (unit), Playwright (e2e — browser + API)
- **Package Manager**: pnpm (required — NOT npm or yarn)

## Monorepo Structure

```
membership-event-registration/
├── specs/                          # 📋 SPEC-DRIVEN DEVELOPMENT
│   ├── templates/                  # Templates for specs and agent artifacts
│   ├── active/                     # Specs currently being implemented
│   ├── completed/                  # Successfully implemented specs
│   └── artifacts/                  # Agent outputs (analysis, design, impl, qa)
├── apps/
│   ├── web/                        # Next.js app (port 3000) — frontend + API
│   │   ├── app/
│   │   │   ├── api/                # Route Handlers (all backend logic lives here)
│   │   │   │   ├── auth/           # /api/auth/me, /api/auth/callback, /api/auth/signout
│   │   │   │   ├── members/        # /api/members/me, /api/members/[id], family, search
│   │   │   │   ├── memberships/    # /api/memberships, /api/memberships/me, types, approve…
│   │   │   │   ├── payments/       # /api/payments/me, checkout-session, upgrade-session…
│   │   │   │   ├── messages/       # /api/messages
│   │   │   │   ├── chapters/       # /api/chapters
│   │   │   │   ├── admin/          # /api/admin/link-member
│   │   │   │   ├── cron/           # /api/cron/expiry-reminders
│   │   │   │   └── webhooks/       # /api/webhooks/stripe
│   │   │   ├── (pages)/            # All UI pages (login, register, dashboard, admin…)
│   │   │   └── layout.tsx
│   │   ├── lib/                    # Service layer (called by route handlers)
│   │   │   ├── auth/               # withAuth helper, Supabase server/browser/admin clients
│   │   │   ├── db/                 # Prisma singleton
│   │   │   ├── members/            # member-service.ts
│   │   │   ├── memberships/        # membership-service.ts
│   │   │   ├── payments/           # payment-service.ts, stripe.ts, webhook-handlers.ts
│   │   │   ├── messaging/          # message-service.ts, resend.ts
│   │   │   └── validation/         # Zod schemas for all request bodies
│   │   ├── e2e/                    # Playwright e2e tests
│   │   │   ├── global-setup.ts     # Creates test user, stores token + browser auth
│   │   │   ├── global-teardown.ts  # Deletes test user
│   │   │   ├── public.spec.ts      # Public page renders
│   │   │   ├── auth.spec.ts        # Login form + middleware redirect
│   │   │   ├── register.spec.ts    # Registration form validation
│   │   │   ├── api.spec.ts         # API route tests (public + authed + 401 checks)
│   │   │   ├── dashboard.spec.ts   # Authenticated dashboard
│   │   │   ├── memberships.spec.ts # Membership apply/cancel/history
│   │   │   └── payments.spec.ts    # Payment routes
│   │   ├── prisma/
│   │   │   ├── schema.prisma       # Database schema (all models)
│   │   │   └── seed.ts             # Seed data (membership fee tiers)
│   │   ├── sanity/                 # Sanity client, schemas, queries
│   │   └── middleware.ts           # Auth redirect gate (cookie check)
│   └── supabase/                   # Local Supabase config (config.toml)
├── packages/
│   ├── shared-types/               # Shared TypeScript types
│   ├── validation/                 # Zod validation schemas
│   └── config/                     # Shared ESLint, TypeScript, Tailwind configs
├── scripts/                        # 🛠️ UTILITY SCRIPTS
│   ├── claude-session-report.py    # Track Claude Code usage & costs
│   ├── session-report.sh           # Quick wrapper for session report
│   ├── get-auth-token.sh           # Generate Supabase auth tokens for manual testing
│   └── get-auth-token.ts           # TypeScript version (npx tsx scripts/get-auth-token.ts)
├── docs/                           # Architecture reference
└── turbo.json                      # Turborepo task configuration
```

## Common Development Commands

### Initial Setup

```bash
# Install dependencies (always use pnpm)
pnpm install

# Start local Supabase (required for database + auth)
supabase start

# Push database schema and seed data
cd apps/web
npx prisma db push
npx prisma db seed
cd ../..
```

### Development

```bash
# Start Next.js (single server — handles both UI and API)
pnpm dev                      # from root (Turborepo)
pnpm dev --filter=web         # or target web app directly

# Build
pnpm build
pnpm build --filter=web

# Lint / format
pnpm lint
pnpm format
```

### Testing

#### Playwright E2E Tests
Tests run against the live Next.js server on port 3000. Playwright auto-starts the server.

```bash
# Run all e2e tests (from apps/web/ or use --filter)
pnpm --filter=web test:e2e

# Interactive UI mode (recommended for debugging)
pnpm --filter=web test:e2e:ui

# Debug mode (step through each action)
pnpm --filter=web test:e2e:debug

# Run a single spec file
cd apps/web && npx playwright test e2e/memberships.spec.ts

# If Next.js is already running on port 3000, Playwright reuses it automatically
```

**Test files (`apps/web/e2e/`):**
- `public.spec.ts` — public page renders
- `auth.spec.ts` — login form + middleware redirect
- `register.spec.ts` — registration flow validation
- `api.spec.ts` — public API routes + 401 checks + authenticated member routes
- `dashboard.spec.ts` — authenticated dashboard
- `memberships.spec.ts` — membership apply, status, history, cancel
- `payments.spec.ts` — payment listing, checkout-session validation

**Test projects:**
- `guest` — runs without auth (public.spec, auth.spec, register.spec, api.spec)
- `member` — runs with stored browser auth state (dashboard.spec, memberships.spec, payments.spec)

#### Unit Tests (Jest)
```bash
# Run unit tests
pnpm --filter=web test

# Watch mode
cd apps/web && pnpm test -- --watch

# Coverage
pnpm --filter=web test:coverage
```

Unit test files live next to source files as `*.test.ts`.

#### Get a Token for Manual API Testing
```bash
# Create a temp test user and print their JWT
./scripts/get-auth-token.sh

# Use an existing account
./scripts/get-auth-token.sh you@example.com YourPassword

# Then test an API route:
curl http://localhost:3000/api/members/me \
  -H "Authorization: Bearer <token>"
```

## Testing & Database Troubleshooting

### Common Issues

#### ❌ Playwright Timeout (120s)

**Problem:** `Error: Timed out waiting 120000ms from config.webServer.`

**Solution:** Run Next.js manually to see the real error:
```bash
cd apps/web
pnpm dev
# Look for: missing env vars, Prisma client not generated, Supabase not running
```

---

#### ❌ `globalSetup` fails — test user not created

**Problem:** Tests fail with `.auth/test-user.json` not found.

**Solution:** Supabase must be running before `pnpm test:e2e`:
```bash
supabase start
pnpm --filter=web test:e2e
```

---

#### ❌ PostgreSQL Collation Version Mismatch

**Problem:**
```
ERROR: template database "template1" has a collation version mismatch
```

**Solution:**
```bash
supabase stop --no-backup
supabase start
cd apps/web
npx prisma db push
npx prisma db seed
```

---

#### ❌ Prisma Migration Errors (Type Does Not Exist)

**Problem:** `ERROR: type "MembershipStatus" does not exist`

**Solution:** Use `db push` (not `migrate`) for local dev — it reads the full schema at once:
```bash
cd apps/web
npx prisma db push
```

### Quick Start Checklist

1. `supabase start`
2. Verify `apps/web/.env.local` has `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `DATABASE_URL`
3. `cd apps/web && npx prisma db push && npx prisma db seed`
4. `pnpm --filter=web test:e2e`

### Database (Prisma)

```bash
# All Prisma commands run from apps/web/

cd apps/web

# Generate Prisma Client (after schema changes)
npx prisma generate

# Push schema to local DB (preferred over migrate for local dev)
npx prisma db push

# Seed the database
npx prisma db seed

# Reset database (⚠️ deletes all data)
npx prisma migrate reset

# Open Prisma Studio (visual DB browser)
npx prisma studio

# Format schema file
npx prisma format
```

### Supabase

```bash
supabase start      # start local stack
supabase stop       # stop
supabase status     # show keys + URLs

# Local service URLs:
# Studio:     http://127.0.0.1:54323
# Auth API:   http://127.0.0.1:54321
# Mailpit:    http://127.0.0.1:54324
# PostgreSQL: localhost:54322
```

### Utility Scripts

#### Claude Code Session Report
```bash
python3 scripts/claude-session-report.py   # full report
./scripts/session-report.sh                # quick wrapper
```
Report saved to `.claude-session-report.txt` (git-ignored).

#### Get Supabase Auth Token (manual API testing)
```bash
./scripts/get-auth-token.sh                          # creates temp user
./scripts/get-auth-token.sh user@example.com Pass1!  # existing user
```

### Clean Up

```bash
pnpm clean                        # clear build artifacts
supabase stop --all               # stop + remove containers
docker system prune -f
```

## Architecture Patterns

### Route Handler + Service Layer

All API logic follows a two-layer pattern:

```
app/api/<feature>/route.ts      ← HTTP layer: auth check, parse body, call service, return Response
lib/<feature>/<feature>-service.ts  ← Business logic: Prisma queries, domain rules
lib/validation/<feature>.schema.ts  ← Zod schemas for request body validation
```

Example:
```typescript
// app/api/memberships/route.ts
export const POST = withAuth(async (req, { user }) => {
  const parsed = ApplyMembershipSchema.safeParse(await req.json())
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })
  const membership = await applyForMembership(user.id, parsed.data.membershipType)
  return jsonResponse(201, { membership })
})

// lib/memberships/membership-service.ts
export async function applyForMembership(userId: string, type: MembershipType) {
  // Prisma query + domain rules
}
```

### Authentication & Authorization

Requests are authenticated via Supabase JWTs passed as `Authorization: Bearer <token>`.

- **`withAuth(handler)`** — validates the JWT, injects the `user` object, returns 401 if missing/invalid
- **`withAuth(handler, { role: 'admin' })`** — additionally requires `user.role === 'admin'`, returns 403 otherwise
- **`middleware.ts`** — lightweight cookie check that redirects unauthenticated browser requests to `/login`

**User Roles:**
- `member` — default after registration; can apply for membership, manage profile
- `admin` — full access to all admin endpoints

### Prisma Schema Organization (`apps/web/prisma/schema.prisma`)

Organized into domains:
1. **Member domain** — `Member`, `FamilyMember`
2. **Membership domain** — `MembershipFee` (types/pricing), membership status fields on `Member`
3. **Payment domain** — `PaymentRecord`
4. **Message domain** — `Message`
5. **Chapter domain** — `Chapter`
6. **Content domain** (Sanity) — managed externally; schema lives in `sanity/schemas/`

### Database Triggers (Supabase Functions)

- **Auth User Sync** — auto-creates a `Member` record when a user signs up via Supabase Auth

### Honorary Memberships

Admin-only: assign a free membership directly via `POST /api/memberships/honorary/assign`. No payment required; member is immediately active.

### Credit System

Expired memberships accrue credit toward renewal if within 365 days. Stored as `creditAmount` / `creditExpiresAt` on the `Member` record; applied at checkout.

## Environment Variables

All env vars live in `apps/web/.env.local`. See `apps/web/.env.example` for the full list.

```bash
# Supabase (public — safe for client)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from: supabase status → anon key>

# Supabase (server-only)
SUPABASE_SERVICE_ROLE_KEY=<from: supabase status → service_role key>

# Database (for Prisma)
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Stripe (optional for local dev — checkout routes return 500 without it)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Cron protection
CRON_SECRET=your-secret-here
```

Get Supabase values: `supabase status`

## Important Notes

### Package Manager
- **Always use `pnpm`** — npm/yarn will break workspace linking

### Running Commands
- Monorepo-level (turbo): run from **root**
- Prisma commands: run from **`apps/web/`**
- E2E tests: run from **`apps/web/`** or use `pnpm --filter=web test:e2e` from root

### Database Migrations
- Use `npx prisma db push` for local dev (not `prisma migrate dev`)
- Run migrations in CI/production via `prisma migrate deploy`
- Seed data is version-controlled in `prisma/seed.ts`

### Testing Best Practices
- Playwright creates/tears down a real test user in `globalSetup` / `globalTeardown`
- Auth token stored in `.auth/test-user.json`; browser state in `.auth/user.json`
- Admin-only routes are covered by `test.skip()` — require out-of-band DB role promotion
- Stripe tests assert `200 || 500` — 500 is acceptable when no Stripe key is configured locally

### Code Quality
- TypeScript strict mode
- Zod for all request body validation (in `lib/validation/`)
- ESLint + Prettier configured
- No `any` types in route handlers or service layer

### Common Pitfalls
1. **Supabase not running** — `supabase start` before `pnpm dev` or `test:e2e`
2. **Missing Prisma Client** — `cd apps/web && npx prisma generate` after schema changes
3. **Stale Turbo cache** — `pnpm clean` if builds seem outdated
4. **Port 3000 conflict** — stop the dev server and let Playwright start it, or it auto-reuses

## Current Implementation Status

- **Foundation** ✅ — Turborepo monorepo, Supabase local stack, Prisma schema, Sanity CMS
- **Backend API** ✅ — All route handlers in `app/api/`: auth, members, memberships, payments, messages, chapters, webhooks, cron
- **Authentication** ✅ — Email/password + Google OAuth via Supabase; `withAuth` guard; middleware redirect
- **Frontend pages** ✅ — Login, register (multi-step), dashboard, profile, membership, admin panel, public content pages
- **E2E test suite** ✅ — Playwright: ~66 tests across 7 spec files (public, auth, register, API, dashboard, memberships, payments)
- **Unit tests** ✅ — Jest: service layer, auth utilities, webhook handlers
- **CMS integration** ✅ — Sanity for events, news, announcements, static pages
- **Payments** ✅ — Stripe checkout + upgrade sessions, webhook handler, receipt generation
- **Events module** 📋 — Planned

See `docs/osa-architecture.md` for system architecture and `specs/active/` for active feature specs.

---

## Spec-Driven Development Workflow

This project uses a **spec-driven development** approach. All features should be implemented through the following 4-phase agent workflow.

### Overview

```
User creates spec → Analyst → Architect → Implementer → QA → User approves
                      ↓           ↓            ↓          ↓
                 01-analysis  02-design  03-implement  04-qa-report
```

### Directory Structure

```
specs/
├── templates/          # Templates for specs and phase artifacts
├── active/             # Specs currently being worked on
├── completed/          # Successfully implemented specs
└── artifacts/          # Agent outputs organized by spec ID
    └── [SPEC-ID]/
        ├── 01-analysis.md
        ├── 02-design.md
        ├── 03-implementation.md
        └── 04-qa-report.md
```

### How to Use

1. **Create a spec** from the template:
   ```bash
   cp specs/templates/feature-spec.template.md specs/active/SPEC-YYYY-MM-DD-feature-name.md
   ```

2. **Fill in the spec** with requirements, acceptance criteria, and constraints

3. **Start the workflow** by telling Claude:
   ```
   Please implement specs/active/[spec-id].md using the spec-driven workflow
   ```

### Agent Phases

#### Phase 1: Analyst Agent
- **Role:** Understand and validate requirements
- **Input:** Spec file
- **Output:** `specs/artifacts/[SPEC-ID]/01-analysis.md`
- **Actions:**
  - Parse and interpret the spec
  - Extract all functional/non-functional requirements
  - Identify edge cases, risks, and dependencies
  - List any clarifying questions
- **User Action:** Approve analysis or answer questions

#### Phase 2: Architect Agent
- **Role:** Design the solution
- **Input:** Analysis + current codebase
- **Output:** `specs/artifacts/[SPEC-ID]/02-design.md`
- **Actions:**
  - Explore existing code patterns
  - Design component architecture
  - Plan file changes (create/modify/delete)
  - Define implementation sequence
  - Specify testing strategy
- **User Action:** Approve design or request changes

#### Phase 3: Implementer Agent
- **Role:** Write the code
- **Input:** Design document
- **Output:** Code changes + `specs/artifacts/[SPEC-ID]/03-implementation.md`
- **Actions:**
  - Create/modify files as designed
  - Follow existing code patterns
  - Handle errors appropriately
  - Log all changes made
- **User Action:** Review implementation

#### Phase 4: QA Agent
- **Role:** Test and validate
- **Input:** Implementation + spec
- **Output:** `specs/artifacts/[SPEC-ID]/04-qa-report.md`
- **Actions:**
  - Write automated tests
  - Run test suite
  - Perform code review
  - Check security and performance
  - Verify acceptance criteria
- **User Action:** Approve or request fixes

### Workflow Rules

1. **Sequential Execution:** Each phase must complete before the next begins
2. **Artifact Handoff:** Each phase reads the previous phase's artifact
3. **User Approval:** User must approve each phase before proceeding
4. **No Skipping:** All 4 phases are mandatory
5. **Iteration:** If issues are found, return to the appropriate phase

### Example Commands

```bash
# Start full workflow
"Implement specs/active/SPEC-2024-01-15-playwright-tests.md"

# Run specific phase
"Run Analysis phase for specs/active/SPEC-2024-01-15-playwright-tests.md"
"Run Design phase for specs/active/SPEC-2024-01-15-playwright-tests.md"
"Run Implementation phase for specs/active/SPEC-2024-01-15-playwright-tests.md"
"Run QA phase for specs/active/SPEC-2024-01-15-playwright-tests.md"

# Resume after approval
"Continue with Design phase for SPEC-2024-01-15-playwright-tests"
```

### Best Practices

- **Be specific in specs:** Vague requirements lead to clarifying questions
- **Review each phase:** Don't rush approvals
- **Keep specs updated:** If requirements change mid-development
- **Archive completed specs:** Move to `specs/completed/` when done

See `specs/README.md` for complete documentation.
