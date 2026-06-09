# SPEC-29 — Phase 2: Design

**Spec:** Member Expertise Directory
**Architect:** Claude Code
**Date:** 2026-06-08
**Status:** Approved

---

## Decisions

| ID | Decision |
|----|----------|
| D-01 | Pages are unstyled functional stubs (per `[[project_frontend_styling]]` constraint — no CSS until Figma is delivered), matching the Services Directory precedent. |
| D-02 | New dedicated model `ExpertiseProfile` — **not** an extension of `ServiceProvider`. Different eligibility rule, no contact/messaging, no email-routing/privacy concerns. |
| D-03 | `categories: String[]` validated against a shared app-level constant `EXPERTISE_CATEGORIES`, mirroring `ServiceProvider.specializations`. No Postgres enum — avoids migration friction if the org tweaks the list. |
| D-04 | Moderation uses a simple `isHidden: Boolean` flag (default `false`) — **not** the `pending → active → inactive` approval workflow from `ServiceProvider.status`. This feature has no approval step; entries go live immediately, admin only hides unfit ones. |
| D-05 | Eligibility allow-list checked **only at registration** (`POST`): `['life', 'lifeWard', 'patron', 'benefactor', 'honoraryNoVote']`. Not re-checked on edit/delete of an existing entry — losing eligibility later doesn't retroactively revoke (per analysis Edge Case 1; admin can hide manually if needed). |
| D-06 | Viewer access: any authenticated member with `memberStatus === 'active'` can view the listing — independent of membership tier. Mirrors `services/page.tsx` gating. |
| D-07 | Pagination follows `lib/members/services/member-search.ts` exactly: `PAGE_SIZE = 25`, `skip = (page - 1) * PAGE_SIZE`, `Promise.all([count, findMany])`, returns `{ results, total, page, pageSize }`. No result cap (population is small — bounded by 5 eligible tiers). |
| D-08 | Sort: `orderBy: { createdAt: 'desc' }` — registration order, stable across edits (per analysis resolution; avoids re-ordering surprises when a member edits their blurb). |
| D-09 | Blurb validation: `min(10).max(500)` — "short blurb" per spec wording; tighter than `ServiceProvider.bio`'s 1000-char cap. |
| D-10 | One entry per member: `memberId @unique` on `ExpertiseProfile`, identical to `ServiceProvider`. Duplicate registration attempts redirect to the edit page (mirrors `services/register/page.tsx`). |
| D-11 | Name and organization are **not** the same thing: `fullName` is captured from `Member.fullName` at registration time (snapshot, like `ServiceProvider.fullName`); `organization` is a free-text **optional** field specific to this directory entry (per user clarification — "not every member must enter ... optional text box"). |
| D-12 | Routes: page at `/membership/expertise` (+ `/register`, `/[id]/edit`); API at `/api/expertise` (+ `/[id]`) — flat top-level resource name mirroring the `/services` ↔ `/api/services` convention, not nested under `/api/memberships`. |
| D-13 | "Expertise Directory" added as a new `<li>` in the Membership submenu in `nav-bar.tsx`, alongside the existing "Membership Types" / "Upgrade Membership" links. |
| D-14 | FR-09 (Admin Moderation) surfaced via `/admin/expertise` — list + toggle `isHidden`, mirrors `/admin/services` + `AdminServiceActions.tsx`. |
| D-15 | "My Expertise Profile" link surfaced on `/dashboard` (mirrors D-09 from SPEC-23) — only shown to eligible members; shows "Register" or "Edit my entry" depending on whether one exists. |

---

## Prisma Schema

```prisma
model ExpertiseProfile {
  id           String   @id @default(uuid()) @db.Uuid
  memberId     String   @unique @map("member_id") @db.Uuid
  fullName     String   @map("full_name")              // snapshot from Member.fullName at registration
  organization String?                                  // optional free text — not from Member profile
  categories   String[]                                 // validated against EXPERTISE_CATEGORIES
  blurb        String   @db.Text
  isHidden     Boolean  @default(false) @map("is_hidden")
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime @updatedAt @map("updated_at") @db.Timestamptz

  member Member @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@map("expertise_profiles")
}
```

Back-relation added to `Member`:
```prisma
expertiseProfile ExpertiseProfile?
```

No second model is needed (no contact-log analog — out of scope per D-02/Non-Goals).

---

## Shared Constants (`lib/expertise/constants.ts`)

```ts
export const EXPERTISE_CATEGORIES = [
  'Academics',
  'Healthcare',
  'Charity',
  'Music',
  'Dance',
  'Technology',
  'Science',
  'Law',
  'Professional Services',
  'Other',
] as const

export type ExpertiseCategory = typeof EXPERTISE_CATEGORIES[number]

export const ELIGIBLE_MEMBERSHIP_TYPES = [
  'life',
  'lifeWard',
  'patron',
  'benefactor',
  'honoraryNoVote',
] as const
```

Both the Zod schema and the registration route import these — single source of truth, used for validation, the category filter `<select>`, and the eligibility check.

---

## Zod Schemas (`lib/validation/expertise-profile.schema.ts`)

```ts
const CategoryEnum = z.enum(EXPERTISE_CATEGORIES)

export const RegisterExpertiseSchema = z.object({
  organization: z.string().max(200, 'Organization must be 200 characters or fewer').optional(),
  categories: z.array(CategoryEnum).min(1, 'Select at least one category').max(10),
  blurb: z.string().min(10, 'Blurb must be at least 10 characters').max(500, 'Blurb must be 500 characters or fewer'),
})

export const UpdateExpertiseSchema = RegisterExpertiseSchema.partial().extend({
  isHidden: z.boolean().optional(),   // admin-only — ignored for non-admin callers at the route layer
})

export type RegisterExpertiseInput = z.infer<typeof RegisterExpertiseSchema>
export type UpdateExpertiseInput = z.infer<typeof UpdateExpertiseSchema>
```

---

## Service Layer (`lib/expertise/expertise-profile-service.ts`)

```ts
export type ExpertiseProfilePublic = {
  id: string
  memberId: string
  fullName: string
  organization: string | null
  categories: string[]
  blurb: string
  isHidden: boolean
  createdAt: Date
  updatedAt: Date
}

const PAGE_SIZE = 25

listExpertiseProfiles(filters: {
  category?: string
  page: number
  includeHidden?: boolean   // admin only
}): Promise<{ results: ExpertiseProfilePublic[]; total: number; page: number; pageSize: number }>
// Promise.all([count, findMany]) — where: { ...(includeHidden ? {} : { isHidden: false }), ...(category ? { categories: { has: category } } : {}) }
// orderBy: { createdAt: 'desc' }, skip/take per PAGE_SIZE — mirrors member-search.ts exactly

getExpertiseProfileById(id): Promise<ExpertiseProfilePublic | null>
getExpertiseProfileByMemberId(memberId): Promise<ExpertiseProfilePublic | null>
createExpertiseProfile(memberId, fullName, data: RegisterExpertiseInput): Promise<ExpertiseProfilePublic>
updateExpertiseProfile(id, data: UpdateExpertiseInput): Promise<ExpertiseProfilePublic>
deleteExpertiseProfile(id): Promise<void>
```

No `*Public` email-exclusion concern here (unlike `ServiceProvider`) — `ExpertiseProfile` has no routing email; everything in the model is meant to be displayed.

---

## API Routes

### `GET /api/expertise`
- **Auth:** `withAuth` — any authenticated member; **must** have `memberStatus === 'active'` (403 otherwise)
- **Query params:** `category` (string, validated against `EXPERTISE_CATEGORIES`), `page` (number, default 1)
- **Response 200:** `{ results: [{ id, fullName, organization, categories, blurb, createdAt }], total, page, pageSize }`
- `isHidden` entries excluded; `isHidden` field itself omitted from non-admin responses

### `POST /api/expertise`
- **Auth:** `withAuth`, `memberStatus === 'active'` AND `membershipType ∈ ELIGIBLE_MEMBERSHIP_TYPES` — 403 otherwise (with a message distinguishing "not active" vs. "tier not eligible")
- **Body:** `{ organization?, categories, blurb }`
- `fullName` sourced from `ctx.user.fullName` (never user-supplied, snapshot at creation)
- Returns 409 if member already has an entry
- **Response 201:** `{ profile: { id, fullName, organization, categories, blurb, createdAt } }`

### `PATCH /api/expertise/[id]`
- **Auth:** `withAuth`; member must own the entry OR be admin
- **Body:** `{ organization?, categories?, blurb?, isHidden? }`
- `isHidden` only settable by admin; ignored (stripped) for non-admin callers — mirrors D-13 from SPEC-23 (`isActive` admin-only)
- **Response 200:** updated profile

### `DELETE /api/expertise/[id]`
- **Auth:** `withAuth`; own entry or admin
- **Response 204**

---

## Pages

### `/membership/expertise` — Directory listing
- Server component, `export const dynamic = 'force-dynamic'`
- `getCurrentMember()` → `redirect('/login')` if null; `redirect('/dashboard')` (or show message) if `memberStatus !== 'active'`
- Fetch via `listExpertiseProfiles({ category, page })` from service layer
- Filter form: category `<select>` populated from `EXPERTISE_CATEGORIES` (`<form method="GET">`, mirrors `services/page.tsx`)
- Pagination controls: Prev/Next + page indicator, query-string driven (`?category=...&page=...`)
- Each entry shows: Name, Organization (if present), Area(s) of Expertise (joined categories), Blurb
- "Register your expertise" link shown only to eligible members without an existing entry; "Edit my entry" link if one exists

### `/membership/expertise/register` — Registration form
- Server component shell + client form (mirrors `services/register`)
- `getCurrentMember()` → redirect `/login` if null
- Eligibility check: `membershipType ∈ ELIGIBLE_MEMBERSHIP_TYPES` AND `memberStatus === 'active'`; otherwise show explanatory message (no form), per FR-01
- Duplicate check: `getExpertiseProfileByMemberId` → redirect to `/membership/expertise/[id]/edit` if exists
- Fields: organization (text, optional), categories (checkboxes from `EXPERTISE_CATEGORIES`), blurb (textarea, char counter against 500)
- Name auto-populated from session, not editable
- On success: redirect to `/membership/expertise`

### `/membership/expertise/[id]/edit` — Edit own entry
- Same form as register, pre-populated via server fetch; owner-only (redirect if not owner/admin)
- Submits to `PATCH /api/expertise/[id]`
- "Remove my entry" button → `DELETE /api/expertise/[id]` → redirect to `/membership/expertise`

### `/admin/expertise` — Admin moderation (new stub page, mirrors `/admin/services`)
- `getCurrentMember()` → redirect if `role !== 'admin'`
- Fetches all entries via `listExpertiseProfiles({ includeHidden: true, page })`
- Table: Name, Organization, Categories, Hidden (Yes/No), Actions
- `AdminExpertiseActions.tsx` client component (mirrors `AdminServiceActions.tsx`): toggle `isHidden` via `PATCH`, delete via `DELETE`

---

## Nav Change

`app/components/nav-bar.tsx` — Membership submenu (around line 46):

```tsx
<li><Link href="/membership">Membership Types</Link></li>
<li><Link href="/membership/expertise">Expertise Directory</Link></li>   {/* new */}
<li><Link href="/dashboard">Upgrade Membership</Link></li>
```

---

## Dashboard Link

`app/dashboard/page.tsx` — add a conditional panel link (mirrors D-09/FR-08 from SPEC-23):
- If `membershipType ∈ ELIGIBLE_MEMBERSHIP_TYPES`: show "My Expertise Entry" → links to `/membership/expertise/register` (no entry) or `/membership/expertise/[id]/edit` (has entry)
- If not eligible: no panel shown (keeps dashboard uncluttered for ineligible tiers)

---

## Test Coverage Plan

| File | Tests |
|------|-------|
| `app/api/expertise/route.test.ts` | GET (unauthed 401, expired/suspended 403, active 200, filter by category, pagination `page`/`pageSize`/`total`), POST (ineligible tier 403, non-active 403, duplicate 409, eligible+active 201) |
| `app/api/expertise/[id]/route.test.ts` | PATCH (non-owner non-admin 403, owner 200, admin can set `isHidden`, non-admin cannot set `isHidden`), DELETE (non-owner 403, owner 204, admin 204) |
| `lib/expertise/expertise-profile-service.test.ts` (if unit-level coverage warranted) | `listExpertiseProfiles` filtering/pagination/sort correctness, `isHidden` exclusion for non-admin |

Playwright E2E (`e2e/expertise-directory.spec.ts`):
- Eligible active member registers → entry appears in directory
- Ineligible (Annual) member blocked from registration route
- Expired member blocked from viewing directory
- Category filter narrows results
- Admin hides an entry → disappears from public listing, remains in `/admin/expertise`
- Member edits/removes own entry

---

## Build Sequence

```
Step 1: Schema
   └── Creates: ExpertiseProfile model + Member back-relation in schema.prisma
   └── Run: npx prisma db push && npx prisma generate

Step 2: Shared constants & validation (depends on Step 1 for type alignment)
   └── Creates: lib/expertise/constants.ts, lib/validation/expertise-profile.schema.ts

Step 3: Service layer (depends on Step 1, 2)
   └── Creates: lib/expertise/expertise-profile-service.ts

Step 4: RED tests for API routes (depends on Step 2, 3 — TDD: write failing tests first)
   └── Creates: app/api/expertise/route.test.ts, app/api/expertise/[id]/route.test.ts

Step 5: API routes — GREEN (depends on Step 4)
   └── Creates: app/api/expertise/route.ts, app/api/expertise/[id]/route.ts

Step 6: Pages (depends on Step 3, 5)
   └── Creates: app/membership/expertise/page.tsx, app/membership/expertise/register/page.tsx,
                app/membership/expertise/register/RegisterForm.tsx,
                app/membership/expertise/[id]/edit/page.tsx, app/membership/expertise/[id]/edit/EditForm.tsx

Step 7: Admin moderation (depends on Step 3, 5)
   └── Creates: app/admin/expertise/page.tsx, app/admin/expertise/AdminExpertiseActions.tsx

Step 8: Nav + Dashboard wiring (depends on Step 6)
   └── Modifies: app/components/nav-bar.tsx, app/dashboard/page.tsx

Step 9: Playwright E2E (depends on Step 6, 7, 8)
   └── Creates: e2e/expertise-directory.spec.ts
```

---

## Files NOT to Touch

| File Path | Reason |
|-----------|--------|
| `lib/services/service-provider-service.ts`, `app/services/**`, `app/api/services/**`, `app/admin/services/**` | Distinct feature (Services Directory / SPEC-23) — different eligibility, has messaging/contact component this feature explicitly excludes. Do not merge or repurpose. |
| `lib/messaging/resend.ts`, `lib/messaging/service-contact.ts` | No messaging/contact component in this spec (confirmed Non-Goal). |
| `lib/members/services/member-search.ts` | Reference/pattern only — not modified, just mirrored for pagination shape. |

---

## Design Review Checklist

- [x] Follows existing codebase patterns (`ServiceProvider` directory structure, `member-search.ts` pagination, `withAuth`/`getCurrentMember` gating, `AdminServiceActions` moderation UI)
- [x] No unnecessary complexity — no contact log, no Resend, no rate limiting, no approval workflow, no Postgres enum
- [x] Clear separation of concerns (constants → validation → service layer → routes → pages, mirrors SPEC-23)
- [x] Testable design — RED tests specified before route implementation (TDD per AGENTS.md)
- [x] No breaking changes — additive model + routes + nav entry only
- [x] Security considerations addressed — server-side eligibility (D-05) and viewer-access (D-06) checks; admin-only `isHidden` mutation enforced at route layer
- [x] Performance implications considered — bounded population, indexed `memberId @unique`, paginated queries mirror proven `member-search.ts` approach

**Design Status:** ✅ Ready for Implementation

---

## Handoff to Implementation Agent

**Implementation Priority (follow Build Sequence above strictly — TDD RED→GREEN→REFACTOR per AGENTS.md):**
1. Schema first (`ExpertiseProfile` + back-relation), then `db push` + `generate` before writing any code that imports `@prisma/client` types for it.
2. Constants (`EXPERTISE_CATEGORIES`, `ELIGIBLE_MEMBERSHIP_TYPES`) before validation schemas — both Zod and route-layer eligibility checks import from here; single source of truth.
3. Write failing API route tests (Step 4) before implementing the routes (Step 5) — do not skip RED.
4. Reuse `AdminServiceActions.tsx` as a structural copy-and-adapt template for `AdminExpertiseActions.tsx` (same Supabase-session-token → fetch pattern), swapping `status` toggle for `isHidden` toggle.
