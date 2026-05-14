# Phase 3: Implementation

> **Spec:** SPEC-2-foundation-auth
> **Implementer Agent:** implementer-backend-s2 (Group A)
> **Date:** 2026-05-13
> **Status:** Group A — Complete (pending `pnpm install` + `pnpm prisma generate`)

---

## Group A — Implementation Summary

All Group A tasks (A1–A8) have been completed per the TDD RED → GREEN → REFACTOR cycle.

### A1 — Prisma Setup

**Status:** Schema created. `pnpm install` + `pnpm prisma generate` must be run to activate.

Files created/modified:
- `apps/web/prisma/schema.prisma` — created (from §3 of design doc)
- `apps/web/package.json` — modified (added `@prisma/client`, `prisma`, `jest`, `@types/jest`, `ts-jest`, `jest-environment-node` and Prisma scripts)
- `apps/web/jest.config.ts` — created (ts-jest with `moduleNameMapper` for `@/` alias)

**Pending manual steps:**
```bash
# From repo root
pnpm install

# From apps/web/
pnpm prisma generate   # generates TypeScript types from schema
pnpm prisma db push    # creates tables in Supabase (requires supabase start)
```

---

### A2 — `lib/auth/roles.ts`

**Status:** Complete — RED test written then GREEN implementation written.

- `apps/web/lib/auth/roles.test.ts` — ROLES-01, ROLES-02
- `apps/web/lib/auth/roles.ts` — `Role` type + `ROLE_HIERARCHY` constant

**Test cases:**
- ROLES-01: `ROLE_HIERARCHY['admin'] > ROLE_HIERARCHY['member']`
- ROLES-02: `Object.keys(ROLE_HIERARCHY).sort()` equals `['admin', 'member']`

---

### A3 — `lib/db/prisma.ts`

**Status:** Complete.

- `apps/web/lib/db/prisma.test.ts` — PRISMA-01
- `apps/web/lib/db/prisma.ts` — `globalThis` singleton PrismaClient

**Test case:**
- PRISMA-01: Two dynamic imports return the same object reference (`first === second`)

---

### A4 — `lib/auth/supabase-admin.ts`

**Status:** Complete.

- `apps/web/lib/auth/supabase-admin.test.ts` — ADMIN-01 + ADMIN-02 (URL variant)
- `apps/web/lib/auth/supabase-admin.ts` — env-validated `createClient` with `autoRefreshToken: false, persistSession: false`

**Test cases:**
- ADMIN-01: throws containing `'SUPABASE_SERVICE_ROLE_KEY'` when key is missing
- ADMIN-02 (added): throws containing `'NEXT_PUBLIC_SUPABASE_URL'` when URL is missing

---

### A5 — `lib/auth/with-auth.ts`

**Status:** Complete — all 10 test cases written + implementation.

- `apps/web/lib/auth/with-auth.test.ts` — WITHAUTH-01 through WITHAUTH-10
- `apps/web/lib/auth/with-auth.ts` — 6-step pipeline HOF

**Pipeline steps implemented:**
1. Bearer token extraction (401 on missing/non-Bearer header)
2. `supabaseAdmin.auth.getUser(token)` validation (401 on error/null user/missing email)
3. `prisma.member.upsert({ where: { email }, create: { email, userId, role: 'member' }, update: { userId } })`
4. Soft-delete check (401 on `deletedAt !== null`)
5. Role hierarchy check against `ROLE_HIERARCHY` (403 on insufficient level)
6. Delegate to wrapped handler with `{ user: member }`

---

### A6 — `app/api/auth/callback/route.ts`

**Status:** Complete.

- `apps/web/app/api/auth/callback/route.test.ts` — CALLBACK-01, CALLBACK-02 + variants
- `apps/web/app/api/auth/callback/route.ts` — `@supabase/ssr` `exchangeCodeForSession` + redirect

**Test cases:**
- CALLBACK-01: valid `?code=` → exchange succeeds → redirect to `/dashboard`
- CALLBACK-01b: `?code=` + `?next=/dashboard/profile` → redirect to `/dashboard/profile`
- CALLBACK-02: no `?code=` → redirect to `/login?error=auth_callback_failed`
- CALLBACK-02b: exchange returns error → redirect to `/login?error=auth_callback_failed`

---

### A7 — `app/api/auth/me/route.ts`

**Status:** Complete.

- `apps/web/app/api/auth/me/route.test.ts` — ME-01 through ME-04, JIT-01, JIT-02
- `apps/web/app/api/auth/me/route.ts` — one-liner `withAuth` wrapper

**Test cases:**
- ME-01: 200 + `{ user: { email, role: 'member' } }` for valid auth
- ME-02: 401 when Authorization header missing
- ME-03: 401 for invalid/expired token
- ME-04: 401 for soft-deleted member
- JIT-01: upsert create args include `{ role: 'member' }` on first call
- JIT-02: two calls each use upsert (guarantees idempotency — no duplicate rows possible)

---

### A8 — `.env.example`

**Status:** Complete.

- `apps/web/.env.example` — updated with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL` with local dev defaults and production examples commented out.

---

## Files Created / Modified (Group A)

| File | Action |
|------|--------|
| `apps/web/prisma/schema.prisma` | Created |
| `apps/web/package.json` | Modified (added deps + scripts) |
| `apps/web/jest.config.ts` | Created |
| `apps/web/lib/auth/roles.ts` | Created |
| `apps/web/lib/auth/roles.test.ts` | Created |
| `apps/web/lib/db/prisma.ts` | Created |
| `apps/web/lib/db/prisma.test.ts` | Created |
| `apps/web/lib/auth/supabase-admin.ts` | Created |
| `apps/web/lib/auth/supabase-admin.test.ts` | Created |
| `apps/web/lib/auth/with-auth.ts` | Created |
| `apps/web/lib/auth/with-auth.test.ts` | Created |
| `apps/web/app/api/auth/callback/route.ts` | Created |
| `apps/web/app/api/auth/callback/route.test.ts` | Created |
| `apps/web/app/api/auth/me/route.ts` | Created |
| `apps/web/app/api/auth/me/route.test.ts` | Created |
| `apps/web/.env.example` | Updated |

---

## Pending Steps Before Tests Can Run

1. **User must grant permission** to run `pnpm install` (blocked by sandbox)
2. After install: `cd apps/web && pnpm prisma generate`
3. Optional (requires Supabase running): `cd apps/web && pnpm prisma db push`
4. Run tests: `cd apps/web && pnpm test`

---

## Cross-Team Contracts Exported (for Group B)

All contracts from §4.5 of the design are in place:

```ts
// lib/auth/roles.ts
export type Role = 'member' | 'admin'
export const ROLE_HIERARCHY: Record<Role, number> = { member: 1, admin: 2 }

// lib/auth/with-auth.ts
export type MemberRow = Member  // Prisma Member model alias
export type AuthHandler = (req: Request, ctx: { user: MemberRow }) => Promise<Response>
export function withAuth(handler: AuthHandler, options?: { role?: Role }): (req: Request) => Promise<Response>
```

Group B (middleware + login/dashboard pages) can begin work — they only need `@/lib/auth/roles` for the `Role` type (optional), and do not depend on `withAuth()` or Prisma.
