# Feature Specification: Foundation & Authentication

> **Spec ID:** SPEC-2-foundation-auth
> **Status:** Draft
> **Author:** Utkal Nayak

---

## 1. Overview

### 1.1 Summary
Establish the foundational infrastructure for the OSA website: Next.js project setup, Supabase Auth with Google OAuth, JIT user sync, and the `withAuth()` middleware pattern that all other modules depend on. Nothing else can be built until this spec is complete.

### 1.2 Goals
- [ ] Next.js 15 App Router project configured and running on Vercel
- [ ] Google OAuth login via Supabase Auth
- [ ] Authenticated session available in both server components and API routes
- [ ] JIT sync: DB user record created automatically on first login
- [ ] `withAuth()` wrapper enforcing authentication and role checks on API routes
- [ ] Prisma connected to Supabase PostgreSQL with singleton pattern

### 1.3 Non-Goals (Out of Scope)
- Any application-level UI beyond a login page and a placeholder dashboard
- Member profile data (covered in SPEC-3)
- Role promotion logic (MEMBER, ADMIN assignment — covered in SPEC-3 and SPEC-4)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | User can sign in with Google via Supabase Auth | Must Have | OAuth redirect flow |
| FR-02 | On first login, a `members` row is created automatically (JIT sync) | Must Have | Triggered in `withAuth()` |
| FR-03 | Session JWT is available in API routes via Bearer token | Must Have | For API-to-API calls |
| FR-04 | Session cookie is available in server components and middleware | Must Have | Via `@supabase/ssr` |
| FR-05 | Unauthenticated requests to protected API routes return 401 | Must Have | |
| FR-06 | Requests with insufficient role return 403 | Must Have | Role hierarchy: public < member < admin |
| FR-07 | Soft-deleted users are rejected with 401 | Must Have | `deleted_at` check in `withAuth()` |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Auth check latency | < 100ms added overhead | Supabase JWT verify is local |
| NFR-02 | Prisma connection safety | No connection exhaustion | `globalThis` singleton pattern |
| NFR-03 | Secrets | Never exposed to client | All Supabase service keys server-only |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] Google OAuth login completes and redirects to dashboard
- [ ] First login creates a row in `members` table with `role = 'member'`
- [ ] Subsequent logins do not create duplicate rows
- [ ] `GET /api/auth/me` returns the current user when authenticated
- [ ] `GET /api/auth/me` returns 401 when no token is provided
- [ ] `GET /api/auth/me` returns 401 for a deleted user
- [ ] All tests passing

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| First login JIT sync | No `members` row exists for the Google account | User completes OAuth | Row created with correct email and `role = 'member'` |
| Repeat login | `members` row already exists | User logs in again | No duplicate row created |
| Valid Bearer token | Authenticated user | `GET /api/auth/me` with valid token | Returns user object with id, email, role |
| Missing token | No Authorization header | `GET /api/auth/me` | Returns 401 |
| Invalid token | Expired or tampered token | `GET /api/auth/me` | Returns 401 |
| Deleted user | `deleted_at` is set on member row | Valid token presented | Returns 401 |
| Insufficient role | Member-role user | Calls admin-only endpoint | Returns 403 |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Next.js 15 App Router, `@supabase/ssr` for cookie sessions, Prisma with `globalThis` singleton, Zod for input validation
- **Must Avoid:** NestJS, class-validator, separate API server

### 4.2 Patterns to Follow
- `withAuth()` wrapper pattern — see `docs/osa-architecture.md` and the approved plan at `.claude/plans/on-another-claude-session-dreamy-kahan.md`
- JWT verified via `supabaseAdmin.auth.getUser(token)` — not decoded locally
- `DATABASE_URL` points to PgBouncer (port 6543, `?pgbouncer=true`); `DIRECT_URL` to port 5432

### 4.3 Files/Modules to Create
- `lib/db/prisma.ts` — Prisma singleton
- `lib/auth/supabase-admin.ts` — Supabase admin client singleton
- `lib/auth/with-auth.ts` — `withAuth()` wrapper (auth + JIT sync + role check)
- `lib/auth/roles.ts` — `ROLE_HIERARCHY` constant
- `app/api/auth/me/route.ts` — `GET /api/auth/me` health-check endpoint
- `app/login/page.tsx` — Login page triggering Google OAuth
- `middleware.ts` — Page-level auth redirect for protected routes
- `prisma/schema.prisma` — Initial schema with `members` table only

### 4.4 Files NOT to Modify
- None — this is the foundation spec

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- Supabase project created with Google OAuth provider enabled
- `.env.local` populated with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`

### 5.2 Downstream Impact
- All other specs (SPEC-3 through SPEC-7) depend on `withAuth()` and the Prisma singleton from this spec

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should we support email/password login in addition to Google OAuth? | Resolved | Google OAuth only. No email/password login at launch. |
| Should session cookies use server-side refresh or rely on Supabase client auto-refresh? | Resolved | Supabase client auto-refresh via `@supabase/ssr` — standard Next.js pattern, no custom refresh logic needed. |

---

## 7. References

- [`docs/osa-architecture.md`](../../docs/osa-architecture.md) — System architecture
- [`apps/api/src/modules/auth/guards/jwt-auth.guard.ts`](../../apps/api/src/modules/auth/guards/jwt-auth.guard.ts) — JIT sync logic to port (lines 17–72)
- [`apps/api/src/modules/auth/guards/roles.guard.ts`](../../apps/api/src/modules/auth/guards/roles.guard.ts) — Role hierarchy to port (lines 43–56)

---

## Agent Workflow Tracking

### Phase 1: Analysis
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-2-foundation-auth/01-analysis.md`

### Phase 2: Design
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-2-foundation-auth/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-2-foundation-auth/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-2-foundation-auth/04-qa-report.md`
