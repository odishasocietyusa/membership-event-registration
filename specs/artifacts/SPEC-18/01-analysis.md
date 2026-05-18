# Phase 1 Analysis — SPEC-18: Member Profile Edit

> **Spec:** `specs/active/SPEC-18-profile-edit.md`
> **Status:** Complete
> **Date:** 2026-05-18

---

## 1. Requirements Validation

### Functional Requirements

| ID | Requirement | Achievable? | Notes |
|----|-------------|-------------|-------|
| FR-01 | `/profile` auth-guard, redirect to `/login` | Yes | Server Component pattern from `app/dashboard/page.tsx` works identically |
| FR-02 | Page pre-populated from `GET /api/members/me` + `GET /api/members/me/family` | Yes | Both GET routes exist and work |
| FR-03 | Read-only fields: email, membership type, status, dates, role | Yes | These fields are excluded from `UpdateMemberSchema`; no API change needed |
| FR-04 | Editable: name, phone, address, souvenir preference, bio, spouse name | Partially | `bio` and `spouseName` are not in `UpdateMemberSchema` today — must be added |
| FR-04b | Server derives `chapterId` from `address.state`/`address.country` | Yes | `prisma.chapter.findFirst({ where: { states: { has: stateAbbr } } })` is viable; `Chapter` model has `states String[]` |
| FR-04c | `chapterId = null` when no chapter matches | Yes | `findFirst` returns `null` when no row matches |
| FR-04d | Chapter display name shown read-only, updated after save | Yes | `chapterDisplayName()` helper exists in `lib/constants/address-options.ts` |
| FR-05 | Profile visibility toggles (show_phone, show_email, show_chapter) | Yes | `ProfileVisibilitySchema` already defined; `profileVisibility Json?` on `Member` model |
| FR-06 | Family members list with Remove button | Yes | `GET /api/members/me/family` exists; `softDeleteFamilyMember()` exists |
| FR-07 | Add family member | Yes | `POST /api/members/me/family` exists |
| FR-08 | Remove family member without reload | Yes | `DELETE /api/members/me/family/:id` exists |
| FR-09 | Edit existing family member via `PUT /api/members/me/family/:id` | **No — endpoint missing** | Route file has only `DELETE`; both `PUT` handler and `updateFamilyMember()` service function must be created |
| FR-10 | Saving calls `PUT /api/members/me` | Yes | Route and `updateMember()` service exist; schema must be extended |
| FR-11 | Bio and spouse name in save call; `UpdateMemberSchema` extended | **No — not in schema** | Must add `bio` and `spouseName` to `UpdateMemberSchema` and `UpdateMemberInput` interface |
| FR-12 | Inline save confirmation, no full reload | Yes | Client Component pattern supports this |
| FR-13 | Inline error on failure | Yes | Same pattern |
| FR-14 | Note near email about login identity change | Yes | Static text in JSX |
| FR-15 | Nav bar Profile link for authenticated users | Yes | `nav-bar.tsx` is straightforward to amend |
| FR-16 | No CSS | Yes | Project constraint; no impediment |

### Non-Functional Requirements

| ID | Requirement | Achievable? | Notes |
|----|-------------|-------------|-------|
| NFR-01 | `withAuth` lookup: `userId` first, email fallback | **Not yet implemented** | Currently email-only at line 45 of `with-auth.ts` |
| NFR-02 | Members only edit own profile | Yes | Enforced via `withAuth` — all `me` routes use `user.id` |
| NFR-03 | Read-only fields rejected by member-facing API | **Partial gap** | `chapterId` is currently accepted by `UpdateMemberSchema` — must be removed |
| NFR-05 | `chapterId` never accepted from client | **Currently violated** | `UpdateMemberSchema` line 27: `chapterId: z.string().nullable().optional()` — must be removed |
| NFR-04 | No CSS | Yes | Project constraint |

---

## 2. Current State Summary

### What exists and is reusable

- `GET /api/members/me` — returns full `Member` row via `withAuth`; no changes needed
- `PUT /api/members/me` — delegates to `updateMember(user.id, parsed.data)`; no route change needed, only schema and service change
- `GET /api/members/me/family` — returns family members via `listFamilyMembers(user.id)`
- `POST /api/members/me/family` — creates family member via `addFamilyMember(user.id, data)`
- `DELETE /api/members/me/family/:id` — soft-deletes via `softDeleteFamilyMember(id, requestingMemberId)`; ownership check enforced in service
- `updateMember()` in `member-service.ts` — general-purpose member updater; handles date conversion; ready to extend
- `softDeleteFamilyMember()` — enforces ownership (throws `FORBIDDEN` if `familyMember.primaryMemberId !== requestingMemberId`)
- `ProfileVisibilitySchema` — fully defined in `member.schema.ts`
- `AddressSchema` — fully defined in `member.schema.ts`
- `CreateFamilyMemberSchema` — fully defined; `relation` enum is `spouse | child | other`
- `Member.profileData Json?` — stores `bio` and `spouseName` as JSON keys
- `Member.profileVisibility Json?` — stores visibility flags
- `Member.address Json?` — stores address as JSON
- `chapterDisplayName()` utility at `lib/constants/address-options.ts` — maps chapterId slug → display name
- `Chapter.states String[]` — all chapters already have state/country arrays in DB seed
- Dashboard Server Component pattern — canonical pattern for auth-guarded Server Components
- `MemberSearchClient.tsx` — canonical Client Component pattern with Bearer token API calls

### `withAuth` current behavior (with-auth.ts line 45)

1. Validates JWT via Supabase
2. Looks up `Member` by `email` only — **this is the gap**
3. If not found: creates new `Member` row with `userId` set
4. If found but `userId` null: updates to bind `userId`
5. If found: proceeds

---

## 3. Gaps and Changes Required

### Gap 1: `withAuth` — email-first lookup (NFR-01)

**File:** `lib/auth/with-auth.ts`, line 45

Must try `findUnique({ where: { userId: authUser.id } })` first, then fall back to email lookup if null. The existing JIT-create and `userId`-binding logic stays unchanged after the lookup sequence.

### Gap 2: `UpdateMemberSchema` missing `bio` and `spouseName` (FR-11)

**File:** `lib/validation/member.schema.ts`

`bio` and `spouseName` are in `CreateProfileSchema` but absent from `UpdateMemberSchema`. Must add:
- `bio: z.string().max(1000).optional()`
- `spouseName: z.string().max(200).optional()`

### Gap 3: `UpdateMemberSchema` contains `chapterId` — must be removed (NFR-05)

**File:** `lib/validation/member.schema.ts`

`chapterId: z.string().nullable().optional()` must be deleted. Chapter is server-derived only.

**Note:** `AdminUpdateMemberSchema` extends `UpdateMemberSchema`. Removing `chapterId` from the base removes it from the admin schema too. `chapterId` must be re-added explicitly to `AdminUpdateMemberSchema` so admins retain the ability to manually override chapter assignment.

### Gap 4: `UpdateMemberInput` interface — must be updated

**File:** `lib/members/member-service.ts`

Must remove `chapterId?: string | null` and add `bio?: string` and `spouseName?: string`. Same decision as Gap 3 applies to `AdminUpdateMemberInput`.

### Gap 5: `updateMember()` — chapter derivation + bio/spouseName logic

**File:** `lib/members/member-service.ts`

Must extend to:
1. When `data.address` provided: derive `chapterId` via `prisma.chapter.findFirst({ where: { states: { has: key } } })` where `key = address.country === "Canada" ? "Canada" : address.state`. Write resolved `chapterId` (or `null`) to `prismaData`.
2. When `data.bio` provided: read existing `profileData`, merge `{ bio }`, write back. `bio` is NOT a top-level Member column — lives in `profileData` JSON.
3. When `data.spouseName` provided: read existing `profileData`, merge `{ spouseName }`, write back. Also upsert `FamilyMember` with `relation: 'spouse'`.
4. Strip `bio` and `spouseName` from `prismaData` before `prisma.member.update()`.
5. **Critical:** Use read-then-merge for `profileData` — a direct overwrite will wipe existing keys (e.g., children data stored there).

### Gap 5b: `FamilyMember.email` — field does not exist (FR-09b)

**File:** `prisma/schema.prisma` + new migration

`FamilyMember` model has no `email` field. Must add `email String?` to the model and generate a migration. The field is optional and only meaningful for spouse entries — no DB-level constraint enforces this, but the UI only shows it when `relation === 'spouse'`. `CreateFamilyMemberSchema` and `UpdateFamilyMemberSchema` must both include `email: z.string().email().optional()`. `addFamilyMember()` service must pass `email` through to Prisma.

### Gap 6: `updateFamilyMember()` — does not exist (FR-09)

**File:** `lib/members/member-service.ts`

Must create with: ownership check, NOT_FOUND guard, update of `fullName`, `dateOfBirth`, `highSchoolGraduationYear`. `relation` is intentionally not editable.

### Gap 7: `PUT /api/members/me/family/:id` — does not exist (FR-09)

**File:** `app/api/members/me/family/[id]/route.ts`

Only `DELETE` is exported. Must add `PUT` and `UpdateFamilyMemberSchema` to `member.schema.ts`.

### Gap 8: `/profile` page — does not exist

Files to create: `app/profile/page.tsx` and `app/profile/ProfileClient.tsx`.

### Gap 9: Nav bar — no Profile link

**File:** `app/components/nav-bar.tsx`

Must add Profile link in the `isAuthed` branch.

### Gap 10: Seed file — already fixed

`KY` is already absent from both `ozark` and `southern` arrays in `prisma/seed.ts`. No change needed.

---

## 4. Open Questions — Resolved

| # | Question | Answer |
|---|----------|--------|
| OQ-2 | Profile reachable from dashboard? | Add nav link (required). Also add an "Edit Profile" link on the dashboard — trivial one-line addition, "both is ideal" per spec. |
| OQ-3 | Bio character cap in UpdateMemberSchema? | Yes, 1,000 chars — matches `CreateProfileSchema`. |
| OQ-4 | Family relation types complete? | Yes. `FamilyRelation` enum in schema.prisma is `spouse \| child \| other` — no other values exist. |

**New edge case flagged:** Canadian members registered with `address.country = "USA"` (the default) and a province abbreviation as state will not be assigned to the Canada chapter. The `ProfileClient` must present a country selector so members can correctly set `country = "Canada"`, and `updateMember()` must check `address.country` before `address.state`. The spec already describes this behavior — the implementation must not default country to "USA" on the profile page if the member's existing `address.country` is already "Canada".

---

## 5. Risk Assessment

### `withAuth` change — regression scope

Affects all 31 authenticated route files. Behavioral analysis:

- **Existing users (userId already set):** Found on first DB query by userId. Behavior identical.
- **Admin-pre-created rows (userId null):** New code tries userId lookup (null), falls back to email, binds userId. No behavior change.
- **Brand-new first login:** New code tries userId (null), tries email (null), creates row. No behavior change.
- **Correctness improvement:** If email drifts from Supabase (future scenario), userId lookup succeeds where email lookup would fail.

**Regression risk: low.** Unit test mocks for `withAuth` bypass the actual lookup, so existing tests are unaffected.

### `chapterId` removal from `UpdateMemberSchema`

If `chapterId` is not explicitly added back to `AdminUpdateMemberSchema`, admins lose the ability to manually override chapter. This must be intentional or corrected.

### `profileData` merging risk

The current `updateMember()` does not read-then-merge `profileData`. A naive implementation that passes `bio`/`spouseName` directly to Prisma would wipe existing `profileData` keys. The implementer must read existing `profileData`, merge, then write.

---

## 6. Implementation Readiness

### File list corrections vs. §4.3

| File | Spec Action | Correction |
|------|-------------|------------|
| `prisma/seed.ts` | Modify | **No change needed** — KY already removed |
| `lib/constants/address-options.ts` | Not listed | Add to §4.4 (Files NOT to Modify) — `chapterDisplayName()` reused as-is |

All other files in §4.3 are confirmed correct.

### Build sequence for implementer

1. `with-auth.ts` — prerequisite for everything (NFR-01)
2. `member.schema.ts` — schema changes gate service and route changes
3. `member-service.ts` — service changes gate route and UI changes
4. `family/[id]/route.ts` — add PUT handler
5. `nav-bar.tsx` — add Profile link
6. `app/profile/page.tsx` + `ProfileClient.tsx` — UI layer last
7. `dashboard/page.tsx` — add Edit Profile link (optional but recommended)
