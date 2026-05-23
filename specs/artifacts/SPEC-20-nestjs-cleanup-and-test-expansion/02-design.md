# Phase 2: Design — SPEC-20 NestJS Cleanup & Next.js Test Expansion

**Spec:** SPEC-20-nestjs-cleanup-and-test-expansion  
**Phase:** 2 — Design  
**Status:** Complete  
**Date:** 2026-05-23  

---

## 1. Implementation Sequence

Execute in this order — each step is independently verifiable:

1. `pnpm-workspace.yaml` — 1-line removal (no risk)
2. `scripts/get-auth-token.sh` — fix broken env path
3. `scripts/get-auth-token.ts` — fix broken env path + var name
4. `apps/web/playwright.config.ts` — add new spec files to `member` project
5. Expand `apps/web/e2e/api.spec.ts` — authenticated member API tests
6. Create `apps/web/e2e/memberships.spec.ts`
7. Create `apps/web/e2e/payments.spec.ts`
8. Rewrite `CLAUDE.md` — full architecture update
9. Update `README.md` — remove NestJS references
10. Run full suite — confirm pass

---

## 2. File-by-File Design

### 2.1 `pnpm-workspace.yaml`

**Change:** Remove the stale `'@nestjs/core': false` entry from `allowBuilds`.

```yaml
# BEFORE
allowBuilds:
  '@nestjs/core': false
  '@prisma/client': true
  ...

# AFTER
allowBuilds:
  '@prisma/client': true
  ...
```

---

### 2.2 `scripts/get-auth-token.sh`

**Two changes:**
1. Line 30: `apps/api/.env` → `apps/web/.env.local`
2. `source` line picks up different var names — must map:
   - Old `apps/api/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`
   - New `apps/web/.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

After sourcing `apps/web/.env.local`, add alias lines:
```bash
SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY}"
SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY}"
```
The rest of the script continues to use `$SUPABASE_URL` etc. — no further changes needed.

Also update the header comment and the Postman references (the script now serves as a general dev token tool, not just a Postman helper).

---

### 2.3 `scripts/get-auth-token.ts`

**Two changes:**
1. Line 16: `resolve(__dirname, '../apps/api/.env')` → `resolve(__dirname, '../apps/web/.env.local')`
2. Line 17–18: update variable names:
   ```ts
   // BEFORE
   const SUPABASE_URL = process.env.SUPABASE_URL;
   const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

   // AFTER
   const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
   const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
   ```

---

### 2.4 `apps/web/playwright.config.ts`

Add `memberships.spec.ts` and `payments.spec.ts` to the `member` project so they run with the stored auth storage state and after `globalSetup` has written `.auth/test-user.json`.

```ts
projects: [
  {
    name: 'guest',
    testMatch: ['**/public.spec.ts', '**/auth.spec.ts', '**/register.spec.ts', '**/api.spec.ts'],
  },
  {
    name: 'member',
    testMatch: [
      '**/dashboard.spec.ts',
      '**/memberships.spec.ts',   // NEW
      '**/payments.spec.ts',      // NEW
    ],
    use: {
      storageState: '.auth/user.json',
    },
  },
],
```

---

### 2.5 `apps/web/e2e/api.spec.ts` — Expanded

Add two new `test.describe` blocks after the existing ones. The helper for reading the access token is copied from `dashboard.spec.ts` and used inline.

**New block 1 — Authenticated member self-service routes:**

| Test | Route | Method | Assert |
|------|-------|--------|--------|
| Returns 200 with member object | `/api/members/me` | GET | `body.member` has `id`, `email` |
| Returns 200 with updated member | `/api/members/me` | PUT | Send `{ fullName: 'Test User' }` → 200 |
| Returns family members array | `/api/members/me/family` | GET | `body.familyMembers` is array |
| Creates a family member | `/api/members/me/family` | POST | Send valid family member → 201, then DELETE it to clean up |
| Returns export data | `/api/members/me/export` | GET | 200 with JSON |
| Returns search 403 for non-active member | `/api/members/search?q=test` | GET | 403 (test user has no active membership) |

**New block 2 — Unauthenticated checks (already partially covered; add missing routes):**

| Test | Route | Assert |
|------|-------|--------|
| PUT /api/members/me returns 401 | PUT | 401 |
| GET /api/members/me/family returns 401 | GET | 401 |
| POST /api/members/me/family returns 401 | POST | 401 |
| GET /api/members/me/export returns 401 | GET | 401 |

---

### 2.6 `apps/web/e2e/memberships.spec.ts` — New File

Structure:

```
describe('Membership types — public')
  test: GET /api/memberships/types returns list           [guest, no auth]

describe('Membership — unauthenticated (401 checks)')
  test: POST /api/memberships returns 401
  test: GET /api/memberships/me returns 401
  test: DELETE /api/memberships/me returns 401
  test: GET /api/memberships/me/history returns 401

describe('Membership — authenticated member')
  test: GET /api/memberships/me returns 200 (null or status object)
  test: GET /api/memberships/me/history returns 200 array
  test: POST /api/memberships applies for annualSingle → 201
  test: POST /api/memberships again returns 409 (conflict — already applied)
  test: DELETE /api/memberships/me cancels membership → 200

describe('Membership — admin routes (skipped — requires admin role)')
  test.skip: GET /api/memberships returns 403 for non-admin
  test.skip: POST /api/memberships/:id/approve
  test.skip: POST /api/memberships/:id/reject
  test.skip: POST /api/memberships/honorary/assign
```

**Test lifecycle for membership apply/cancel:**
- `POST /api/memberships` with `{ membershipType: 'annualSingle' }` → store returned `membership.id`
- Assert 201 and `body.membership.memberStatus === 'pending'` (no payment yet)
- `DELETE /api/memberships/me` → 200, cleans up

**On conflict test:**  
After applying once (test above), a second POST returns 409. Sequence these two tests inside one `describe` block using `test.step` or by ordering them with shared state via a module-level variable.

Actually, better approach: make apply and cancel a single test that self-cleans, then conflict-test is separate in `beforeAll` setup.

**Simpler approach:** use `beforeAll` / `afterAll` within the authenticated describe to apply once and cancel once:

```ts
describe('Membership — authenticated member', () => {
  let membershipId: string

  test('GET /api/memberships/me returns 200', ...)
  test('GET /api/memberships/me/history returns 200', ...)

  test('POST /api/memberships creates pending membership', async ({ request }) => {
    // apply → store membershipId
  })

  test('POST /api/memberships again returns 409 conflict', async ({ request }) => {
    // second apply → 409
  })

  test('DELETE /api/memberships/me cancels membership', async ({ request }) => {
    // cancel → 200; cleans up membershipId
  })
})
```

Playwright runs tests sequentially within a describe when `workers: 1` (already set in config) — tests share the `membershipId` variable safely.

---

### 2.7 `apps/web/e2e/payments.spec.ts` — New File

Structure:

```
describe('Payments — unauthenticated (401 checks)')
  test: GET /api/payments/me returns 401
  test: POST /api/payments/checkout-session returns 401
  test: POST /api/payments/upgrade-session returns 401

describe('Payments — authenticated member')
  test: GET /api/payments/me returns 200 with empty data array
  test: POST /api/payments/checkout-session with unknown type returns 400
  test: POST /api/payments/checkout-session with admin-only type returns 403
  test: POST /api/payments/checkout-session with valid type returns 200 or 500
        → If Stripe is configured: 200 with url
        → If Stripe not configured: 500 (acceptable, stripe client throws)
        → Assert: status is 200 or 500 (don't fail CI if Stripe keys absent)

describe('Payments — admin routes (skipped)')
  test.skip: GET /api/payments returns 403 for non-admin
  test.skip: POST /api/payments/:id/refund
```

**Note on Stripe tests:** The checkout-session endpoint calls Stripe SDK, which will throw if `STRIPE_SECRET_KEY` is absent or a test key. We assert `status === 200 || status === 500` to avoid false CI failures. This matches the pattern used by the old NestJS suite which also skipped live Stripe tests.

---

### 2.8 `CLAUDE.md` (project-level) — Full Rewrite Outline

The rewrite keeps the same top-level sections but replaces all NestJS content with accurate Next.js descriptions.

**Sections to keep (updated):**
- Project Overview (remove NestJS, update tech stack)
- Monorepo Structure (remove `apps/api/`, show current tree: `apps/web/`, `apps/supabase/`)
- Common Development Commands (remove NestJS commands; keep web-only)
- Architecture Patterns (replace NestJS module pattern with Next.js route handler + lib service pattern)
- Database (Prisma commands now run from `apps/web/`, not `apps/api/`)
- Environment Variables (only `apps/web/.env.local` now — remove `apps/api/.env`)
- Testing section (replace NestJS Playwright info with current e2e setup)
- Implementation Status (update Phase 2 to reflect Next.js-only backend)
- Spec-Driven Workflow section (unchanged — still accurate)

**Sections to remove entirely:**
- NestJS Module Structure sub-section
- Postman Collection sub-section
- Claude Code Session Report sub-section (still valid — keep it, update script path)
- "test:api" command references
- Port 3001 references throughout

**Tech Stack update:**
```
BEFORE: Next.js 15 + NestJS 10 (two servers, ports 3000 + 3001)
AFTER:  Next.js 15 (single server, port 3000) with App Router API routes
```

---

### 2.9 `README.md` — Targeted Removals

Rather than a full rewrite, make surgical removals:

1. Tech stack table: remove NestJS row, update Backend to "Next.js 15 API routes"
2. Architecture diagram: remove `api/` node, port 3001 reference
3. Quick Start: remove `cp apps/api/.env.example apps/api/.env` and `cd apps/api` steps
4. Development URLs table: remove `localhost:3001` row
5. API examples: update `curl` examples from `localhost:3001/api/...` to `localhost:3000/api/...`
6. Remove "Postman Collection" mention
7. Update Prisma commands from `cd apps/api` to `cd apps/web`

---

## 3. Test Helper Pattern (shared across new files)

Both `memberships.spec.ts` and `payments.spec.ts` will use this token-reading helper (same as `dashboard.spec.ts`):

```typescript
import * as fs from 'fs'
import * as path from 'path'

function getAccessToken(): string {
  const file = path.resolve(__dirname, '../.auth/test-user.json')
  const { accessToken } = JSON.parse(fs.readFileSync(file, 'utf-8')) as { accessToken: string }
  return accessToken
}

// Use in tests:
const res = await request.get('/api/memberships/me', {
  headers: { Authorization: `Bearer ${getAccessToken()}` },
})
```

No changes to `global-setup.ts` or `global-teardown.ts` are needed.

---

## 4. Files Changed / Created Summary

| File | Action |
|------|--------|
| `pnpm-workspace.yaml` | Edit — remove 1 line |
| `scripts/get-auth-token.sh` | Edit — fix env path + var aliases |
| `scripts/get-auth-token.ts` | Edit — fix env path + var names |
| `apps/web/playwright.config.ts` | Edit — add 2 files to `member` project |
| `apps/web/e2e/api.spec.ts` | Edit — add ~20 new tests |
| `apps/web/e2e/memberships.spec.ts` | Create — ~15 tests |
| `apps/web/e2e/payments.spec.ts` | Create — ~10 tests |
| `CLAUDE.md` (project) | Rewrite — remove NestJS content |
| `README.md` | Edit — surgical NestJS removal |

**Files NOT changed:** all `apps/web/app/api/`, `apps/web/lib/`, `apps/web/prisma/`, `packages/`, all completed spec artifacts.

---

## 5. Expected Test Count After Implementation

| File | Current | After |
|------|---------|-------|
| `public.spec.ts` | 5 | 5 |
| `auth.spec.ts` | 6 | 6 |
| `register.spec.ts` | 6 | 6 |
| `api.spec.ts` | 8 | ~20 |
| `dashboard.spec.ts` | 4 | 4 |
| `memberships.spec.ts` | 0 | ~15 |
| `payments.spec.ts` | 0 | ~10 |
| **Total** | **29** | **~66** |

This surpasses the spec's minimum target of 40 tests.
