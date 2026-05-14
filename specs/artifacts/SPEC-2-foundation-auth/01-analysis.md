# Phase 1: Requirement Analysis

> **Spec:** SPEC-2-foundation-auth
> **Analyst Agent:** Claude Code
> **Date:** 2026-05-13
> **Status:** Complete

---

## 1. Spec Understanding

### 1.1 Feature Summary

This spec establishes the authentication and infrastructure foundation for the new OSA Next.js website. It has zero upstream code dependencies — everything created here is greenfield. It produces the shared primitives (`withAuth()`, Prisma singleton, Supabase admin client, role hierarchy) that every subsequent spec (SPEC-3 through SPEC-8) will import and build on.

The core contract is:
- A user who signs in with Google via Supabase Auth gets a `members` row created automatically on their first API call (JIT sync).
- Every protected API route is wrapped with `withAuth(handler, { role })` which verifies the token, runs JIT sync, checks soft-delete, and checks the role — returning 401 or 403 as appropriate.
- `GET /api/auth/me` is the canonical health-check that proves this contract is working.

### 1.2 Key Objectives

1. Supabase Google OAuth flow completes end-to-end with session cookies available in server components and as Bearer tokens in API routes.
2. `withAuth()` wrapper encapsulates all auth logic — no ad-hoc token checking in any route handler.
3. JIT sync creates exactly one `members` row per Supabase auth user, idempotently.
4. Prisma connects to Supabase PostgreSQL safely under serverless constraints (no connection exhaustion).

---

## 2. Requirements Breakdown

### 2.1 Extracted Requirements

| ID | Requirement | Type | Complexity | Dependencies |
|----|-------------|------|------------|--------------|
| REQ-01 | Google OAuth sign-in via Supabase Auth | Functional | Medium | Supabase project + Google OAuth provider configured |
| REQ-02 | Session cookie managed by `@supabase/ssr` (auto-refresh) | Functional | Low | REQ-01 |
| REQ-03 | Bearer token support in API routes | Functional | Low | REQ-01 |
| REQ-04 | JIT sync: create `members` row on first authenticated API call | Functional | Medium | REQ-03, Prisma singleton |
| REQ-05 | JIT sync is idempotent — no duplicate rows | Functional | Low | REQ-04 |
| REQ-06 | Soft-deleted users rejected with 401 | Functional | Low | REQ-04 |
| REQ-07 | Insufficient role rejected with 403 | Functional | Low | Role hierarchy |
| REQ-08 | `GET /api/auth/me` returns user object (authenticated) | Functional | Low | REQ-04 |
| REQ-09 | `GET /api/auth/me` returns 401 (unauthenticated) | Functional | Low | REQ-08 |
| REQ-10 | Prisma singleton prevents connection pool exhaustion | Non-Functional | Low | None |
| REQ-11 | Auth check adds < 100ms latency | Non-Functional | Low | JWT verified via Supabase `getUser()` |
| REQ-12 | Supabase service key never exposed to client bundle | Non-Functional | Low | Server-only files |
| REQ-13 | Login page triggers Google OAuth redirect | Functional | Low | REQ-01 |
| REQ-14 | Middleware redirects unauthenticated users away from protected pages | Functional | Low | REQ-02 |

### 2.2 Implicit Requirements

- [ ] **`members` table `role` field defaults to `'member'`** on JIT sync — the spec says "row created with `role = 'member'`" but the architecture doc uses `member · admin` (lowercase). The new schema must use lowercase to match `docs/osa-architecture.md`.
- [ ] **`deleted_at` column** must exist on the `members` table for soft-delete check in `withAuth()`. The spec calls this field `deleted_at` (not `deletedAt`; Prisma maps snake_case to camelCase automatically).
- [ ] **`user_id` column** on `members` must be nullable initially (the architecture doc says "nullable until admin links account"), but JIT sync must write it on first login. This is consistent: JIT sync sets `user_id` from `supabase auth user.id`.
- [ ] **`email` uniqueness** — the `members` table has `email unique`. JIT sync must use `upsert` (or `findUnique` + `create`) to guarantee idempotency, not a plain `create`.
- [ ] **OAuth callback route** — `@supabase/ssr` requires an `/api/auth/callback/route.ts` to exchange the OAuth code for a session. This is not listed in `4.3 Files/Modules to Create` but is essential for the OAuth flow to work.
- [ ] **Environment variable validation at startup** — if `SUPABASE_SERVICE_ROLE_KEY` is missing, the admin client should fail loudly at import time, not silently at request time.
- [ ] **`next/headers` server-only** — all Supabase SSR cookie operations must happen in server context; the admin client must never be imported in a client component.

### 2.3 Edge Cases Identified

1. **Race condition on JIT sync**: Two simultaneous first requests for the same user could both attempt `INSERT` into `members`. Mitigation: use Prisma `upsert` with `where: { email }` or a unique-constraint catch.
2. **Google account email change**: If a user changes their Google email, `auth.users.email` changes but the old `members.email` row persists. Out of scope for this spec but should be noted for SPEC-3.
3. **Token expiry between middleware and API call**: Middleware reads the cookie and validates; the API call arrives milliseconds later with an expired token. Mitigation: Supabase `getUser()` is the authoritative check in `withAuth()` — middleware is only for page-level UX redirects, not the security boundary.
4. **PgBouncer transaction mode**: With `?pgbouncer=true` on `DATABASE_URL`, Prisma cannot use interactive transactions or advisory locks. The JIT sync logic must not rely on transactions that span multiple statements. Simple `upsert` works fine.
5. **Service role key in edge runtime**: Next.js middleware runs in the Edge runtime, which cannot access Node.js environment variables via `process.env` in all configurations. Middleware should use `@supabase/ssr` with the **anon key** (not service role) and the session cookie — not import `lib/auth/supabase-admin.ts`.

---

## 3. Scope Validation

### 3.1 In Scope (Confirmed)

- `lib/db/prisma.ts` — Prisma singleton using `globalThis` pattern
- `lib/auth/supabase-admin.ts` — Supabase admin client (service role key, no session)
- `lib/auth/with-auth.ts` — `withAuth()` wrapper: token extraction → `getUser()` → JIT sync → soft-delete check → role check
- `lib/auth/roles.ts` — `ROLE_HIERARCHY` constant (`{ member: 1, admin: 2 }`)
- `app/api/auth/me/route.ts` — `GET /api/auth/me`
- `app/api/auth/callback/route.ts` — OAuth code exchange (implicit, see §2.2)
- `app/login/page.tsx` — Login page, Google OAuth button
- `middleware.ts` — Page-level redirect for unauthenticated visitors to protected routes
- `prisma/schema.prisma` — Initial schema: `members` table only (plus enums)

### 3.2 Out of Scope (Confirmed)

- Member profile data (`full_name`, `phone`, `address`, `chapter`, etc.) — SPEC-3
- Role promotion logic (assigning `admin`) — SPEC-3 / SPEC-4
- Payment, awards, messages, family_members, obituary tables — later specs
- Any UI beyond login page and a minimal placeholder dashboard redirect
- Sanity CMS integration
- Stripe integration

### 3.3 Ambiguous (Needs Clarification)

None — all open questions in the spec were previously resolved.

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OAuth callback route omitted from spec's file list | High (it is missing) | High — OAuth will fail without it | Add `app/api/auth/callback/route.ts` to implementation plan |
| Prisma missing from `apps/web/package.json` | High — not listed in current deps | High | Add `prisma` + `@prisma/client` to web package; add `prisma/schema.prisma` in `apps/web/` |
| `members` role enum mismatch (spec uses `'member'` lowercase; NestJS schema uses `MEMBER` uppercase) | Medium | Medium — type errors at runtime | Define new Prisma enum `Role { member admin }` (lowercase matches architecture doc) |
| Race condition on JIT sync | Low | Medium — duplicate members row | Use `upsert` on `email` unique field |
| Middleware importing service-role secrets | Low | High — secret exposed to edge runtime bundle | Keep middleware using anon-key + cookie only |
| `DATABASE_URL` pointed at wrong port | Medium (setup error) | High — connection failures | Document PgBouncer vs direct URL clearly in `.env.example` |

---

## 5. Questions for User

> No blocking questions. All open questions in the spec were previously resolved. The implicit requirements identified in §2.2 are implementation details the analyst recommends the architect address — they do not require user input.

---

## 6. Recommendations

### 6.1 Suggested Additions

- **`app/api/auth/callback/route.ts`** — must be added; without this the Google OAuth redirect has nowhere to land and the session is never established. This is a standard `@supabase/ssr` pattern.
- **`app/dashboard/page.tsx` (placeholder)** — the spec says "redirect to dashboard" after login. A minimal stub page prevents a 404 on successful login.
- **`.env.example`** — identified as a gap before this spec started. Worth creating as part of this foundation spec since it defines all the environment variables needed.

### 6.2 Suggested Simplifications

- **Role hierarchy**: The architecture only defines two roles (`member · admin`). The NestJS codebase had four (`GUEST · MEMBER · CONTRIBUTOR · ADMIN`). For the new website, `ROLE_HIERARCHY = { member: 1, admin: 2 }` is sufficient. No `contributor` or `guest` levels needed at this stage.
- **`middleware.ts` scope**: Keep it minimal — only redirect unauthenticated users away from `/dashboard/*` and `/admin/*`. Don't try to implement full RBAC at the middleware level; that belongs in `withAuth()`.

### 6.3 Technical Concerns

- **Prisma location**: The `apps/web/` package currently has no Prisma setup. `prisma/schema.prisma` and `prisma/` output directory need to live in `apps/web/` (not the root or `apps/api/`). The generate output path in `schema.prisma` should point to `../../node_modules/.prisma/client` or a local path — this needs to be worked out in the Design phase.
- **`@supabase/ssr` cookie helpers**: The `createServerClient` call requires a `cookies()` import from `next/headers`. In Next.js 15, `cookies()` is async. The `getAll` / `setAll` pattern from the latest `@supabase/ssr` docs handles this correctly; older examples use the deprecated sync API.
- **No `bodyParser: false` needed**: Unlike Express, Next.js App Router does not require disabling body parsing for raw request bodies (relevant for Stripe webhooks in SPEC-4, but worth noting here).

---

## 7. Analysis Summary

### Ready for Design Phase?

- [x] All requirements understood
- [x] No blocking questions remain
- [x] Scope is clearly defined
- [x] Risks are acceptable

**Recommendation:** ✅ Proceed to Design

---

## Handoff to Design Agent

**Key Context for Designer:**

1. **OAuth callback route is missing from the spec's file list** — `app/api/auth/callback/route.ts` must be included. This is the URL Supabase redirects to after Google auth; it exchanges the `code` param for a session cookie via `@supabase/ssr`.

2. **Prisma must be set up fresh in `apps/web/`** — the web package has no Prisma dependencies yet. The designer must plan: adding `prisma` + `@prisma/client` to `apps/web/package.json`, creating `apps/web/prisma/schema.prisma`, and configuring the generate output path. The existing `apps/api/prisma/schema.prisma` is a reference for patterns but is not shared.

3. **Role enum uses lowercase** — `members.role` is `enum { member admin }` (matching `docs/osa-architecture.md`), not the `MEMBER / ADMIN` uppercase from the NestJS app. All new code uses lowercase.

4. **`withAuth()` signature to target**:
   ```ts
   type Handler = (req: Request, ctx: { user: MemberRow }) => Promise<Response>
   
   function withAuth(
     handler: Handler,
     options?: { role?: 'member' | 'admin' }
   ): (req: Request) => Promise<Response>
   ```
   Token extracted from `Authorization: Bearer <token>` header. Calls `supabaseAdmin.auth.getUser(token)`. On success: JIT sync → soft-delete check → role check → call `handler`.

5. **Middleware is for UX only, not security** — middleware uses the SSR cookie client with anon key. It redirects unauthenticated users from `/dashboard` and `/admin` routes to `/login`. The actual security enforcement is in `withAuth()` in the API routes.

6. **TDD order of operations**: Write the failing test for each unit first. Suggested test-first order: `roles.ts` → `supabase-admin.ts` (mock) → `withAuth()` (unit tests with mocked Prisma + Supabase) → `/api/auth/me` route (integration) → login page (manual).
