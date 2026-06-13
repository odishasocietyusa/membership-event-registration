# SPEC-29 — Phase 3: Implementation Log

**Spec:** Member Expertise Directory
**Implementer:** Claude Code
**Date:** 2026-06-12
**Status:** COMPLETE

---

## Steps Completed

### 1. Prisma Schema ✅
- Added `ExpertiseProfile` model to `schema.prisma` (memberId unique, fullName, organization, categories[], blurb, isHidden, timestamps)
- Added back-relation `expertiseProfile ExpertiseProfile?` on `Member`
- `npx prisma db push` + `npx prisma generate` — table created; client regenerated

### 2. Shared Constants & Zod Validation ✅
- Created `apps/web/lib/expertise/constants.ts` — `EXPERTISE_CATEGORIES` (10 fixed values), `ELIGIBLE_MEMBERSHIP_TYPES` (life, lifeWard, patron, benefactor, honoraryNoVote)
- Created `apps/web/lib/validation/expertise-profile.schema.ts` — `RegisterExpertiseSchema` (organization optional ≤200, categories 1–10, blurb 10–500), `UpdateExpertiseSchema` (partial + admin-only `isHidden`)

### 3. Service Layer ✅
- Created `apps/web/lib/expertise/expertise-profile-service.ts`
- `ExpertiseProfilePublic` type, `listExpertiseProfiles` (PAGE_SIZE=25, `Promise.all([count, findMany])`, `isHidden`/`category` filters, `orderBy: createdAt desc` — mirrors `member-search.ts`)
- `getExpertiseProfileById`, `getExpertiseProfileByMemberId`, `createExpertiseProfile`, `updateExpertiseProfile`, `deleteExpertiseProfile`

### 4. RED Tests ✅
- `app/api/expertise/route.test.ts` and `app/api/expertise/[id]/route.test.ts` written first
- Confirmed RED: `Cannot find module './route'` (route files did not yet exist)

### 5. API Routes (GREEN) ✅
- `apps/web/app/api/expertise/route.ts` — GET (active-member gate, category/page filters, strips `isHidden`/`memberId`/`updatedAt` from list items), POST (active + eligible-tier gate, 409 on duplicate, Zod validation, 201)
- `apps/web/app/api/expertise/[id]/route.ts` — PATCH (404/403 owner-or-admin, strips `isHidden` for non-admins), DELETE (404/403 owner-or-admin, 204)
- 19/19 tests GREEN

### 6. Pages ✅
- `apps/web/app/membership/expertise/page.tsx` — directory listing, category filter form, Prev/Next pagination, "Register"/"Edit my entry" links
- `apps/web/app/membership/expertise/register/page.tsx` + `RegisterForm.tsx` — eligibility gate with explanatory message, duplicate redirect to edit, checkbox categories + blurb char counter
- `apps/web/app/membership/expertise/[id]/edit/page.tsx` + `EditForm.tsx` — owner/admin guard, PATCH save + DELETE remove

### 7. Admin Moderation ✅
- `apps/web/app/admin/expertise/page.tsx` — paginated table of all entries (`includeHidden: true`), Name/Organization/Categories/Hidden/Actions
- `apps/web/app/admin/expertise/AdminExpertiseActions.tsx` — toggle `isHidden` via PATCH, delete via DELETE (mirrors `AdminServiceActions.tsx`)

### 8. Nav + Dashboard Wiring ✅
- `app/components/nav-bar.tsx` — added `<li><Link href="/membership/expertise">Expertise Directory</Link></li>` in the Members submenu, alongside Membership Types / Upgrade Membership
- `app/dashboard/page.tsx` — added conditional "Register your Expertise" / "Edit my Expertise Entry" link in the "Your Account" fieldset, gated on `ELIGIBLE_MEMBERSHIP_TYPES`

### 9. Playwright E2E ✅ (created, not executed)
- Created `apps/web/e2e/expertise-directory.spec.ts`: unauthenticated 401, ineligible/non-active 403s + register-page message, and an eligible-member flow (register → appears in directory → category filter excludes → duplicate 409 → PATCH update → non-admin `isHidden` strip → DELETE), using direct Prisma calls in `beforeAll`/`afterAll` to temporarily promote the E2E test member to `life`/`active`
- Admin hide/unhide scenario left as `test.skip` — requires admin role promotion, mirrors the existing skipped admin coverage in `memberships.spec.ts`
- **Not executed**: local Supabase CLI fails with a pre-existing config error (`'storage' has invalid keys: analytics, vector`), unrelated to this spec, so `pnpm --filter=web test:e2e` could not be run in this environment

---

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| `app/api/expertise/route.test.ts` | 11 | ✅ All pass |
| `app/api/expertise/[id]/route.test.ts` | 8 | ✅ All pass |
| Full suite (`pnpm test`) | 404 | ✅ 402 pass / 2 pre-existing fails (unrelated: `auth/callback`, `events/page`) |
| ESLint (`next lint`, new/changed files) | — | ✅ No warnings or errors |
| TypeScript (`tsc --noEmit`) | — | ✅ No errors |
| Playwright E2E | — | ⚠️ Not run — pre-existing local Supabase CLI config error |

---

## Deviations from Design

| Deviation | Rationale |
|-----------|-----------|
| GET `/api/expertise` list items return only `{ id, fullName, organization, categories, blurb, createdAt }` (no `memberId`/`isHidden`/`updatedAt`) for all callers, with no admin branch | Matches the literal response shape in §API Routes; `/admin/expertise` reads via the service layer directly (per page spec), so the API route never needs an admin path — keeps the route simple (AGENTS principle #2) |
| E2E spec uses `PrismaClient` directly in `beforeAll`/`afterAll` to set the test member's `membershipType`/`memberStatus` | No existing E2E spec covers eligibility-gated features; this is the only way to exercise the eligible-member path without a manual admin-promotion step, and is scoped entirely to the new spec file |

---

## Files Created / Modified

| File | Action |
|------|--------|
| `apps/web/prisma/schema.prisma` | Added `ExpertiseProfile` model; back-relation on `Member` |
| `apps/web/lib/expertise/constants.ts` | Created |
| `apps/web/lib/validation/expertise-profile.schema.ts` | Created |
| `apps/web/lib/expertise/expertise-profile-service.ts` | Created |
| `apps/web/app/api/expertise/route.ts` | Created |
| `apps/web/app/api/expertise/route.test.ts` | Created |
| `apps/web/app/api/expertise/[id]/route.ts` | Created |
| `apps/web/app/api/expertise/[id]/route.test.ts` | Created |
| `apps/web/app/membership/expertise/page.tsx` | Created |
| `apps/web/app/membership/expertise/register/page.tsx` | Created |
| `apps/web/app/membership/expertise/register/RegisterForm.tsx` | Created |
| `apps/web/app/membership/expertise/[id]/edit/page.tsx` | Created |
| `apps/web/app/membership/expertise/[id]/edit/EditForm.tsx` | Created |
| `apps/web/app/admin/expertise/page.tsx` | Created |
| `apps/web/app/admin/expertise/AdminExpertiseActions.tsx` | Created |
| `apps/web/e2e/expertise-directory.spec.ts` | Created |
| `apps/web/app/components/nav-bar.tsx` | Added Expertise Directory nav link |
| `apps/web/app/dashboard/page.tsx` | Added conditional Expertise Entry link |
