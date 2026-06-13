# SPEC-29 — Phase 4: QA Report

**Spec:** Member Expertise Directory
**QA:** Claude Code
**Date:** 2026-06-12
**Status:** APPROVED (with noted limitation)

---

## Test Suite Results

| Suite | Tests | Result |
|-------|-------|--------|
| `app/api/expertise/route.test.ts` | 11 | ✅ All pass |
| `app/api/expertise/[id]/route.test.ts` | 8 | ✅ All pass |
| Full suite (`pnpm test`) | 404 | ✅ 402 pass / 2 pre-existing fails (unrelated) |
| ESLint (`next lint`, new/changed files) | — | ✅ No warnings or errors |
| TypeScript (`tsc --noEmit`) | — | ✅ No errors |
| Playwright E2E (`expertise-directory.spec.ts`) | 10 (+1 skipped) | ⚠️ Written, not executed (see Known Limitations) |

**Pre-existing failures:** `app/api/auth/callback/route.test.ts`, `app/events/page.test.ts` — confirmed unrelated to SPEC-29 (no diffs to these files in this branch).

---

## Acceptance Criteria Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| REQ-01 Eligibility gate on registration | ✅ | `POST /api/expertise` 403s unless `membershipType ∈ ELIGIBLE_MEMBERSHIP_TYPES`; T-06/T-07 cover not-active and ineligible-tier |
| REQ-02 Registration form (organization optional, categories multi-select, blurb required/capped) | ✅ | `RegisterForm.tsx` — checkboxes from `EXPERTISE_CATEGORIES`, blurb char counter, organization optional |
| REQ-03 Self-edit / self-delete own entry | ✅ | `EditForm.tsx` PATCH + DELETE; owner-or-admin enforced server-side (T-13/T-14, T-17/T-18) |
| REQ-04 Directory listing page, active-member gated | ✅ | `/membership/expertise` — `getCurrentMember()` redirect to `/login`/`/dashboard` if not active |
| REQ-05 Category filter (server-side) | ✅ | `<form method="GET">` + `categories: { has: category }` in service layer; T-05 / E2E "category filter narrows results" |
| REQ-06 Pagination at 25/page | ✅ | `PAGE_SIZE = 25`, mirrors `member-search.ts`; T-04 verifies `page`/`pageSize`/`total` shape |
| REQ-07 Sort newest-first | ✅ | `orderBy: { createdAt: 'desc' }` in `listExpertiseProfiles` |
| REQ-08 Viewer access control — active members only | ✅ | `GET /api/expertise` 403 for non-active (T-02/T-03); page-level redirect mirrors `services/page.tsx` |
| REQ-09 Admin hide/unhide (soft moderation) | ✅ | `/admin/expertise` + `AdminExpertiseActions.tsx`; PATCH `isHidden` admin-only (T-15/T-16 verify non-admin strip) |
| D-10 One entry per member | ✅ | `memberId @unique`; 409 on duplicate POST (T-08, E2E "POST again returns 409") |
| D-11 `fullName` snapshot vs. free-text `organization` | ✅ | `fullName` from `ctx.user.fullName`, never user-supplied; `organization` optional free text |
| D-13 Nav entry | ✅ | "Expertise Directory" added to Members submenu in `nav-bar.tsx` |
| D-15 Dashboard link | ✅ | Conditional "Register your Expertise" / "Edit my Expertise Entry" link, gated on `ELIGIBLE_MEMBERSHIP_TYPES` |
| NFR (styling) | ⏸ | Deferred — unstyled functional stubs per `[[project_frontend_styling]]` constraint (D-01) |

---

## Eligibility & Moderation Verification

| Scenario | Expected | Covered by |
|----------|----------|-----------|
| Annual/Five-Year member attempts registration | 403 + explanatory message | T-07 (API), E2E "register page shows ineligibility message" |
| Non-active member views/registers | 403 | T-02 (GET), T-06 (POST) |
| Duplicate registration | 409, redirect to edit on page | T-08, E2E |
| Non-owner/non-admin PATCH or DELETE | 403 | T-13, T-17 |
| Admin sets `isHidden` | Persisted | T-15 |
| Non-admin attempts `isHidden` | Silently stripped, value unchanged | T-16, E2E "non-admin cannot set isHidden via PATCH" |
| Hidden entries excluded from public listing | `isHidden: false` in `where` for non-admin `listExpertiseProfiles` | Service-layer logic; admin page passes `includeHidden: true` |

---

## Files Delivered

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

---

## Known Limitations

- **Playwright E2E not executed:** local Supabase CLI fails with a pre-existing config error (`'storage' has invalid keys: analytics, vector`), unrelated to this spec — blocks `pnpm --filter=web test:e2e` in this environment. The spec file is written and follows existing conventions; recommend running it in CI or a working local Supabase environment before relying on it as a regression gate.
- **Admin hide/unhide E2E coverage skipped** (`test.skip`) — requires promoting the E2E test user to `role: admin`, mirroring the existing skipped admin coverage in `memberships.spec.ts`. Unit tests (T-15/T-16) cover the same logic at the API layer.
- **NFR styling/responsiveness:** deferred to a future Figma-driven spec, per project-wide constraint (D-01).
- **No notification on admin hide:** admin hides an entry silently, same precedent as SPEC-23's approval flow (no email sent). A future spec could add this if desired.

---

## SPEC-29 CLOSED
