# Feature Specification: Spouse Linked Login

> **Spec ID:** SPEC-19-spouse-linked-login
> **Status:** Draft
> **Author:** Utkal Nayak
> **Created:** 2026-05-18

---

## 1. Overview

### 1.1 Summary

Allows a spouse to log in with their own Supabase credentials and access the primary member's profile with full edit permissions. The primary member links the spouse by listing their email on the profile page (already captured via `FamilyMember.email` from SPEC-18). On the spouse's first login, `withAuth` detects the email match against `FamilyMember.email` and returns the primary member's row instead of creating a new Member record. The linked state is tracked via a new `FamilyMember.spouseUserId` field — once populated, the spouse email field becomes read-only for both the primary and the spouse, preventing accidental de-linking.

This spec also introduces a controlled email-change flow for primary members: the primary can update their login email via the profile page, which calls the Supabase Admin API to update the email in Supabase Auth directly — no new account creation required. Spouse email changes use a revoke-then-relink model instead (primary clicks "Change spouse login", clears the link, enters a new email, new spouse signs up).

### 1.2 Goals
- [ ] Spouse can log in with their own email/password or Google and land on the primary member's profile
- [ ] Spouse has identical edit permissions to the primary member (full edit)
- [ ] Spouse can initiate membership payments and renewals
- [ ] Access is granted automatically — no invite/consent step required
- [ ] Spouse email field becomes read-only once the spouse has logged in (spouseUserId set)
- [ ] Primary can revoke and re-link spouse access via a "Change spouse login" button
- [ ] A visible banner indicates when the session is a spouse-linked login
- [ ] Primary member can change their own login email via Supabase Admin API update
- [ ] Attempting to link an email already registered as a primary member is blocked with a validation error

### 1.3 Non-Goals (Out of Scope)
- Multiple spouse accounts (one spouse link per primary member at any time)
- Child or "other" relation linked login — spouse only
- Supabase email verification flow for spouse (spouse signs up normally via /register or Google)
- Admin UI for managing spouse links (out of scope; admin can edit DB directly if needed)
- Switching auth providers for spouse (Google ↔ email/password) — out of scope

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | When a Supabase user logs in and their email matches `FamilyMember.email` with `relation='spouse'` and `deletedAt=null`, `withAuth` returns the primary member's `Member` row | Must Have | Core linking mechanism |
| FR-02 | On first spouse login, `FamilyMember.spouseUserId` is written with the spouse's Supabase `authUser.id` | Must Have | Tracks linked state; mirrors `Member.userId` pattern |
| FR-03 | A spouse-linked session displays a persistent banner: "You are accessing [Primary Name]'s profile as their spouse." | Must Have | Both on dashboard and profile page |
| FR-04 | Spouse has full edit permissions — identical to the primary member | Must Have | Same form, same API calls, same save behaviour |
| FR-05 | Spouse can initiate Stripe checkout for membership renewals | Must Have | No restriction on payment flows |
| FR-06 | Once `FamilyMember.spouseUserId` is set, the spouse email field is read-only for both primary and spouse | Must Have | Prevents accidental de-linking |
| FR-07 | A "Change spouse login" button appears below the read-only spouse email when spouseUserId is set | Must Have | Triggers revoke flow |
| FR-08 | Clicking "Change spouse login" shows a confirmation: "This will revoke [email]'s access. They will no longer be able to log in until you link a new email." On confirm: clears `FamilyMember.email` and `FamilyMember.spouseUserId`; signs out current session if spouse is logged in | Must Have | |
| FR-09 | After revocation, the spouse email field becomes editable again; primary or spouse can enter a new email | Must Have | |
| FR-10 | When primary saves a new spouse email, validate that the email does not already belong to an existing `Member` row — if it does, show: "This email is already registered as a primary member and cannot be linked as a spouse." | Must Have | Prevents cross-linking |
| FR-11 | Primary member can change their own login email from the profile page via a dedicated "Change login email" input + confirm button | Must Have | Uses Supabase Admin API |
| FR-12 | When primary changes their login email: call `supabaseAdmin.auth.admin.updateUserById(member.userId, { email: newEmail })`, then update `Member.email` in DB. Sign out current session so primary must re-login with new email. | Must Have | Old credentials immediately invalid in Supabase |
| FR-13 | Before changing primary email, validate: new email not already a `Member.email` in DB; not already a `FamilyMember.email` | Must Have | |
| FR-14 | When a revoked spouse (old Supabase account) logs in again, `withAuth` finds no match and JIT-creates a new empty `Member` row — they land on `/register` to complete their own profile | Must Have | Acceptable behaviour — they see an empty account |
| FR-15 | No CSS — unstyled functional HTML only | Must Have | Project-wide styling freeze |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | `withAuth` spouse lookup only triggers when no `Member` row is found by `userId` or `email` | Correctness | Must not interfere with normal member login |
| NFR-02 | Spouse lookup is scoped to `relation='spouse'` and `deletedAt=null` only | Security | Cannot link via child or other relation |
| NFR-03 | `spouseUserId` must be globally unique — a Supabase account cannot be a linked spouse for two different primary members simultaneously | Data integrity | `@unique` on `FamilyMember.spouseUserId` |
| NFR-04 | Primary member email change must use Supabase Admin API — never a client-side call | Security | Admin key never exposed to browser |
| NFR-05 | The spouse-linked banner must be visible on every page the spouse visits (dashboard, profile, member search) — not just profile | UX correctness | Pass `isSpouseSession` flag via auth context or server component |
| NFR-06 | No CSS | No className, Tailwind, or inline styles | |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] Spouse can log in and see primary member's profile
- [ ] Spouse banner visible on dashboard and profile
- [ ] Spouse can edit all editable fields and save successfully
- [ ] Spouse can initiate payment/renewal
- [ ] Spouse email read-only once linked; editable before first login
- [ ] "Change spouse login" revoke flow clears link and re-enables email field
- [ ] Linking an existing primary member's email is blocked with error message
- [ ] Primary email change via Supabase Admin API works; old credentials stop working
- [ ] Revoked spouse JIT-creates new Member and lands on /register
- [ ] `spouseUserId` unique constraint prevents one Supabase account linking to two primaries

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Spouse first login | Primary has `FamilyMember.email = spouse@example.com`, `spouseUserId = null` | Spouse logs in with spouse@example.com | `spouseUserId` set; lands on primary's profile; banner shown |
| Spouse subsequent login | `spouseUserId` already set | Spouse logs in | Found by `spouseUserId` on FamilyMember; lands on primary's profile |
| Spouse edits profile | Spouse logged in | Edits name, saves | Same save flow as primary; confirmation shown |
| Spouse initiates payment | Spouse logged in | Clicks renew | Stripe checkout opens for primary's membership |
| Spouse email read-only after link | `spouseUserId` set | Primary views profile | Spouse email shown as read-only text; "Change spouse login" button visible |
| Revoke and relink | Primary clicks "Change spouse login", confirms | — | `FamilyMember.email` and `spouseUserId` cleared; email field editable; old spouse login creates new empty Member |
| Block existing primary email | Primary enters an email that belongs to an existing Member | Saves | Error: "This email is already registered as a primary member" |
| Primary email change | Primary enters new email, confirms | — | Supabase Auth updated; Member.email updated; session signed out; old credentials invalid |
| Primary email conflict | New email already in Member table | Confirms change | Error: "This email is already registered" |
| Revoked spouse logs in again | `FamilyMember.spouseUserId` cleared | Old spouse logs in with old email | No FamilyMember match found; new empty Member created; redirected to /register |
| Normal member login unaffected | Member with `Member.userId` set logs in | Logs in | Found by userId; spouse lookup not triggered |
| Spouse re-registers (email/pwd) | Spouse already has Supabase account | Enters same email on /register Step 1 | Supabase returns "User already registered"; error shown |
| Spouse first login via Google on /register | Spouse clicks Google button on /register | OAuth completes | Callback detects FamilyMember email match; redirects to /dashboard with spouse banner |
| Primary re-visits /register when logged in | Primary already has full profile | Navigates to /register | Session detected; bootstrap redirects to Step 5 (membership) as today |

---

## 4. Technical Design

### 4.1 Technologies
- **Must Use:** Next.js App Router, TypeScript, Zod, `withAuth`, Prisma, Supabase Admin API
- **Must Avoid:** CSS, Tailwind, inline styles; client-side exposure of Supabase service role key

### 4.2 New `withAuth` Lookup Sequence

The current sequence (from SPEC-18) is:
1. Try `Member.findUnique({ where: { userId: authUser.id } })`
2. Try `Member.findUnique({ where: { email: authUser.email } })`
3. Bind userId if found by email with null userId
4. JIT-create if not found

New sequence adds a **step 2b** between steps 2 and 3:

```
1. findUnique Member by userId           → found: proceed as primary
2. findUnique Member by email            → found: bind userId if null; proceed as primary
2b. findFirst FamilyMember by email      → found (spouse match):
    - fetch primary Member row
    - if FamilyMember.spouseUserId null: write spouseUserId = authUser.id
    - return primary Member row + isSpouseSession=true flag
3. JIT-create new Member                 → new user
```

`withAuth` must return both the `MemberRow` and an `isSpouseSession: boolean` flag. The `AuthHandler` type must be updated accordingly.

### 4.3 Files to Create or Modify

| File | Action | Notes |
|------|--------|-------|
| `apps/web/prisma/schema.prisma` | **Modify** | Add `spouseUserId String? @unique @map("spouse_user_id")` to `FamilyMember` model |
| `apps/web/prisma/` | **Migration** | `prisma db push` to add column |
| `apps/web/lib/auth/with-auth.ts` | **Modify** | Add spouse lookup step 2b; update `AuthHandler` type and `MemberRow` context to include `isSpouseSession` |
| `apps/web/lib/members/member-service.ts` | **Modify** | Add `revokeSpouseLink(primaryMemberId)` function; add `validateSpouseEmail(email)` check; add `changePrimaryEmail(memberId, newEmail)` |
| `apps/web/lib/validation/member.schema.ts` | **Modify** | Add `ChangeEmailSchema`; add `RevokeSpouseLinkSchema` |
| `apps/web/app/api/members/me/spouse-link/route.ts` | **Create** | `DELETE` handler to revoke spouse link |
| `apps/web/app/api/members/me/email/route.ts` | **Create** | `PUT` handler for primary email change (calls Supabase Admin API server-side) |
| `apps/web/app/profile/ProfileClient.tsx` | **Modify** | Spouse email read-only when spouseUserId set; "Change spouse login" button; "Change login email" section for primary |
| `apps/web/app/profile/page.tsx` | **Modify** | Pass `isSpouseSession` flag as prop to ProfileClient |
| `apps/web/app/dashboard/page.tsx` | **Modify** | Show spouse banner when `isSpouseSession` |
| `apps/web/app/components/nav-bar.tsx` | **Modify** | Pass `isSpouseSession` to show banner in nav or page layout |
| `apps/web/app/api/auth/callback/route.ts` | **Modify** | `resolvePostLoginPath()` must check for spouse FamilyMember email match before defaulting to `/register`; spouse first-time login redirects to `/dashboard` not `/register` |
| `apps/web/app/register/page.tsx` | **Modify** | `bootstrap()` must detect when the returned member row belongs to a spouse session and redirect to `/dashboard` instead of resuming registration steps |

### 4.4 Files NOT to Modify
- `apps/web/app/api/members/me/route.ts` — PUT handler already correct; spouse uses same route
- `apps/web/app/api/payments/checkout-session/route.ts` — spouse uses same route via primary member row

---

## 5. Open Questions

| # | Question | Status | Answer |
|---|----------|--------|--------|
| OQ-1 | What permissions does the spouse have? | **Resolved** | Full edit — identical to primary |
| OQ-2 | Can spouse initiate payments? | **Resolved** | Yes — same as primary |
| OQ-3 | Consent/invite step? | **Resolved** | Auto-grant — no invite needed |
| OQ-4 | Email already a primary member? | **Resolved** | Block with validation error |
| OQ-5 | Membership type restriction? | **Resolved** | All membership types |
| OQ-6 | Revocation mechanism? | **Resolved** | "Change spouse login" button clears email + spouseUserId |
| OQ-7 | Spouse UI labelling? | **Resolved** | Banner: "You are accessing [Name]'s profile as their spouse." |
| OQ-8 | Revoked spouse next login? | **Resolved** | JIT-creates new empty Member; lands on /register (Option 1) |
| OQ-9 | Primary email change mechanism? | **Resolved** | Supabase Admin API `updateUserById`; no new account needed |
| OQ-10 | Spouse email change after linking? | **Resolved** | Revoke-then-relink; spouse creates new Supabase account with new email |

---

## 6. Dependencies

### 6.1 Upstream Dependencies
- SPEC-18 (Profile Edit) — **complete**; `FamilyMember.email` exists; profile page exists
- Auth infrastructure (SPEC-2) — complete
- `withAuth` userId-first lookup (SPEC-18) — complete; this spec extends it further

### 6.2 Downstream Impact
- **`withAuth` change** affects every authenticated route — regression test all routes
- **`isSpouseSession` flag** propagates to dashboard, profile, nav bar
- **Primary email change** invalidates current session — must redirect to `/login`

---

## 7. Data Model Changes

### FamilyMember (addition)

```prisma
model FamilyMember {
  ...
  email                   String?        @map("email")          // existing (SPEC-18)
  spouseUserId            String?        @unique @map("spouse_user_id")  // new (SPEC-19)
  ...
}
```

`spouseUserId` stores the Supabase `auth.users.id` of the spouse who has logged in. The `@unique` constraint prevents one Supabase account from linking to multiple primaries.

### withAuth context (addition)

```typescript
export type AuthContext = {
  user: MemberRow          // always the primary Member row
  isSpouseSession: boolean // true when logged in as linked spouse
}

export type AuthHandler = (
  req: Request,
  ctx: AuthContext
) => Promise<Response>
```

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation

### Phase 1: Analysis
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-19/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-19/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-19/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-19/04-qa-report.md`
