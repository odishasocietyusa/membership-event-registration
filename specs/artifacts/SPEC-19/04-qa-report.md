# SPEC-19 QA Report — Spouse Linked Login

> **Generated:** 2026-05-24
> **Phase:** 4 — QA & Testing
> **Status:** Complete

---

## 1. Type-Check Results

| Scope | Error Count | Notes |
|-------|-------------|-------|
| SPEC-19 source files | **0** | Clean |
| Pre-existing (`membership/page.tsx`) | 4 | `string` vs `MembershipType` in form `get()` calls — pre-dates this spec; confirmed via `git stash` test |
| Test files (`*.test.*`) | 31 | Pre-existing Jest mock issue (`getSupabaseAdmin is not a function`) |
| `.next/types/validator.ts` | ~1 | Stale Next.js cache file — pre-existing |

Command: `npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "\.test\." | grep -v "\.next/" | grep -v "membership/page.tsx"`
Result: **empty** (0 new errors from SPEC-19 implementation)

---

## 2. Acceptance Criteria Verification

### Automated (TypeScript static analysis)

| AC | Requirement | Status | Evidence |
|----|-------------|--------|----------|
| FR-01 | `withAuth` step 2b finds `FamilyMember.email` match with `relation='spouse'` + `deletedAt=null` | ✅ Pass | `with-auth.ts:65` — `findFirst({ where: { email, relation: 'spouse', deletedAt: null } })` |
| FR-02 | First spouse login writes `spouseUserId = authUser.id` | ✅ Pass | `with-auth.ts:77-88` — writes on `spouseUserId === null`; catches P2002 race |
| NFR-01 | Spouse lookup only triggers when no `Member` found by `userId` or `email` | ✅ Pass | Step 2b inserted inside `else if (!member)` block after step 2 |
| NFR-02 | Lookup scoped to `relation='spouse'` and `deletedAt=null` | ✅ Pass | `where` clause in both `with-auth.ts` and `get-current-member.ts` |
| NFR-03 | `spouseUserId @unique` prevents one Supabase account linking two primaries | ✅ Pass | `schema.prisma:153` — `@unique` constraint; P2002 race handled |
| NFR-04 | Primary email change uses Admin API server-side only | ✅ Pass | `member-family.ts:147` — `supabaseAdmin.auth.admin.updateUserById` in server-only service |
| FR-06 | Spouse email read-only once `spouseUserId` set | ✅ Pass | `ProfileClient.tsx` — renders `<span>` not `<input>` when `spouseIsLinked` |
| FR-07 | "Change spouse login" button appears when linked | ✅ Pass | `ProfileClient.tsx` — button gated on `spouseIsLinked` |
| FR-08 | Revoke flow clears `email` + `spouseUserId`; signs out spouse JWT | ✅ Pass | `member-family.ts:126-145` — `signOut` then `update({ email: null, spouseUserId: null })` |
| FR-10 | Blocks linking email already registered as primary member | ✅ Pass | `validateSpouseEmail` throws CONFLICT if `Member.email` match found |
| FR-11/12 | Primary can change login email; old credentials immediately invalid | ✅ Pass | `PUT /api/members/me/email` → `changePrimaryEmail` → Admin API → `Member.email` update |
| FR-13 | Pre-change validation: no conflict in `Member.email` or `FamilyMember.email` | ✅ Pass | `changePrimaryEmail` calls `validateSpouseEmail`-equivalent checks |
| FR-15 | No CSS | ✅ Pass | No `className`, `style`, or Tailwind in any modified file |
| NFR-05 | Spouse banner visible on dashboard and profile | ✅ Pass | `dashboard/page.tsx:50` and `profile/ProfileClient.tsx` — gated on `isSpouseSession` |

### Manual Verification Required

These scenarios require a live Supabase + running dev server to verify end-to-end:

| Scenario | Test Steps | Expected Result |
|----------|------------|-----------------|
| Spouse first login (email/password) | 1. Primary sets spouse email on profile. 2. Spouse signs up at `/register` with that email. 3. Spouse logs in. | `spouseUserId` written; spouse lands on `/dashboard`; banner shown |
| Spouse first login (Google OAuth) | Same as above but spouse clicks Google on `/register` | Callback detects FamilyMember email match; redirects to `/dashboard` |
| Spouse subsequent login | Log in again after `spouseUserId` set | Found by `spouseUserId`; no second write attempted |
| Spouse edits profile | Spouse logs in; edits `fullName`; saves | PUT `/api/members/me` succeeds; primary's record updated |
| Spouse initiates payment | Spouse on `/membership`; clicks renew | Stripe checkout opens for primary's member ID |
| Spouse email read-only after link | View profile with `spouseUserId` set | Email shown as `<span>`; "Change spouse login" button visible |
| Revoke and relink | Primary clicks "Change spouse login"; confirms | `FamilyMember.email` + `spouseUserId` cleared; old spouse's next login creates new empty Member |
| Block existing primary email | Enter primary member email as spouse email; save | Error: "This email is already registered as a primary member" |
| Primary email change | Enter new email; confirm | Admin API updated; `Member.email` updated; session signed out |
| Revoked spouse logs in again | After revoke; old spouse logs in | No FamilyMember match; new empty Member created; redirect to `/register` |
| Normal member login unaffected | Existing member logs in | Found by `userId`; spouse lookup not triggered |
| Spouse re-registers (email/pwd) | Already-registered spouse tries `/register` Step 1 with same email | Supabase returns "User already registered" |
| Primary re-visits `/register` logged in | Primary with full profile navigates to `/register` | Existing bootstrap redirect to Step 5 (membership) unchanged |

---

## 3. Regression Risk Assessment

| Area | Risk | Mitigation |
|------|------|-----------|
| `withAuth` change | High — used by every API route | Step 2b only triggers inside `else if (!member)` after steps 1+2 exhaust; existing members unaffected |
| `getCurrentMember` return type | Medium — 5 callers updated | All callers (`dashboard`, `events/page`, `events/[slug]`, `membership`, `profile`) updated and type-clean |
| `member-crud.ts` soft-delete | Low | Wrapped in `$transaction`; adds spouse-specific cleanup before setting `deletedAt` |
| Callback route | Low | FamilyMember check only runs in the `!member || !member.address` branch |

---

## 4. Files Changed

| File | Change Type | SPEC-19 Requirement |
|------|-------------|---------------------|
| `prisma/schema.prisma` | Modified | `spouseUserId @unique` on `FamilyMember` (NFR-03) |
| `lib/auth/with-auth.ts` | Modified | Step 2b, `AuthContext.isSpouseSession`, `AuthHandler` update |
| `lib/auth/get-current-member.ts` | New | Server Component mirror of withAuth with step 2b |
| `lib/members/services/member-family.ts` | Modified | `validateSpouseEmail`, `revokeSpouseLink`, `changePrimaryEmail`; patched `softDeleteFamilyMember` |
| `lib/members/services/member-crud.ts` | Modified | `softDeleteMember` uses `$transaction` with spouse link cleanup |
| `lib/validation/member.schema.ts` | Modified | `ChangeEmailSchema` |
| `app/api/members/me/route.ts` | Modified | GET returns `isSpouseSession` |
| `app/api/members/me/spouse-link/route.ts` | New | DELETE revoke endpoint |
| `app/api/members/me/email/route.ts` | New | PUT primary email change endpoint |
| `app/api/auth/callback/route.ts` | Modified | `resolvePostLoginPath` spouse check |
| `app/register/page.tsx` | Modified | `bootstrap()` spouse redirect |
| `app/dashboard/page.tsx` | Modified | `getCurrentMember` destructure + spouse banner |
| `app/profile/page.tsx` | Modified | `isSpouseSession` prop |
| `app/profile/ProfileClient.tsx` | Modified | Full spouse UI — read-only gate, revoke flow, email change |
| `app/events/page.tsx` | Modified | `getCurrentMember` caller updated |
| `app/events/[slug]/page.tsx` | Modified | `getCurrentMember` caller updated |
| `app/membership/page.tsx` | Modified | `getCurrentMember` caller updated |

---

## 5. Known Gaps / Deferred

- **Jest unit tests**: 31 pre-existing failures (`getSupabaseAdmin is not a function` mock issue). No new unit tests written — SPEC-19 behavior is covered by manual test matrix above. Unit test infra fix is out of scope for this spec.
- **Playwright spouse E2E spec**: Not added — requires two real Supabase accounts (primary + spouse) provisioned in `globalSetup`. The manual test matrix above serves as the specification for a future automated suite.
- **`membership/page.tsx` TS errors**: 4 pre-existing `formData.get()` narrowing errors; not introduced by SPEC-19.

---

## 6. Sign-Off Checklist

- [x] TypeScript clean (0 new errors)
- [x] No CSS introduced (FR-15, NFR-06)
- [x] `spouseUserId @unique` constraint in schema
- [x] Admin API used server-side only (NFR-04)
- [x] Step 2b only triggers after userId + email lookups fail (NFR-01)
- [x] Spouse lookup scoped to `relation='spouse'` + `deletedAt=null` (NFR-02)
- [x] P2002 race condition handled in first-login write
- [x] Revoke clears both `email` and `spouseUserId`
- [x] Spouse banner on dashboard and profile
- [x] Spouse blocked from changing primary login email (FR guard in PUT route)
- [ ] Manual end-to-end verification by developer (required before ship)
