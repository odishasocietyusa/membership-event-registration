# Feature Specification: NestJS Cleanup & Next.js Test Expansion

> **Spec ID:** SPEC-20-nestjs-cleanup-and-test-expansion
> **Status:** Draft
> **Author:** Utkal Nayak
> **Created:** 2026-05-23

---

## 1. Overview

### 1.1 Summary

SPEC-11 completed the core NestJS → Next.js migration: `apps/api` has been deleted, all business logic lives in `apps/web/app/api/` route handlers and `apps/web/lib/` services. However, several layers of cleanup remain: (1) documentation (CLAUDE.md, README.md, scripts) still describes the old dual-server architecture; (2) the Playwright e2e test suite covers only ~20 basic scenarios while the old NestJS suite had 78 tests across users, memberships, and payments; (3) utility scripts still reference `apps/api/.env`. This spec removes every remaining NestJS artifact and expands the Next.js-native Playwright tests to achieve coverage parity.

### 1.2 Goals
- [ ] Remove all NestJS references from CLAUDE.md, README.md, and utility scripts
- [ ] Update `scripts/get-auth-token.sh` and `scripts/get-auth-token.ts` to use `apps/web/.env.local`
- [ ] Expand Playwright e2e test suite to cover authenticated API routes (members, memberships, payments, admin)
- [ ] Verify all existing Jest unit tests still pass after any file-path or import changes
- [ ] CLAUDE.md accurately reflects the current Next.js-only architecture

### 1.3 Non-Goals (Out of Scope)
- Adding new API endpoints or changing business logic
- Database schema changes
- Removing or modifying completed spec artifacts in `specs/artifacts/` (historical record)
- Updating `specs/completed/` files (those are closed history)
- UI changes or styling

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Rewrite CLAUDE.md to describe the current Next.js-only monorepo (remove all `apps/api`, NestJS module, postman, and NestJS test references) | Must Have | CLAUDE.md is the primary dev reference |
| FR-02 | Update README.md to remove NestJS architecture description | Must Have | |
| FR-03 | Update `scripts/get-auth-token.sh` to load env from `apps/web/.env.local` instead of `apps/api/.env` | Must Have | Script currently fails because `apps/api/.env` doesn't exist |
| FR-04 | Update `scripts/get-auth-token.ts` similarly | Must Have | |
| FR-05 | Expand `apps/web/e2e/api.spec.ts` to test all authenticated member API routes (GET/PUT `/api/members/me`, family CRUD, role update, export) | Must Have | Mirror what NestJS users tests covered |
| FR-06 | Add `apps/web/e2e/memberships.spec.ts` covering membership application, status fetch, history, cancellation, and admin approve/reject/assign-honorary | Must Have | Was 28 tests in NestJS suite |
| FR-07 | Add `apps/web/e2e/payments.spec.ts` covering checkout session creation, donation, webhook (mock), payment list, and refund | Should Have | Was 20 tests in NestJS suite |
| FR-08 | Ensure test fixtures (`e2e/global-setup.ts`, `e2e/global-teardown.ts`) correctly create and clean up a test user whose auth token can be used in API tests | Must Have | Current setup creates user; verify token is stored for reuse |
| FR-09 | All new Playwright tests must run against the Next.js dev server on port 3000 (not 3001) | Must Have | |
| FR-10 | Remove `pnpm test:api` root script if it referenced the old NestJS Playwright config | Should Have | Check root `package.json`; it currently only has `test:e2e` |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Test suite runs to completion in CI without manual setup | All tests pass | No hard-coded waits; use Playwright's `webServer` config |
| NFR-02 | Tests that require admin role must `.skip()` with a clear comment rather than fail | Documented skips | Admin promotion requires out-of-band DB change |
| NFR-03 | CLAUDE.md must not reference port 3001 or `apps/api/` anywhere | Zero references | |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] `grep -r "apps/api\|nestjs\|NestJS\|3001" CLAUDE.md README.md scripts/` returns no results
- [ ] `scripts/get-auth-token.sh` runs successfully when `apps/web/.env.local` exists and Supabase is running
- [ ] `pnpm test:e2e` (from root) passes with at least 40 Playwright tests total
- [ ] No Jest unit tests broken
- [ ] CLAUDE.md correctly describes the current monorepo structure (`apps/web`, `apps/supabase` only)

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Authenticated member API | Valid JWT in `Authorization` header | GET `/api/members/me` | 200 with `member` object |
| Unauthenticated member API | No auth header | GET `/api/members/me` | 401 |
| Membership application | Authenticated member, valid `membershipTypeId` | POST `/api/memberships` | 201 or 409 (already active) |
| Membership types public | No auth | GET `/api/memberships/types` | 200 with `types` array |
| Admin-only route | Non-admin JWT | GET `/api/memberships` | 403 |
| Checkout session | Authenticated member with pending membership | POST `/api/payments/checkout-session` | 200 with Stripe URL |
| Auth token script | `apps/web/.env.local` present, Supabase running | `./scripts/get-auth-token.sh` | Prints valid JWT |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Playwright for e2e, Jest for unit tests, TypeScript
- **Must Avoid:** Any reference to port 3001 or NestJS decorators/modules

### 4.2 Patterns to Follow
- Follow existing test patterns in `apps/web/e2e/dashboard.spec.ts` for authenticated request helpers (read token from `.auth/test-user.json`)
- Use `test.skip()` with explanation for tests requiring admin promotion (consistent with existing pattern in the NestJS test suite)
- Service-layer unit tests live in `apps/web/lib/**/*.test.ts`

### 4.3 Files to Modify
- `CLAUDE.md` — full rewrite of architecture sections
- `README.md` — remove NestJS references
- `scripts/get-auth-token.sh` — update env file path
- `scripts/get-auth-token.ts` — update env file path
- `apps/web/e2e/api.spec.ts` — expand authenticated API tests
- `apps/web/playwright.config.ts` — verify `webServer` points to Next.js only

### 4.4 Files to Create
- `apps/web/e2e/memberships.spec.ts` — new test file
- `apps/web/e2e/payments.spec.ts` — new test file

### 4.5 Files NOT to Modify
- `apps/web/lib/**` — business logic is out of scope
- `apps/web/app/api/**` — route handlers are out of scope
- `specs/completed/**` — historical records
- `specs/artifacts/**` — historical records

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- SPEC-11 complete (NestJS `apps/api` deleted) ✅

### 5.2 Downstream Impact
- All future specs will reference the updated CLAUDE.md for architecture context
- CI test runs will use the expanded Playwright suite

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Does `apps/web/e2e/global-setup.ts` already store the access token for API reuse in all test projects? | Open | Inspect file before Phase 2 |
| Are there any remaining `NEXT_PUBLIC_API_URL` env var references in `apps/web` source? | Open | Grep during Phase 1 |
| Does `pnpm-workspace.yaml` still list `apps/api`? | Open | Check during Phase 1 |

---

## 7. References

- `specs/completed/SPEC-11-nestjs-to-nextjs-migration.md` — the completed migration spec
- `apps/web/e2e/` — existing Playwright test files
- `apps/web/lib/` — service layer under test

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation

### Phase 1: Analysis
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-20-nestjs-cleanup-and-test-expansion/01-analysis.md`

### Phase 2: Design
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-20-nestjs-cleanup-and-test-expansion/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-20-nestjs-cleanup-and-test-expansion/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-20-nestjs-cleanup-and-test-expansion/04-qa-report.md`
