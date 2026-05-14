# SPEC-11 Phase 1 Analysis: Migrate NestJS API to Next.js Route Handlers

> **Phase:** 1 — Analyst
> **Date:** 2026-05-14
> **Result:** COMPLETE — critical schema divergence discovered; requires architect decision before Phase 2

---

## Critical Discovery: Two Completely Separate Database Schemas

The two apps are **not two layers of the same system** — they operate on entirely different PostgreSQL schemas.

| Dimension | `apps/web` | `apps/api` |
|---|---|---|
| Prisma schema | `apps/web/prisma/schema.prisma` | `apps/api/prisma/schema.prisma` |
| Core identity model | `Member` (has `role: 'member'\|'admin'`, `memberStatus`, `fullName`, `chapterId`) | `User` + separate `Profile` model |
| Membership concept | Inline fields on `Member` (`membershipType`, `memberStatus`, `expiryDate`) + `MembershipFee` lookup | Separate `Membership` and `MembershipType` models |
| Roles | `member \| admin` (2-tier, lowercase) | `GUEST \| MEMBER \| CONTRIBUTOR \| ADMIN` (4-tier, uppercase) |
| Payment model | `PaymentRecord` (amountCents, isAnonymous, refundAmountCents) | `Payment` (Decimal amount, Stripe session metadata) |
| Chapters | Yes (`Chapter` model) | No |
| Family members | Yes (`FamilyMember` table) | Children stored as `Json` in `Profile` |
| Messages | Yes (`Message` model) | No |
| Events | No | Yes (`Event`, `EventRegistration`, `WaitlistEntry`) |
| Audit log | No | Yes (`AuditLog`) |
| Credit system | No | Yes (fields on `Membership` for credit from expired memberships) |

The NestJS memberships module cannot be ported verbatim — it manages a `Membership` model that does not exist in the web app's schema. The Architect must decide which schema governs after migration.

---

## 1. Prisma Client Setup

### Current State

`apps/web/lib/db/prisma.ts` exports a singleton `PrismaClient`. The web app's `package.json` includes:
- `"@prisma/client": "^6.2.0"` in dependencies
- `"prisma": "^6.2.0"` in devDependencies
- `"prisma": { "seed": "tsx prisma/seed.ts" }` field
- `"postinstall": "prisma generate"` script

The generator block in `apps/web/prisma/schema.prisma` uses the default output path. Generation is self-contained within `apps/web`.

### Migration Risk: **None**

Deleting `apps/api/` will NOT break `apps/web`'s Prisma setup. The web app's Prisma client is generated entirely from `apps/web/prisma/schema.prisma`. The two Prisma setups are completely independent.

---

## 2. `withAuth` Wrapper Shape

File: `apps/web/lib/auth/with-auth.ts`

```typescript
export function withAuth(
  handler: (req: Request, ctx: { user: MemberRow }) => Promise<Response>,
  options?: { role?: Role }  // 'member' | 'admin'
): (req: Request) => Promise<Response>
```

### `user` object fields (all fields from the `Member` Prisma model)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` (UUID) | Primary key |
| `userId` | `string \| null` | Supabase Auth UUID |
| `email` | `string` | Unique |
| `fullName` | `string \| null` | From OAuth metadata at signup |
| `role` | `'member' \| 'admin'` | Lowercase enum |
| `memberStatus` | `'active' \| 'expired' \| 'suspended' \| null` | |
| `membershipType` | `MembershipType enum \| null` | One of 9 tier values |
| `phone` | `string \| null` | |
| `address` | `Json \| null` | `{street, city, state, zip, country}` |
| `chapterId` | `string \| null` | FK to Chapter |
| `stripeCustomerId` | `string \| null` | |
| `joinDate` | `Date \| null` | |
| `expiryDate` | `Date \| null` | |
| `profileVisibility` | `Json \| null` | `{show_phone, show_email, show_chapter}` |
| `souvenirPreference` | `'electronic' \| 'print' \| null` | |
| `createdAt` | `Date` | |
| `deletedAt` | `Date \| null` | Soft delete |

Admin routes pass `{ role: 'admin' }` as the second argument to `withAuth`. The wrapper enforces it via `ROLE_HIERARCHY = { member: 1, admin: 2 }`. Public routes use a plain `async function GET(req: Request)` without `withAuth`.

---

## 3. Endpoint Gap Analysis

### NestJS Users Controller (`/api/users`)

| NestJS Endpoint | Method | Role | Next.js Route | Status |
|---|---|---|---|---|
| `GET /users/me` | GET | auth | `GET /api/auth/me` | PARTIAL — returns `Member` row, not `User+Profile` shape |
| `POST /users/me/profile` | POST | auth | **None** | **MISSING** — this is the only NestJS endpoint called by `register/page.tsx` |
| `PUT /users/me/profile` | PUT | auth | `PUT /api/members/me` | PARTIAL — different field shape |
| `GET /users/me/export` | GET | auth | `GET /api/members/me/export` | EXISTS |
| `DELETE /users/me` | DELETE | auth | `DELETE /api/members/me` | EXISTS |
| `GET /users` | GET | ADMIN | `GET /api/members` | PARTIAL — query params differ |
| `GET /users/:id` | GET | ADMIN | `GET /api/members/:id` | PARTIAL — different data shape |
| `PUT /users/:id/role` | PUT | ADMIN | `PUT /api/members/:id` | PARTIAL — 4-tier vs 2-tier roles |
| `GET /users/:id/export` | GET | ADMIN | **None** | **MISSING** |
| `DELETE /users/:id` | DELETE | ADMIN | **None** | **MISSING** |

### NestJS Memberships Controller (`/api/memberships`)

All 12 endpoints are **MISSING** from the Next.js app.

| NestJS Endpoint | Method | Role | Status |
|---|---|---|---|
| `GET /memberships/types` | GET | public | MISSING |
| `POST /memberships` | POST | auth | MISSING |
| `GET /memberships/me` | GET | auth | MISSING |
| `GET /memberships/me/history` | GET | auth | MISSING |
| `DELETE /memberships/me` | DELETE | auth | MISSING |
| `GET /memberships` | GET | ADMIN | MISSING |
| `GET /memberships/:id` | GET | ADMIN | MISSING |
| `POST /memberships/:id/approve` | POST | ADMIN | MISSING |
| `POST /memberships/:id/reject` | POST | ADMIN | MISSING |
| `POST /memberships/honorary/assign` | POST | ADMIN | MISSING |
| `PUT /memberships/:id/status` | PUT | ADMIN | MISSING |
| `DELETE /memberships/:id` | DELETE | ADMIN | MISSING |

However, because `Membership` / `MembershipType` are NestJS-only models, these cannot be ported without a schema decision. The web app tracks membership inline on `Member` (see §10 risks).

### NestJS Payments Controller (`/api/payments`)

| NestJS Endpoint | Method | Role | Next.js Route | Status |
|---|---|---|---|---|
| `POST /payments/checkout-session` | POST | auth | `POST /api/payments/checkout-session` | PARTIAL — different input shape; NestJS takes `membershipId`; web app takes `membershipType` enum |
| `POST /payments/webhook` | POST | public | `POST /api/webhooks/stripe` | PARTIAL — both handle `checkout.session.completed`; update different models |
| `GET /payments/me` | GET | auth | `GET /api/payments/me` | PARTIAL — same intent, different Prisma models |
| `PUT /payments/:id` | PUT | ADMIN | **None** | **MISSING** — admin payment amount override |

---

## 4. Memberships Service Method Inventory

File: `apps/api/src/modules/memberships/memberships.service.ts`

| Method | DB Tables | Side Effects | Notes |
|---|---|---|---|
| `getMembershipTypes()` | `membership_types` read | None | Returns all active types incl. honorary |
| `getAvailableCredit(userId)` | `memberships`, `payments` read | None | Finds expired memberships within 365 days; calculates credit from payment amount |
| `create(userId, dto)` | `users` read, `memberships` read×2 + write | Creates `Membership` row (PENDING) | Blocks if PENDING exists; sets upgrade link if ACTIVE exists; applies credit if available |
| `findMyMembership(userId)` | `memberships` read + joins | None | Returns first ACTIVE or PENDING (most recent) |
| `getMembershipHistory(userId)` | `memberships` read all statuses | None | |
| `findAll(params)` | `memberships` paginated + joins | None | Admin only |
| `findOne(id)` | `memberships` read by ID | None | Admin only |
| `approve(membershipId, adminId, dto)` | `memberships` write, `users` write | **Role promotion**: GUEST → MEMBER | In a Prisma transaction |
| `reject(membershipId, adminId, reason)` | `memberships` write | Sets status → CANCELLED | |
| `updateStatus(membershipId, status, note)` | `memberships` write | Direct override | |
| `assignHonoraryMembership(userId, adminId, note)` | `membership_types` read, `memberships` write, `users` write | **Role promotion**: GUEST → MEMBER; creates ACTIVE lifetime membership | In a Prisma transaction |
| `cancel(membershipId, userId)` | `memberships` write | Sets status → CANCELLED | Ownership check included |
| `updateExpiredMemberships()` | `memberships` write, `users` write | **Role demotion**: MEMBER → GUEST for expired | Cron/background only; NOT in any endpoint |

---

## 5. Users Service Gaps

File: `apps/api/src/modules/users/users.service.ts`

| NestJS Method | Web app coverage | Gap |
|---|---|---|
| `findById(id)` | `GET /api/auth/me` + `GET /api/members/:id` | PARTIAL shape |
| `createOrUpdateProfile(userId, dto)` | **None** | **MISSING** — used by `register/page.tsx` |
| `updateProfile(userId, dto)` | `PUT /api/members/me` | PARTIAL — different field names |
| `updateRole(id, role)` | `PUT /api/members/:id` | PARTIAL — 4-tier vs 2-tier |
| `exportUserData(userId)` by admin | **None** | **MISSING** |
| `softDeleteUser(id)` by admin | **None** | **MISSING** |
| `findAll(params)` | `GET /api/members` | PARTIAL — missing `role` filter |

---

## 6. Next.js API Conventions

All new routes must follow this pattern:

```typescript
// app/api/<resource>/me/route.ts
import { withAuth } from '@/lib/auth/with-auth'
import { someServiceFn } from '@/lib/<domain>/<domain>-service'
import { SomeSchema } from '@/lib/validation/<domain>.schema'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function serviceErrorToResponse(err: unknown): Response {
  const code = (err as { code?: string }).code
  if (code === 'NOT_FOUND') return jsonResponse(404, { error: 'Not found' })
  if (code === 'CONFLICT') return jsonResponse(409, { error: 'Conflict' })
  if (code === 'FORBIDDEN') return jsonResponse(403, { error: 'Forbidden' })
  console.error(err)
  return jsonResponse(500, { error: 'Internal server error' })
}

// Authenticated handler
export const GET = withAuth(async (_req, { user }) => {
  const result = await someServiceFn(user.id)
  return jsonResponse(200, { result })
})

// Admin-only handler
export const POST = withAuth(async (req, { user }) => {
  let body: unknown
  try { body = await req.json() } catch { return jsonResponse(400, { error: 'Invalid JSON body' }) }
  const parsed = SomeSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })
  const result = await adminOnlyServiceFn(parsed.data)
  return jsonResponse(200, { result })
}, { role: 'admin' })
```

Service functions throw coded errors: `throw Object.assign(new Error('msg'), { code: 'NOT_FOUND' })`.
Business logic lives in `apps/web/lib/<domain>/<domain>-service.ts`, not inline in route files.
Zod schemas live in `apps/web/lib/validation/<domain>.schema.ts`.

---

## 7. Environment Variable Delta

### Vars to add/uncomment in `apps/web/.env.example` before deleting `apps/api/`

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_xxx
CRON_SECRET=your-cron-secret
NEXT_PUBLIC_SITE_URL=http://localhost:3000
RESEND_FROM_EMAIL=noreply@osa-americas.org
ADMIN_NOTIFICATION_EMAIL=admin@osa-americas.org
```

### Vars in `apps/api/` NOT needed by web app (NestJS-only — delete with `apps/api`)
`SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `JWT_SECRET`, `CORS_ORIGIN`, `PORT`, `STRIPE_NONPROFIT_RATE`

---

## 8. Monorepo Config Changes Needed

### `pnpm-workspace.yaml`
- `"apps/*"` glob stays as-is (only `web` will match after deletion)
- Remove `'@nestjs/core': true` (and all other `@nestjs/*` entries) from `allowBuilds`

### `turbo.json`
- **No changes needed** — task definitions are generic; they work for any number of apps

### Root `package.json`
- Remove `@nestjs/core` (and other `@nestjs/*`) from `pnpm.onlyBuiltDependencies` list

### `apps/api/` — deleted entirely
- Includes: `tests/` (Playwright API test suite, ~78 tests), `postman/` (optional)

---

## 9. Frontend NestJS References

| File | Line | Content |
|---|---|---|
| `apps/web/.env.example` | 34–35 | Commented-out `NEXT_PUBLIC_API_URL` and `API_URL` vars — safe to delete |
| `apps/web/app/register/page.tsx` | 182–190 | `const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'` then `fetch(\`${apiUrl}/users/me/profile\`, ...)` |

**Only one live production reference.** The registration page step 4 address submit calls NestJS `POST /users/me/profile`. This must be replaced before deleting `apps/api/`.

The `NEXT_PUBLIC_API_URL` env var is not set in `apps/web/.env.example` (it's commented out), so in development it falls back to `http://localhost:3001` — the NestJS server.

---

## 10. Risks and Key Decisions

### Decision Required: Which Schema Wins?

This is the most consequential question for Phase 2.

**Option A — Build around the web app's existing `Member` schema (Recommended)**
- Membership is inline on `Member` (`memberStatus`, `membershipType`, `expiryDate`, `joinDate`)
- New "memberships" routes map to updating these fields
- `GET /memberships/types` returns the `MembershipFee` table (already exists in the web schema)
- No schema migration needed; lower risk
- Loses the credit system and upgrade tracking from NestJS (can be re-added later as a schema extension)

**Option B — Migrate web app schema to include NestJS `Membership`/`MembershipType` tables**
- More faithful port of the NestJS feature set
- Requires a Prisma migration on `apps/web/prisma/schema.prisma`
- Requires updating all existing web app routes that currently read `Member.memberStatus`
- Higher risk, longer timeline

### Risk Summary

| Risk | Severity | Mitigation |
|---|---|---|
| `register/page.tsx` calls NestJS after deletion | **HIGH** | Create `POST /api/users/me/profile` before deleting `apps/api` |
| `Membership` model doesn't exist in web schema | **HIGH** | Choose schema option (A or B above) |
| Role promotion/demotion tied to memberships service | MEDIUM | Re-implement in membership approve/honorary routes (web `role: 'member' \| 'admin'` is sufficient) |
| Credit system not in web schema | MEDIUM | Defer; not needed for MVP |
| `CONTRIBUTOR` role has no web equivalent | LOW | Map to `member` |
| Cron expiry doesn't update status/role | MEDIUM | Create new cron endpoint or extend existing one |
| Admin payment override (`PUT /payments/:id`) missing | LOW | Create after memberships are ported |
