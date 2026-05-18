# Feature Specification: Member Profile Edit

> **Spec ID:** SPEC-18-profile-edit
> **Status:** Draft
> **Author:** Utkal Nayak
> **Created:** 2026-05-18

---

## 1. Overview

### 1.1 Summary

Adds a dedicated `/profile` page where any authenticated user can view and edit their own profile details. Members can update personal information (name, phone, address), family members (spouse and children), souvenir preference, and profile visibility settings. Fields that are administratively controlled — email, membership type, membership status, and join/expiry dates — are displayed read-only. No email-change flow is provided; login identity changes require admin-mediated profile transfer.

Chapter affiliation is **not user-selectable** — it is derived automatically server-side from the member's address state (or country for Canadian members) by querying the `chapters` table directly. The `Chapter` model already has a `states String[]` field that lists all states under each chapter's jurisdiction. When a member saves their address, `updateMember()` calls `prisma.chapter.findFirst({ where: { states: { has: stateAbbr } } })` and writes the resolved `chapterId`. Members whose state is not listed under any chapter get `chapterId = null` (displayed as "No Chapter"). Chapter is displayed read-only on the profile page. Adding or changing chapter jurisdictions in future requires only a DB update — no code change.

This spec also includes a prerequisite fix to `withAuth`: switching the `Member` lookup from email-first to `userId`-first. This makes the system robust against any future email changes at the Supabase layer and is a correctness fix independent of the profile edit UI.

### 1.2 Goals
- [ ] Authenticated user can view all their profile fields on a single page
- [ ] User can edit: full name, phone, address, souvenir preference, profile visibility, bio, spouse name
- [ ] User can add family members (spouse, child, other)
- [ ] User can remove family members
- [ ] User can update an existing family member's details
- [ ] Read-only fields displayed clearly: email, membership type, membership status, join date, expiry date, role
- [ ] `withAuth` looks up `Member` by `userId` first (falls back to email for admin-pre-created rows)
- [ ] No email-change UI — a note directs users to contact admin for login identity changes

### 1.3 Non-Goals (Out of Scope)
- Email / login identity changes (deferred to a future admin profile-transfer spec)
- Password change (handled natively by Supabase UI / reset-password flow already in place)
- Switching auth providers (Google ↔ email/password) — admin transfer only
- Profile photo upload
- Account deletion UI (API already exists; UI is a future spec)
- Admin profile-transfer tool (separate future spec)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | `/profile` page is auth-guarded; unauthenticated users are redirected to `/login` | Must Have | |
| FR-02 | Page displays all current profile fields on load, populated from `GET /api/members/me` and `GET /api/members/me/family` | Must Have | |
| FR-03 | Read-only fields shown but not editable: email, membership type, membership status, join date, expiry date, role | Must Have | Display `—` if null |
| FR-04 | Editable fields: full name (first + last), phone, address (street, city, state, zip, country), souvenir preference, bio, spouse name | Must Have | Chapter is NOT editable — auto-derived |
| FR-05 | Profile visibility toggles: show phone, show email, show chapter (boolean checkboxes) | Must Have | |
| FR-04b | When address is saved, the server automatically derives and writes `chapterId` by looking up `address.state` (or `address.country = "Canada"`) against the chapter–jurisdiction table | Must Have | Server-side only; member never sends `chapterId` |
| FR-04c | If the member's state does not match any chapter jurisdiction, `chapterId` is set to `null` | Must Have | Displayed as "No Chapter" |
| FR-04d | Chapter display name is shown read-only on the profile page, updated after each save | Must Have | |
| FR-06 | Family members section lists existing family members (name, relation, date of birth, HS graduation year) with a Remove button per entry | Must Have | |
| FR-07 | User can add a new family member by filling name, relation, optional date of birth, optional HS graduation year | Must Have | Uses existing `POST /api/members/me/family` |
| FR-08 | Removing a family member calls `DELETE /api/members/me/family/:id`; entry disappears without page reload | Must Have | |
| FR-09 | User can edit an existing family member's details (name, date of birth, HS graduation year) via `PUT /api/members/me/family/:id` | Must Have | New endpoint — see §4.3 |
| FR-10 | Saving profile changes calls `PUT /api/members/me` with all editable fields | Must Have | Partial updates supported — only changed fields sent |
| FR-11 | Bio and spouse name are included in the profile save call; `UpdateMemberSchema` extended to include these | Must Have | Currently only in `CreateProfileSchema` |
| FR-12 | On save success, a confirmation message is shown inline; page stays loaded | Must Have | No full reload |
| FR-13 | On save failure, an error message is shown inline; form remains editable | Must Have | |
| FR-14 | A note near the email field states: "To change your login email or switch login method, please contact an OSA admin." | Must Have | No link needed — plain text |
| FR-15 | Nav bar links to `/profile` for authenticated users | Should Have | Amends `nav-bar.tsx` |
| FR-16 | No CSS — unstyled functional HTML only | Must Have | Project-wide styling freeze |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | `withAuth` lookup order: `userId` first, email fallback | Correctness fix | Prerequisite for entire spec |
| NFR-02 | Members can only edit their own profile | Enforced by `withAuth` — all routes use `user.id` | |
| NFR-03 | Read-only fields must not be accepted by any member-facing API | Server enforced by `UpdateMemberSchema` — excluded fields | |
| NFR-05 | `chapterId` must never be accepted from the client in any member-facing API | Server derives it from address; `UpdateMemberSchema` must not include `chapterId` | |
| NFR-04 | No CSS | No className, Tailwind, or inline styles | |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] `withAuth` uses `userId`-first lookup; existing tests pass
- [ ] `/profile` requires auth; redirects unauthenticated users
- [ ] All current field values are pre-populated on page load
- [ ] Read-only fields (email, membership type, status, dates, role) cannot be submitted to the API
- [ ] Saving edited fields updates the member record; confirmation shown
- [ ] Chapter is auto-assigned on save; member never inputs it; displayed correctly after save
- [ ] Member in a state with no chapter → `chapterId = null`, displayed as "No Chapter"
- [ ] `chapterId` sent by client in `PUT /api/members/me` body is ignored (not accepted by schema)
- [ ] Bio and spouse name save correctly
- [ ] Profile visibility checkboxes save correctly
- [ ] Family member can be added; appears in list without reload
- [ ] Family member can be removed; disappears without reload
- [ ] Family member details can be edited and saved
- [ ] Note about login identity changes is visible near the email field
- [ ] Nav bar includes a Profile link for authenticated users
- [ ] `PUT /api/members/me/family/:id` returns 404 for unknown ID, 403 for someone else's family member

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Load profile | Authenticated user with existing data | Navigate to `/profile` | All fields pre-populated; read-only fields visible but not editable |
| Unauthenticated access | No session | Navigate to `/profile` | Redirect to `/login` |
| Edit and save | User changes phone and city | Click Save | `PUT /api/members/me` called; confirmation shown |
| Chapter auto-assign — matched state | User sets state to `IL` | Click Save | Chapter shown as "Chicago Chapter" |
| Chapter auto-assign — Canada | User sets country to `Canada` | Click Save | Chapter shown as "Canada Chapter" |
| Chapter auto-assign — no chapter | User sets state to `AK` (Alaska, no chapter) | Click Save | Chapter shown as "No Chapter" |
| Chapter not client-settable | Active member | Send `PUT /api/members/me` with `chapterId: "florida"` in body | `chapterId` ignored; chapter derived from address state only |
| Save with no changes | User clicks Save immediately | — | API still called; confirmation shown (idempotent) |
| Add family member | User fills add-family form | Submit | Entry appears in list; `POST /api/members/me/family` called |
| Remove family member | Existing family member listed | Click Remove | Entry removed from list; `DELETE` called |
| Edit family member | Existing family member listed | Edit name, click save row | `PUT /api/members/me/family/:id` called |
| Read-only fields | Any authenticated user | Inspect form / direct API call | email, status, type, dates not accepted by `PUT /api/members/me` |
| `withAuth` userId lookup | Member with `userId` set | Any authenticated request | Member found by `userId`, not email |
| `withAuth` email fallback | Admin-pre-created row, `userId` null | First login | Falls back to email lookup, binds `userId` |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Next.js App Router, TypeScript, Zod, `withAuth`, Prisma
- **Must Avoid:** CSS, Tailwind, inline styles; accepting admin-only fields in member-facing schema

### 4.2 Patterns to Follow
- Page structure: Server Component for auth check + initial data fetch → Client Component for interactive form (same pattern as `MemberSearchClient`)
- API routes follow `withAuth` + Zod + service call pattern
- Partial updates: only include changed fields in `PUT` body

### 4.3 Files to Create or Modify

| File | Action | Notes |
|------|--------|-------|
| `apps/web/lib/auth/with-auth.ts` | **Modify** | Change `findUnique({ where: { email } })` to try `userId` first, email fallback |
| `apps/web/lib/validation/member.schema.ts` | **Modify** | Extend `UpdateMemberSchema` to include `bio?: string` and `spouseName?: string`; remove `chapterId` (no longer client-settable); add `UpdateFamilyMemberSchema` |
| `apps/web/lib/members/member-service.ts` | **Modify** | Update `updateMember()` to: derive `chapterId` via `prisma.chapter.findFirst({ where: { states: { has: stateAbbr } } })`; persist `bio` and `spouseName` into `profileData` and `FamilyMember` (spouse); add `updateFamilyMember()` |
| `apps/web/prisma/seed.ts` | **Modify** | Remove `KY` from both `ozark` and `southern` jurisdiction arrays — Kentucky is "No Chapter" pending formation of its own chapter |
| `apps/web/app/api/members/me/family/[id]/route.ts` | **Modify** | Add `PUT` handler for updating a family member's details |
| `apps/web/app/profile/page.tsx` | **Create** | Server Component: auth guard, fetch member + family, pass as props to client |
| `apps/web/app/profile/ProfileClient.tsx` | **Create** | Client Component: form with all editable fields, family member list/add/remove/edit, save handlers |
| `apps/web/app/components/nav-bar.tsx` | **Modify** | Add Profile link for authenticated users |

### 4.4 Files NOT to Modify
- `apps/web/app/api/members/me/route.ts` — `PUT` handler already delegates to `updateMember()`; no route change needed, only schema + service change
- `apps/web/app/api/members/[id]/route.ts` — admin route; not touched
- `apps/web/app/api/users/me/profile/route.ts` — registration-time profile creation; left as-is; profile edit uses the existing `PUT /api/members/me` route instead
- `apps/web/lib/constants/chapter-lookup.ts` — not needed; DB query replaces hardcoded map

---

## 5. Open Questions

| # | Question | Status | Answer |
|---|----------|--------|--------|
| OQ-1 | Should chapter be a dropdown of all available chapters, or a free-text field? | **Resolved** | Auto-assigned from address state/country — not user-selectable. Shown read-only. |
| OQ-2 | Should the profile page be reachable from the dashboard, or only from the nav? | Open | Both is ideal; at minimum, nav link |
| OQ-3 | Should bio have a character cap? `CreateProfileSchema` caps at 1,000 — carry that over to `UpdateMemberSchema`? | Open | Assumed yes (1,000 chars) unless overridden |
| OQ-4 | What relation options exist for family members? Schema has `spouse`, `child`, `other` — confirm these are the full set | Open | Assumed complete |
| OQ-5 | Seed data has `KY` (Kentucky) in both `ozark` and `southern` chapter jurisdiction arrays — which is correct? | **Resolved** | KY removed from both. Kentucky is "No Chapter" pending formation of its own chapter. Seed data corrected in this spec. |

---

## 6. Dependencies

### 6.1 Upstream Dependencies
- Auth infrastructure (SPEC-2) — complete
- Member module (SPEC-3) — complete; APIs exist
- Dashboard page (SPEC-12) — complete; profile page is a companion, not a replacement

### 6.2 Downstream Impact
- **`withAuth` change** affects every authenticated API route — must verify no regressions
- **Member search (SPEC-16)** — uses `withAuth`; regression test that search still works after the lookup change
- **Member messaging (SPEC-17)** — uses `withAuth`; same regression concern
- **Admin panel (SPEC-13)** — admin routes use `withAuth`; verify admin lookup still works

---

## 7. Data Map: Editable vs Read-Only

| Field | Editable by member | Source / API field |
|-------|--------------------|--------------------|
| First name + Last name | ✅ | `Member.fullName` (split for display, joined on save) |
| Phone | ✅ | `Member.phone` |
| Address (street, city, state, zip, country) | ✅ | `Member.address` (JSON) |
| Bio | ✅ | `Member.profileData.bio` |
| Spouse name | ✅ | `Member.profileData.spouseName` + `FamilyMember` (spouse) |
| Chapter | ❌ Auto-assigned | `Member.chapterId` — derived server-side from `address.state` / `address.country`; displayed read-only as chapter display name |
| Souvenir preference | ✅ | `Member.souvenirPreference` |
| Profile visibility | ✅ | `Member.profileVisibility` (show_phone, show_email, show_chapter) |
| Family members | ✅ | `FamilyMember` rows (add / edit / remove) |
| Email | ❌ Read-only | `Member.email` — owned by auth provider |
| Membership type | ❌ Read-only | `Member.membershipType` — admin only |
| Membership status | ❌ Read-only | `Member.memberStatus` — admin only |
| Join date | ❌ Read-only | `Member.joinDate` — admin only |
| Expiry date | ❌ Read-only | `Member.expiryDate` — admin only |
| Role | ❌ Read-only | `Member.role` — admin only |

---

## 8. Chapter Auto-Assignment — DB-Driven Lookup

Chapter is resolved at save time by querying the `chapters` table: `prisma.chapter.findFirst({ where: { states: { has: stateAbbr } } })`. No hardcoded map exists in code — all jurisdiction data lives in the DB and can be maintained without a deployment.

**Current jurisdiction data (as seeded — authoritative source is the DB):**

| Chapter ID | Display Name | States / Country |
|------------|--------------|-----------------|
| `canada` | Canada Chapter | Country = Canada |
| `carolinas` | Carolinas Chapter | NC, SC |
| `california` | California Chapter | CA |
| `chicago` | Chicago Chapter | IL |
| `florida` | Florida Chapter | FL |
| `georgia` | Georgia Chapter | GA |
| `michigan` | Michigan Chapter | MI |
| `minnesota` | Minnesota Chapter | MN |
| `mt-hood` | Mt Hood Chapter | OR |
| `new-england` | New England Chapter | MA, CT, RI, ME, NH, VT |
| `ny-nj-pa` | NY-NJ-PA Chapter | NY, NJ, PA |
| `ohio` | Ohio Chapter | OH |
| `ozark` | Ozark Chapter | KS, IA, MO |
| `rocky-mountain` | Rocky Mountain Chapter | CO, MT, WY, ND, SD |
| `seattle` | Seattle Chapter | WA |
| `southern` | Southern Chapter | TN, LA, MS, AL |
| `southwest` | Southwest Chapter | TX, AR, NM, OK |
| `washington-dc` | Washington DC Chapter | MD, DC, VA, WV, DE |
| *(null)* | No Chapter | KY and all other unmapped states / territories |

> **Kentucky (KY):** Removed from both `ozark` and `southern` seed arrays. Kentucky is currently "No Chapter" — a new Kentucky chapter is under discussion. When formed, an admin can update the `chapters` table (add a new row or add `KY` to an existing chapter's `states` array) with no code change required.

> **Canada lookup:** The member's `address.country` field is checked first. If it equals `"Canada"`, the query uses `states: { has: "Canada" }`. Otherwise the state abbreviation is used.

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation

### Phase 1: Analysis
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-18/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-18/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-18/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-18/04-qa-report.md`
