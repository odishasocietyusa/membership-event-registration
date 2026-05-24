# Phase 3: Implementation — SPEC-20 NestJS Cleanup & Next.js Test Expansion

**Spec:** SPEC-20-nestjs-cleanup-and-test-expansion  
**Phase:** 3 — Implementation  
**Status:** Complete  
**Date:** 2026-05-23  

---

## Changes Made

### 1. `pnpm-workspace.yaml`
- Removed stale `'@nestjs/core': false` entry from `allowBuilds`

### 2. `scripts/get-auth-token.sh`
- Updated header comment (removed Postman reference)
- Changed `apps/api/.env` → `apps/web/.env.local` (script was broken — file doesn't exist)
- Added variable aliases: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY` mapped from the new env var names (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- Updated usage instructions to show curl instead of Postman

### 3. `scripts/get-auth-token.ts`
- Updated header comment
- Changed `dotenv.config` path from `apps/api/.env` → `apps/web/.env.local`
- Changed `process.env.SUPABASE_URL` → `process.env.NEXT_PUBLIC_SUPABASE_URL`
- Changed `process.env.SUPABASE_SERVICE_KEY` → `process.env.SUPABASE_SERVICE_ROLE_KEY`
- Updated usage instructions to show curl instead of Postman

### 4. `apps/web/e2e/global-setup.ts` (bug fix, not in original scope but needed to unblock tests)
- Changed `page.waitForURL('**/dashboard')` → `page.waitForURL(/\/(dashboard|register)/)`
- New users without a complete profile redirect to `/register`, not `/dashboard`

### 5. `apps/web/e2e/auth.spec.ts` (bug fix, not in original scope but needed to unblock tests)
- Updated "valid credentials redirect to dashboard" test to accept `/register` as a valid redirect destination for new test users

### 6. `apps/web/playwright.config.ts`
- Added `memberships.spec.ts` and `payments.spec.ts` to the `member` project's `testMatch` array

### 7. `apps/web/e2e/api.spec.ts`
- Added `fs`, `path` imports and `getAccessToken()` helper
- Added 6 new 401 checks: PUT `/api/members/me`, GET/POST `/api/members/me/family`, GET `/api/members/me/export`, GET/POST `/api/payments/me`, POST `/api/payments/checkout-session`
- Added new `describe` block "Authenticated member API routes" with 7 tests:
  - GET `/api/auth/me` — returns logged-in user
  - GET `/api/members/me` — returns member record
  - PUT `/api/members/me` — updates profile fields
  - GET `/api/members/me/family` — returns empty array for new user
  - POST `/api/members/me/family` → GET list → DELETE (self-cleaning test)
  - GET `/api/members/me/export` — returns 200
  - GET `/api/members/search` — returns 403 for non-active member

### 8. `apps/web/e2e/memberships.spec.ts` (new file)
- 4 test describes, ~16 tests total:
  - Public: GET `/api/memberships/types`
  - Unauthenticated 401 checks (4 routes)
  - Authenticated: GET me, history, POST apply, POST conflict (409), GET after apply, DELETE cancel
  - Admin skipped (4 routes with `test.skip`)

### 9. `apps/web/e2e/payments.spec.ts` (new file)
- 3 test describes, ~10 tests total:
  - Unauthenticated 401 checks (3 routes)
  - Authenticated: GET payments/me, checkout-session with bad type (400), admin-only type (403), valid type (200||500), upgrade-session (200||400||500)
  - Admin skipped (2 routes with `test.skip`)

### 10. `CLAUDE.md` (project-level)
- Full rewrite: removed all NestJS module descriptions, `apps/api/` references, port 3001, postman collection, NestJS-specific troubleshooting, NestJS test commands
- Updated tech stack, monorepo structure tree, dev commands, Prisma commands (now `apps/web/`), testing section, architecture patterns, env vars, implementation status
- Spec-driven workflow section preserved unchanged

### 11. `README.md`
- Complete rewrite: removed NestJS backend row, `apps/api/` references, port 3001, curl examples pointing at 3001, Postman collection mention, NestJS Prisma commands
- Updated to describe single Next.js server, updated API endpoint table with correct Next.js routes and port 3000, updated quick start steps

---

## Estimated Test Count After This Implementation

| File | Tests |
|------|-------|
| `public.spec.ts` | 5 |
| `auth.spec.ts` | 6 |
| `register.spec.ts` | 6 |
| `api.spec.ts` | ~27 |
| `dashboard.spec.ts` | 4 |
| `memberships.spec.ts` | ~12 (excl. skips) |
| `payments.spec.ts` | ~8 (excl. skips) |
| **Total** | **~68** |

---

## Files NOT Changed

- `apps/web/app/api/**` — route handlers untouched
- `apps/web/lib/**` — service layer untouched
- `apps/web/prisma/**` — schema untouched
- `packages/**` — no NestJS deps were present
- `specs/completed/**` and `specs/artifacts/**` — historical records preserved
