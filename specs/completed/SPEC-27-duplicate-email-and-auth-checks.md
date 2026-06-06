# Feature Specification: Duplicate Email and Auth Checks

> **Spec ID:** SPEC-27-duplicate-email-and-auth-checks
> **Status:** Implementation Complete — Pending Manual Verification
> **Author:** Utkal Nayak
> **Created:** 2026-06-06

---

## 1. Overview

### 1.1 Summary

Three related email-integrity and authentication correctness issues discovered during manual testing:

1. **Duplicate registration email** — A user who already has a primary `Member` account could reach the Supabase `signUp()` call without any prior guard, causing a silent re-send of the verification email with no user-facing feedback. The fix adds a lightweight pre-check against the `members` table before `signUp()` is called, and surfaces an actionable conflict UI.

2. **Duplicate spouse email** — The family-member add and update flows did not validate whether a supplied spouse email was already registered as a primary `Member` or already linked as a spouse to a different primary member. The fix adds service-layer validation that throws a typed `CONFLICT` error, which the route handlers surface as HTTP 409 with the service message.

3. **Nav auth state mismatch** — After login, the root layout's `NavBar` continued to show "Sign In | Register" even though the page content (e.g. Dashboard) correctly rendered the authenticated user. The layout was calling `supabase.auth.getSession()`, which reads cookies without server-side validation and can return null for freshly-set sessions. The fix replaces the layout's ad-hoc session check with a direct call to `getCurrentMember()`, the same helper used by all page-level server components.

### 1.2 Goals
- [x] Registration page blocks duplicate emails before calling `supabase.auth.signUp()`
- [x] Conflict UI at registration offers "Yes, Sign In" or "Register with a Different Email"
- [x] Adding a spouse family member validates the email is not a primary member or already-linked spouse
- [x] Updating a spouse family member applies the same email validation (only when email changes)
- [x] Route handlers return HTTP 409 with the service error message on CONFLICT
- [x] Root layout NavBar reflects authenticated state immediately after login

### 1.3 Non-Goals (Out of Scope)
- Real-time email availability check as the user types (debounced input) — check fires only on submit
- Supabase-level duplicate detection (relies on `members` table, not Supabase Auth)
- CSS / styling of conflict UI — unstyled functional HTML per project styling freeze

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Before calling `supabase.auth.signUp()`, the registration page calls `GET /api/members/check-email?email=` | Must Have | Prevents silent re-verification email |
| FR-02 | If the email exists in `members`, show conflict message and two buttons: "Yes, Sign In" (→ `/login`) and "Register with a Different Email" (clears email field, dismisses prompt) | Must Have | No Supabase call is made when conflict detected |
| FR-03 | `GET /api/members/check-email` is unauthenticated; accepts `email` query param; returns `{ exists: boolean }` | Must Have | No auth needed — used before account creation |
| FR-04 | Missing `email` param returns HTTP 400 | Must Have | |
| FR-05 | `addFamilyMember` validates spouse email is not a primary `Member.email` before creating | Must Have | Throws `CONFLICT` with message |
| FR-06 | `addFamilyMember` validates spouse email is not already a `FamilyMember.email` for a different primary member | Must Have | Throws `CONFLICT` with message |
| FR-07 | `updateFamilyMember` applies the same two validations, but only when the email field is being changed | Must Have | Skip if email unchanged |
| FR-08 | `POST /api/members/me/family` and `PUT /api/members/me/family/[id]` pass the service CONFLICT message through as HTTP 409 | Must Have | Error message shown verbatim to caller |
| FR-09 | Root layout uses `getCurrentMember()` (calls `supabase.auth.getUser()`) instead of `supabase.auth.getSession()` for NavBar auth state | Must Have | Fixes nav mismatch after login |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | `check-email` endpoint queries only `Member.email` (no Supabase Auth lookup) | Performance | `findUnique` with `select: { id: true }` — minimal payload |
| NFR-02 | Spouse email validation runs in the service layer, not the route handler | Architecture | Route handlers stay thin; validation co-located with business logic |
| NFR-03 | No CSS on any new or modified UI elements | Project constraint | Styling freeze until Figma design delivered |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [x] Registering with an already-registered email shows the conflict UI instead of proceeding to email verification
- [x] "Yes, Sign In" navigates to `/login`
- [x] "Register with a Different Email" clears the email field and re-shows the registration form
- [x] Adding a spouse with a primary-member email returns 409 with the service message
- [x] Adding a spouse with an already-linked spouse email returns 409 with the service message
- [x] Updating a spouse email to a conflicting address returns 409
- [x] NavBar shows authenticated links immediately after login, without a page refresh
- [x] All new route logic covered by unit tests (REG-CE-01 through REG-CE-03, MEM-20a, MEM-20b, MEM-28)
- [x] `tsc --noEmit` passes with no errors

### 3.2 Test Coverage

| Test ID | Description | File |
|---------|-------------|------|
| REG-CE-01 | `check-email` returns `{ exists: false }` for unregistered email | `app/api/members/check-email/route.test.ts` |
| REG-CE-02 | `check-email` returns `{ exists: true }` for registered email | `app/api/members/check-email/route.test.ts` |
| REG-CE-03 | `check-email` returns 400 when email param is absent | `app/api/members/check-email/route.test.ts` |
| MEM-20a | `POST /family` returns 409 when spouse email is a primary member | `app/api/members/me/family/route.test.ts` |
| MEM-20b | `POST /family` returns 409 when spouse email is already linked to another member | `app/api/members/me/family/route.test.ts` |
| MEM-28 | `PUT /family/[id]` returns 409 when updated spouse email is already registered | `app/api/members/me/family/[id]/route.test.ts` |

---

## 4. Implementation

### 4.1 Files Created
- `apps/web/app/api/members/check-email/route.ts` — unauthenticated GET endpoint
- `apps/web/app/api/members/check-email/route.test.ts` — unit tests REG-CE-01 through REG-CE-03

### 4.2 Files Modified
- `apps/web/app/register/page.tsx` — added `emailAlreadyRegistered` state; pre-check in `submitAccountStep()`; conflict UI branch in step 1 render
- `apps/web/lib/members/services/member-family.ts` — added `validateSpouseEmail`; wired into `addFamilyMember` (before create) and `updateFamilyMember` (before update, only when email changes)
- `apps/web/app/api/members/me/family/route.ts` — CONFLICT error passthrough → HTTP 409
- `apps/web/app/api/members/me/family/[id]/route.ts` — CONFLICT error passthrough → HTTP 409
- `apps/web/app/layout.tsx` — replaced `getSession()` + internal HTTP fetch with `getCurrentMember()` for NavBar user prop

### 4.3 Commits
- `6859f7b` — spouse email link to main profile added
- `103dd86` — duplicate spouse email check
- `2378b45` — duplicate register email check
- *(uncommitted)* — layout.tsx NavBar auth fix

---

## 5. Decision Log

| Decision | Rationale |
|----------|-----------|
| Pre-check via `members` table rather than Supabase Auth | Supabase `signUp()` silently re-sends verification for unverified duplicate accounts — app-level check is the only reliable gate |
| Unauthenticated `check-email` endpoint | Called before account creation, so no auth token exists yet |
| Service-layer validation for spouse email | Keeps route handlers thin; validation is a business rule, not HTTP plumbing |
| `getCurrentMember()` in layout instead of `getSession()` | `getSession()` reads cookies without server validation and returns null for freshly-set sessions; `getUser()` validates with Supabase servers |
