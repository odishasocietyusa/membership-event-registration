# Feature Specification: Migrate NestJS API to Next.js Route Handlers

> **Spec ID:** SPEC-11-nestjs-to-nextjs-migration
> **Status:** Draft
> **Author:** Utkal Nayak
> **Created:** 2026-05-14

---

## 1. Overview

### 1.1 Summary

The project currently runs two separate server processes: a Next.js frontend (`apps/web`, port 3000) and a NestJS backend (`apps/api`, port 3001). The Next.js app already contains a substantial API layer under `apps/web/app/api/` (members, payments, messages, chapters, auth, webhooks). The goal of this spec is to complete that API layer — primarily by porting the NestJS `memberships` module, which has no Next.js equivalent — and then decommission the NestJS backend entirely so the platform runs as a single Next.js process.

### 1.2 Goals

- [ ] Audit all NestJS endpoints against existing Next.js route handlers; document every gap
- [ ] Port the NestJS `memberships` module (12 endpoints) to Next.js Route Handlers under `app/api/memberships/`
- [ ] Port any NestJS `users` endpoints not yet covered by `app/api/members/` (role update, profile upsert/update, per-ID export/delete)
- [ ] Update all frontend pages that call `NEXT_PUBLIC_API_URL` (NestJS on port 3001) to call same-origin `/api/...` Next.js routes instead
- [ ] Remove `apps/api/` from the Turborepo workspace and delete the NestJS app
- [ ] All tests continue to pass after migration

### 1.3 Non-Goals (Out of Scope)

- Rewriting business logic — port it faithfully; refactoring is a separate concern
- New features or endpoint additions beyond what NestJS currently has
- Stripe webhook signature key rotation or Stripe configuration changes
- Database schema changes (Prisma schema stays as-is)
- Migrating NestJS Playwright API tests (those tests are specific to the NestJS server; they become obsolete on deletion)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Port `GET /api/memberships/types` — list all public membership types | Must Have | Already exists as `prisma.membershipType.findMany` in Next.js pattern |
| FR-02 | Port `POST /api/memberships` — apply for a new membership | Must Have | Creates `Membership` record with PENDING status |
| FR-03 | Port `GET /api/memberships/me` — get current user's active membership | Must Have | Single record, authenticated |
| FR-04 | Port `GET /api/memberships/me/history` — get current user's membership history | Must Have | Array |
| FR-05 | Port `DELETE /api/memberships/me` — cancel current user's membership | Must Have | Soft status change |
| FR-06 | Port `GET /api/memberships` — admin list all memberships with pagination + status filter | Must Have | Admin only |
| FR-07 | Port `GET /api/memberships/:id` — admin get single membership by ID | Must Have | Admin only |
| FR-08 | Port `POST /api/memberships/:id/approve` — admin approve pending membership | Must Have | Admin only; triggers role promotion |
| FR-09 | Port `POST /api/memberships/:id/reject` — admin reject pending membership | Must Have | Admin only |
| FR-10 | Port `POST /api/memberships/honorary/assign` — admin assign honorary (free) membership | Must Have | Admin only |
| FR-11 | Port `PUT /api/memberships/:id/status` — admin override membership status | Must Have | Admin only |
| FR-12 | Port `DELETE /api/memberships/:id` — admin cancel any membership by ID | Must Have | Admin only |
| FR-13 | Port `POST /api/users/me/profile` and `PUT /api/users/me/profile` to `POST /api/members/me/profile` (if not already covered) | Must Have | Check `app/api/members/me/route.ts` — may be partially covered |
| FR-14 | Port `PUT /api/users/:id/role` to `PUT /api/members/[id]/role` | Must Have | Admin only |
| FR-15 | Update `apps/web/app/register/page.tsx` to call `/api/members/me/profile` (Next.js) instead of `${NEXT_PUBLIC_API_URL}/users/me/profile` | Must Have | Removes last NestJS call from frontend pages |
| FR-16 | Remove `NEXT_PUBLIC_API_URL` env var references from frontend pages (replace all `fetch(apiUrl/...)` calls) | Must Have | After all endpoints are ported |
| FR-17 | Delete `apps/api/` directory and remove it from `pnpm-workspace.yaml` and `turbo.json` | Must Have | Final step after all endpoints verified |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Auth parity | All protected NestJS endpoints must use `withAuth` wrapper in Next.js | Matches existing Next.js API pattern |
| NFR-02 | Admin-only enforcement | All admin endpoints must check `user.role === 'ADMIN'` and return 403 otherwise | See `app/api/members/[id]/route.ts` for pattern |
| NFR-03 | TypeScript strict | No `any` types in new route handlers or service functions | |
| NFR-04 | Zod validation on all request bodies | Match existing Next.js API style — parse with schema before accessing fields | |
| NFR-05 | Single process | After migration, `pnpm dev` starts only the Next.js app (no separate API server) | |
| NFR-06 | No CSS | Not applicable — this is backend-only work | |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done

- [ ] All 12 memberships endpoints implemented as Next.js Route Handlers
- [ ] All users/admin gaps filled (role update, profile upsert)
- [ ] `register/page.tsx` calls `/api/members/me/profile` (no `NEXT_PUBLIC_API_URL` reference)
- [ ] No source file in `apps/web/` references `NEXT_PUBLIC_API_URL`
- [ ] `apps/api/` directory removed
- [ ] `pnpm-workspace.yaml` and `turbo.json` updated (NestJS app removed)
- [ ] All existing Jest unit tests continue to pass (245 tests)
- [ ] `pnpm dev --filter=web` starts the full application with no NestJS dependency

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Apply for membership | Authenticated user, valid membership type | POST `/api/memberships` | 201 with membership record in PENDING status |
| List membership types | Any visitor | GET `/api/memberships/types` | 200 with array of public membership types |
| Get own membership | Authenticated member with ACTIVE membership | GET `/api/memberships/me` | 200 with membership object |
| Get own history | Authenticated member | GET `/api/memberships/me/history` | 200 with array (may be empty) |
| Cancel own membership | Authenticated member with ACTIVE membership | DELETE `/api/memberships/me` | 200 with updated membership |
| Admin list memberships | Admin user | GET `/api/memberships?status=PENDING` | 200 with paginated list |
| Admin approve | Admin, membership in PENDING state | POST `/api/memberships/:id/approve` | 200, membership becomes ACTIVE |
| Admin reject | Admin, membership in PENDING state | POST `/api/memberships/:id/reject` | 200, membership becomes REJECTED |
| Honorary assign | Admin | POST `/api/memberships/honorary/assign` | 200, free membership ACTIVE immediately |
| Non-admin hits admin route | Regular member | GET `/api/memberships` | 403 Forbidden |
| Register page submit | Authenticated user completing step 4 | POST `//api/members/me/profile` | 200, redirects to `/membership` |
| `pnpm dev` cold start | No NestJS running | Visit `/register`, complete form | Works entirely on port 3000 |

---

## 4. Technical Constraints

### 4.1 Technologies

- **Must Use:** Next.js 15 App Router Route Handlers, TypeScript, Zod, Prisma (via `@/lib/db/prisma`), `withAuth` wrapper
- **Must Follow:** Existing Next.js API patterns in `apps/web/app/api/` (see §4.2)
- **Must Avoid:** Any NestJS imports, decorators, or class-based patterns in the new routes

### 4.2 Patterns to Follow

Existing Next.js routes follow this consistent structure — all new routes must match it:

```typescript
// app/api/memberships/me/route.ts
import { withAuth } from '@/lib/auth/with-auth'
import { prisma } from '@/lib/db/prisma'
import { SomeSchema } from '@/lib/validation/some.schema'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET = withAuth(async (_req, { user }) => {
  const result = await prisma.membership.findFirst({ where: { userId: user.id } })
  return jsonResponse(200, { membership: result })
})
```

Key conventions:
- `withAuth` wraps every authenticated handler; unauthenticated requests get 401 automatically
- Admin check: `if (user.role !== 'ADMIN') return jsonResponse(403, { error: 'Forbidden' })`
- Service logic lives in `apps/web/lib/<domain>/<domain>-service.ts` (not inline in route files)
- Zod schemas live in `apps/web/lib/validation/<domain>.schema.ts`
- Public endpoints (e.g., GET types) export a plain `async function GET(req: Request)` without `withAuth`

### 4.3 Endpoint Mapping

| NestJS Endpoint | HTTP | Auth | Next.js Route Handler |
|-----------------|------|------|-----------------------|
| `GET /api/memberships/types` | GET | Public | `app/api/memberships/types/route.ts` |
| `POST /api/memberships` | POST | Member | `app/api/memberships/route.ts` |
| `GET /api/memberships/me` | GET | Member | `app/api/memberships/me/route.ts` |
| `GET /api/memberships/me/history` | GET | Member | `app/api/memberships/me/history/route.ts` |
| `DELETE /api/memberships/me` | DELETE | Member | `app/api/memberships/me/route.ts` |
| `GET /api/memberships` | GET | Admin | `app/api/memberships/route.ts` |
| `GET /api/memberships/:id` | GET | Admin | `app/api/memberships/[id]/route.ts` |
| `POST /api/memberships/:id/approve` | POST | Admin | `app/api/memberships/[id]/approve/route.ts` |
| `POST /api/memberships/:id/reject` | POST | Admin | `app/api/memberships/[id]/reject/route.ts` |
| `PUT /api/memberships/:id/status` | PUT | Admin | `app/api/memberships/[id]/status/route.ts` |
| `DELETE /api/memberships/:id` | DELETE | Admin | `app/api/memberships/[id]/route.ts` |
| `POST /api/memberships/honorary/assign` | POST | Admin | `app/api/memberships/honorary/assign/route.ts` |
| `PUT /api/users/:id/role` | PUT | Admin | `app/api/members/[id]/role/route.ts` |
| `POST /api/users/me/profile` | POST | Member | `app/api/members/me/profile/route.ts` (new) or check if `app/api/members/me/route.ts` PUT covers it |

### 4.4 Files to Create

| File | Purpose |
|------|---------|
| `apps/web/app/api/memberships/types/route.ts` | Public membership types list |
| `apps/web/app/api/memberships/route.ts` | POST apply (member) + GET all (admin) |
| `apps/web/app/api/memberships/me/route.ts` | GET own + DELETE own |
| `apps/web/app/api/memberships/me/history/route.ts` | GET own history |
| `apps/web/app/api/memberships/[id]/route.ts` | GET by ID + DELETE by ID (admin) |
| `apps/web/app/api/memberships/[id]/approve/route.ts` | Approve (admin) |
| `apps/web/app/api/memberships/[id]/reject/route.ts` | Reject (admin) |
| `apps/web/app/api/memberships/[id]/status/route.ts` | Override status (admin) |
| `apps/web/app/api/memberships/honorary/assign/route.ts` | Assign honorary (admin) |
| `apps/web/app/api/members/[id]/role/route.ts` | Update role (admin) |
| `apps/web/lib/memberships/membership-service.ts` | Business logic (apply, approve, reject, cancel, honorary) |
| `apps/web/lib/validation/membership.schema.ts` | Zod schemas for membership requests |

### 4.5 Files to Modify

| File | Change |
|------|--------|
| `apps/web/app/register/page.tsx` | Replace `${apiUrl}/users/me/profile` with `/api/members/me/profile` |
| `apps/web/app/api/members/me/route.ts` | Add POST handler for profile upsert if not already present |
| `pnpm-workspace.yaml` | Remove `apps/api` entry |
| `turbo.json` | Remove `api` app from pipeline |
| Root `package.json` | Remove `dev --filter=api` script references |

### 4.6 Files to Delete

- `apps/api/` — entire NestJS application directory

### 4.7 Files NOT to Modify

- `apps/web/app/api/payments/` — already fully implemented
- `apps/web/app/api/messages/` — already fully implemented
- `apps/web/app/api/auth/` — already fully implemented
- `apps/web/app/api/webhooks/stripe/` — already fully implemented
- `packages/validation/` — existing Zod schemas unchanged
- `apps/api/prisma/schema.prisma` — the schema is the source of truth; Prisma client already used by Next.js

---

## 5. Dependencies

### 5.1 Upstream Dependencies

- Prisma client must already be configured for direct DB access from Next.js (`apps/web/lib/db/prisma.ts`) — verify this exists before Phase 3
- `withAuth` helper must support role checking — review `apps/web/lib/auth/with-auth.ts`
- SPEC-10 (registration page) must be complete — the `register/page.tsx` fix in FR-15 depends on it (already done)

### 5.2 Downstream Impact

- All future frontend pages (`/membership`, `/dashboard`, admin panels) should call same-origin `/api/...` routes — this spec establishes the complete API surface they depend on
- Removes the NestJS `NEXT_PUBLIC_API_URL` env var dependency — simplifies local dev setup (one process, one port)
- Playwright API tests in `apps/api/tests/` become obsolete and are deleted with `apps/api/`

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Does `apps/web/lib/db/prisma.ts` already have the Prisma client singleton, or does it need to be created? | Open | Verify in Phase 1 analysis |
| Does `withAuth` currently expose `user.role` so admin checks can be done inline? | Open | Review `apps/web/lib/auth/with-auth.ts` in Phase 1 |
| Should `POST /api/memberships` enforce that the user has a complete profile before applying? | Open | NestJS service may already enforce this |
| Is the credit system (apply credit from expired membership to renewal checkout) handled in the Stripe route or the memberships route? | Open | Check NestJS `MembershipsService.calculateCheckoutAmount()` — may already be in `payments/checkout-session/route.ts` |
| After deleting `apps/api/`, should we keep `apps/api/prisma/schema.prisma` as a reference, or is it fully redundant with the Prisma client already installed? | Open | Likely redundant — Prisma client is generated from schema; schema is in `apps/api/prisma/` currently. Need to verify where Prisma generates to and whether `apps/web` has its own `prisma/` directory or points to `apps/api/prisma/`. |

---

## 7. References

- `apps/api/src/modules/memberships/memberships.controller.ts` — NestJS endpoints to port
- `apps/api/src/modules/memberships/memberships.service.ts` — Business logic to replicate
- `apps/api/src/modules/users/users.controller.ts` — Users endpoints gap analysis
- `apps/web/app/api/members/me/route.ts` — Existing Next.js member route (reference pattern)
- `apps/web/app/api/payments/checkout-session/route.ts` — Existing Next.js payment route (reference pattern)
- `apps/web/lib/auth/with-auth.ts` — Auth wrapper for route handlers
- `apps/web/lib/db/prisma.ts` — Prisma client singleton (verify exists)
- `specs/active/SPEC-10-registration-page.md` — FR-15 depends on SPEC-10 completion (done)

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation

### Phase 1: Analysis
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-11-nestjs-to-nextjs-migration/01-analysis.md`
- **Key finding:** Two completely separate DB schemas; web schema `Member` model used as migration target

### Phase 2: Design
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-11-nestjs-to-nextjs-migration/02-design.md`

### Phase 3: Implementation
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-11-nestjs-to-nextjs-migration/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-11-nestjs-to-nextjs-migration/04-qa-report.md`
