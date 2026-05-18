# Phase 1 Analysis — SPEC-19: Spouse Linked Login

> **Spec:** `specs/active/SPEC-19-spouse-linked-login.md`
> **Status:** Complete
> **Date:** 2026-05-18

---

## 1. Requirements Validation

### Functional Requirements

| ID | Requirement | Achievable? | Notes |
|----|-------------|-------------|-------|
| FR-01 | `withAuth` returns primary member row when spouse email matches `FamilyMember.email` with `relation='spouse'` and `deletedAt=null` | Yes | Requires new step 2b in `withAuth`. `prisma` already imported at line 2. |
| FR-02 | On first spouse login, write `FamilyMember.spouseUserId = authUser.id` | Yes | Requires schema migration. Written in step 2b of `withAuth`. |
| FR-03 | Persistent spouse banner on dashboard and profile | Yes | `isSpouseSession` determined server-side by comparing `session.user.id` against `FamilyMember.spouseUserId`; passed as prop. |
| FR-04 | Spouse has full edit permissions | Yes | Spouse receives primary `Member` row from `withAuth`. All existing edit APIs operate on `user.id` (the primary's id). |
| FR-05 | Spouse can initiate Stripe checkout | Yes | `POST /api/payments/checkout-session` uses `withAuth` returning primary row. Not to modify. |
| FR-06 | Spouse email field read-only once `spouseUserId` set | Yes | `ProfileClient.tsx` lines 378–387 render editable input; must gate on `spouseUserId != null`. |
| FR-07 | "Change spouse login" button when `spouseUserId` set | Yes | Additive UI to `ProfileClient.tsx`. |
| FR-08 | Revoke flow: confirm, clear `FamilyMember.email` + `spouseUserId`, sign out if spouse active | Yes | New `DELETE /api/members/me/spouse-link` route. |
| FR-09 | After revocation, spouse email field becomes editable again | Yes | Follows naturally once `spouseUserId` is null. |
| FR-10 | Block saving a new spouse email that already belongs to an existing `Member` row | Yes | New `validateSpouseEmail()` service function; called at write time. |
| FR-11 | Primary can change their own login email from profile page | Yes | New `PUT /api/members/me/email` route calling `supabaseAdmin.auth.admin.updateUserById`. |
| FR-12 | Email change uses Admin API, updates `Member.email`, signs out current session | Yes | `@supabase/supabase-js` v2.47.10 confirmed — `auth.admin.updateUserById` is available. |
| FR-13 | Validate new primary email not in `Member.email` or `FamilyMember.email` | Yes | Two Prisma queries in `changePrimaryEmail()`. |
| FR-14 | Revoked spouse JIT-creates new empty Member and lands on `/register` | Yes | After clearing, old spouse login → step 2b finds nothing → JIT-create runs. |
| FR-15 | No CSS | Yes | Project-wide freeze. |

All FRs and NFRs are achievable. No requirement needs rethinking.

---

## 2. Current State Summary

### `with-auth.ts` (lines 1–95)
- `AuthHandler` at lines 9–12: `ctx: { user: MemberRow }` — no `isSpouseSession`.
- Lookup: four cases (lines 49–79). No FamilyMember query anywhere.
- `prisma` already imported — no new import needed.

### `app/api/auth/callback/route.ts` — `resolvePostLoginPath()` (lines 47–64)
- Does `prisma.member.findUnique({ where: { userId: authUser.id } })` only.
- If not found → returns `/register` with no FamilyMember check. **Gap confirmed.**

### `app/register/page.tsx` — `bootstrap()` (lines 92–158)
- Line 152: `setStep(member.address != null ? 5 : 2)`. Spouse whose primary has an address lands at Step 5 (membership). **Gap confirmed.**

### `app/profile/ProfileClient.tsx`
- No `isSpouseSession` prop. Spouse email editable at lines 378–387 with no lock.
- `FamilyMemberWithEmail` cast at line 50 does not include `spouseUserId`.
- No "Change spouse login" button. No "Change login email" section.

### `app/profile/page.tsx`
- Fetches member + family in parallel. `session.user.id` available.
- Does NOT compute or pass `isSpouseSession`.

### `app/dashboard/page.tsx`
- Does NOT fetch family data. No spouse banner.

### `lib/members/member-service.ts`
- Missing: `revokeSpouseLink()`, `validateSpouseEmail()`, `changePrimaryEmail()`.
- **Gap:** `updateMember()` soft-delete block (lines 141–147) and `softDeleteFamilyMember()` do NOT clear `spouseUserId` or `email` before setting `deletedAt`.

### `prisma/schema.prisma` — `FamilyMember` (lines 146–162)
- `email String?` exists (SPEC-18). **`spouseUserId` does NOT exist. Confirmed.**

### `lib/auth/supabase-admin.ts`
- `getSupabaseAdmin()` is available. `auth.admin.updateUserById` confirmed present in v2.47.10.

---

## 3. Gaps and Changes Required

### Gap 1: `FamilyMember.spouseUserId` missing from schema
Add after `email` field (line 153):
```prisma
spouseUserId  String?  @unique @map("spouse_user_id") @db.Uuid
```
`@unique` enforces NFR-03. Existing rows default to `null` — no data migration needed.

### Gap 2: `withAuth` missing step 2b
Insert inside the `!member` block at line 61, before JIT-create:
1. `findFirst FamilyMember` where `email=authUser.email`, `relation='spouse'`, `deletedAt=null`
2. If found → fetch primary `Member` by `familyMember.primaryMemberId`
3. If `familyMember.spouseUserId === null` → write `spouseUserId = authUser.id`
4. Set `member = primaryMember`, `isSpouseSession = true`
5. If not found → fall through to JIT-create

Update `AuthHandler` type to `ctx: { user: MemberRow; isSpouseSession: boolean }`. Declare `let isSpouseSession = false` before the lookup sequence.

**Backward compatibility:** All existing handlers destructure only `ctx.user` — adding `isSpouseSession` is non-breaking. TypeScript compiles without changes to any existing handler.

### Gap 3: Auth callback missing spouse check
In `resolvePostLoginPath()`, after the member lookup:
```typescript
if (!member || !member.address) {
  const spouseFm = await prisma.familyMember.findFirst({
    where: { email: authUser.email, relation: 'spouse', deletedAt: null }
  })
  if (spouseFm) return '/dashboard'
}
```
`spouseUserId` write happens in `withAuth` on the first API call after redirect — not here.

### Gap 4: Register `bootstrap()` missing spouse redirect
After receiving member from `GET /api/members/me`, detect spouse session and redirect:
```typescript
if (isSpouseSession) { router.push('/dashboard'); return }
```
Detection method depends on OQ-A resolution below.

### Gap 5: Three missing service functions + two existing function patches
- **New:** `revokeSpouseLink(primaryMemberId)` — clears `email` + `spouseUserId` on active spouse FamilyMember (does not soft-delete).
- **New:** `validateSpouseEmail(email, excludingPrimaryMemberId)` — throws CONFLICT if email matches any `Member.email` or any other primary's `FamilyMember.email`.
- **New:** `changePrimaryEmail(memberId, newEmail)` — validates uniqueness, calls Admin API, updates `Member.email`.
- **Patch existing:** `updateMember()` soft-delete block — also clear `email` + `spouseUserId` before `deletedAt`.
- **Patch existing:** `softDeleteFamilyMember()` — same: clear `email` + `spouseUserId` when `relation='spouse'` before `deletedAt`.

### Gap 6: Profile page — `isSpouseSession` not computed or passed
After fetching family data (already available), compute:
```typescript
const isSpouseSession = familyMembers.some(
  (fm) => fm.spouseUserId === session.user.id && fm.relation === 'spouse' && !fm.deletedAt
)
```
Pass as prop to `ProfileClient`.

### Gap 7: Dashboard — no family fetch, no banner
Add `GET /api/members/me/family` to `Promise.all`. Compute `isSpouseSession`. Render `<p>` banner when true.

---

## 4. Risk Assessment

**withAuth placement:** Step 2b must go inside the inner `else if (!member)` branch at line 61, after the email-fallback and its binding/non-binding branches, before JIT-create. If a spouse also has their own `Member` row (FR-10 write-time validation failure), step 2 finds their Member row before step 2b is ever reached — step 2b is never a bypass for write-time validation.

**`isSpouseSession` in Server Components:** Profile page already has family data — zero extra cost. Dashboard needs one additional parallel fetch. Nav bar is NOT modified (page-level banners recommended — see OQ-C).

**Auth callback race:** `resolvePostLoginPath` must check FamilyMember, not write `spouseUserId`. Writing happens in `withAuth` on first API call. No duplication risk.

**Supabase Admin API email change:** If `newEmail` already exists in `auth.users` (even for a non-Member account), the Admin API call fails. `changePrimaryEmail()` must catch and surface this error clearly.

**Soft-delete without clearing:** If soft-deleting a spouse FamilyMember without clearing `spouseUserId`/`email`, the `deletedAt: null` filter in step 2b prevents the old link from activating. But if an admin ever undeletes the row, the link silently restores. Clearing both fields on soft-delete (OQ-F) costs nothing and prevents this.

---

## 5. Open Questions for Architect

| # | Question | Recommendation |
|---|----------|----------------|
| OQ-A | How does `register/page.tsx` `bootstrap()` detect a spouse session? | Update `GET /api/members/me` handler to return `{ member, isSpouseSession }` using `ctx.isSpouseSession`. One-line change; avoids extra fetch in bootstrap. |
| OQ-B | How does `dashboard/page.tsx` get `isSpouseSession`? | Add `GET /api/members/me/family` to `Promise.all` and compute from result. If OQ-A adds `isSpouseSession` to `GET /api/members/me`, dashboard can call that instead of `GET /api/auth/me`. |
| OQ-C | Spouse banner in nav bar or page-level? | Page-level `<p>` on dashboard and profile. Avoids layout-level family fetch on every route. Nav bar not modified. |
| OQ-D | Call `auth.admin.signOut(spouseUserId)` during revoke? | Yes — recommended. Immediately invalidates spouse JWT. `spouseUserId` is available before clearing. |
| OQ-E | How does `PUT /api/members/me/email` block spouse sessions? | `ctx.isSpouseSession` from `withAuth` context; return 403 at top of handler. |
| OQ-F | Clear `email` + `spouseUserId` on spouse FamilyMember soft-delete? | Yes — both `updateMember()` soft-delete block and `softDeleteFamilyMember()` should clear these fields before setting `deletedAt`. |

---

## 6. Implementation Readiness

### Spec §4.3 file list — corrections

| File | Status |
|------|--------|
| `prisma/schema.prisma` + migration | Correct |
| `lib/auth/with-auth.ts` | Correct |
| `lib/members/member-service.ts` | Correct; also needs OQ-F patches to existing functions |
| `lib/validation/member.schema.ts` | `ChangeEmailSchema` needed; `RevokeSpouseLinkSchema` can be omitted (DELETE has no body) |
| `app/api/members/me/spouse-link/route.ts` | Correct — new file |
| `app/api/members/me/email/route.ts` | Correct — new file |
| `app/profile/ProfileClient.tsx` | Correct |
| `app/profile/page.tsx` | Correct |
| `app/dashboard/page.tsx` | Correct; also needs family data fetch |
| `app/components/nav-bar.tsx` | Skip if page-level banners chosen (OQ-C) |
| `app/api/auth/callback/route.ts` | Correct |
| `app/register/page.tsx` | Correct |

### Additional file (not in spec §4.3)

| File | Reason |
|------|--------|
| `app/api/members/me/route.ts` — GET handler | If OQ-A resolves to including `isSpouseSession` in `GET /api/members/me` response, add `isSpouseSession: ctx.isSpouseSession` to the response body. One-line change. |

---

## 7. Build Sequence

**Group 1 — Schema (hard prerequisite)**
1. `prisma/schema.prisma` → `prisma db push` → Prisma client regenerated

**Group 2 — Core auth + service**
2. `lib/auth/with-auth.ts` — step 2b + `AuthHandler` type
3. `lib/members/member-service.ts` — 3 new functions + OQ-F patches

**Group 3 — Validation + new API routes**
4. `lib/validation/member.schema.ts` — `ChangeEmailSchema`
5. `app/api/members/me/spouse-link/route.ts` — new DELETE
6. `app/api/members/me/email/route.ts` — new PUT with spouse guard
7. `app/api/auth/callback/route.ts` — FamilyMember check
8. `app/api/members/me/route.ts` GET — add `isSpouseSession` (if OQ-A)

**Group 4 — Server Components**
9. `app/register/page.tsx` — spouse redirect in bootstrap()
10. `app/profile/page.tsx` — compute + pass `isSpouseSession`
11. `app/dashboard/page.tsx` — family fetch + banner

**Group 5 — Client Components**
12. `app/profile/ProfileClient.tsx` — spouse email lock + revoke + email change UI
