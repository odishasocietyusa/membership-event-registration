# Feature Specification: Member Expertise Directory

> **Spec ID:** SPEC-29-expertise-directory
> **Status:** Draft
> **Author:** Claude Code (drafted with Utkal Nayak)
> **Created:** 2026-06-07

---

## 1. Overview

### 1.1 Summary
A self-registration directory under Membership where eligible long-term members (Life, Life Ward, Patron, Benefactor, Honorary) can list a field of expertise from a fixed set of categories (Academics, Healthcare, Charity, Music, Dance, Technology, Science, Law, Professional Services, Other), an optional organization/affiliation they're associated with for that expertise, and a short blurb about their work. The directory is visible to any active member, who can browse and filter entries by category, so the community can identify people to invite for collaboration or engagement. Admins can hide entries they find unfit.

### 1.2 Goals
- [ ] Let eligible members (Life, Life Ward, Patron, Benefactor, Honorary tiers) self-register one expertise profile, choosing one or more predefined categories, an optional organization, and a short blurb.
- [ ] Let registered members edit or remove their own entry at any time.
- [ ] Display a directory page listing entries to any active member: Name, Organization, Area(s) of Expertise, Short blurb.
- [ ] Support filtering the directory by category.
- [ ] Paginate results at 25 per page, sorted most-recent-first (by registration/update date).
- [ ] Allow admins to hide (and unhide) entries they find unfit, without deleting the underlying data.

### 1.3 Non-Goals (Out of Scope)
- Messaging/contact between members through the directory (no contact form, no email relay — unlike the Services Directory / SPEC-23).
- Search by name or free-text keyword (only category filtering is required).
- Allowing Annual or Five-Year Family members to register (explicitly excluded by the spec).
- Profile photos or rich-media attachments.

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | **Eligibility Gate**: Only members whose `membershipType` is one of `life`, `lifeWard`, `patron`, `benefactor`, `honoraryNoVote` may register an expertise entry. Annual/Five-Year members see a message explaining they're not eligible. | Must Have | Checked server-side on the registration route, not just hidden in the UI |
| FR-02 | **Self-Registration Form**: Eligible member submits Organization (optional, free text), Area(s) of Expertise (multi-select from the 10 fixed categories), and a Short Blurb (required, length-capped). Name is taken from the member's profile, not re-entered. | Must Have | One entry per member (1:1 with `Member`) |
| FR-03 | **Self-Edit / Self-Remove**: A member who has registered can edit their organization, categories, and blurb, or remove their entry entirely, from their profile/dashboard. | Must Have | |
| FR-04 | **Directory Listing Page**: A page under `/membership` lists visible entries showing Name, Organization (if provided), Area(s) of Expertise, and Short Blurb. | Must Have | Members-only; gated by `withAuth()` + active status |
| FR-05 | **Category Filter**: Visitors to the directory can filter the list by one (or more) of the 10 fixed categories. | Must Have | Server-side query filter |
| FR-06 | **Pagination**: Results are paginated at 25 entries per page. | Must Have | |
| FR-07 | **Sort Order**: Entries are sorted most-recently-registered/updated first. | Must Have | `createdAt desc` (or `updatedAt desc` — see Open Questions) |
| FR-08 | **Viewer Access Control**: Only authenticated members with `memberStatus = active` can view the directory listing. Expired/suspended members and non-members are blocked. | Must Have | Mirrors existing active-member gating patterns (e.g. Services Directory) |
| FR-09 | **Admin Moderation**: Admins can hide or unhide any entry from the Admin Panel. Hidden entries are excluded from the public listing but remain owned/editable by the member (or restorable by admin). | Must Have | Soft-hide, not delete |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | **Server-Side Authorization** | Eligibility (membership tier for registration) and viewer access (active status) are enforced in API routes, not just hidden in the UI. | Prevents direct API calls bypassing UI checks |
| NFR-02 | **Data Integrity** | One expertise entry per member; categories restricted to the fixed predefined set (enum), not free text — required for reliable aggregation/filtering. | |
| NFR-03 | **Consistency** | Follows existing directory UI/UX conventions (cards/list, filters, pagination) already established by the Services Directory (`/services`). | |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] Prisma schema updated with a new `ExpertiseProfile` model and `ExpertiseCategory` enum (10 fixed values), migrated via `prisma db push`.
- [ ] Registration form available to eligible members; ineligible members are blocked server-side with a clear explanation.
- [ ] Directory listing page created under `/membership`, gated to active members, displaying Name / Organization / Categories / Blurb.
- [ ] Category filter and 25-per-page pagination work against the database query (not client-side slicing).
- [ ] Listing is sorted most-recent-first.
- [ ] Members can edit/remove their own entry; admins can hide/unhide any entry.
- [ ] Jest unit tests cover eligibility gating, viewer-access gating, filtering, and pagination logic.
- [ ] Playwright E2E test covers: eligible member registers → entry appears in directory → ineligible member cannot register → expired member cannot view directory → admin hides an entry and it disappears from the listing.

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Register - Eligible | Active Life/Patron/Benefactor/Life-Ward/Honorary member, no existing entry | Submits registration form | Entry created, visible in directory |
| Register - Ineligible | Active Annual or Five-Year Family member | Attempts to access registration form/route | Blocked with explanatory message; API returns `403 Forbidden` |
| Register - Duplicate | Member who already has an entry | Attempts to register again | Blocked / redirected to edit their existing entry |
| View Directory - Active Member | Authenticated member, `memberStatus = active` | `GET` directory page | Renders entries with filter and pagination controls |
| View Directory - Expired/Unauthenticated | Expired member or logged-out visitor | `GET` directory page | Redirected / `403 Forbidden` |
| Filter by Category | Directory has entries across multiple categories | Member selects "Technology" filter | Only entries tagged "Technology" are shown |
| Pagination | Directory has 30+ visible entries | Member views page 2 | Entries 26–30 (etc.) are shown, newest-first ordering preserved |
| Self-Edit | Member with existing entry | Updates blurb/organization/categories | Entry reflects changes immediately |
| Self-Remove | Member with existing entry | Deletes their entry | Entry no longer appears in directory |
| Admin Hide | Admin viewing an entry deemed unfit | Toggles "hide" | Entry disappears from public listing but remains in DB / admin view |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Frontend/Backend**: Next.js App Router (React 19)
- **Database**: PostgreSQL (via Supabase & Prisma ORM)
- **Authentication**: Supabase Auth, enforced via existing `withAuth()` server-side utilities
- **Styling**: Tailwind CSS, consistent with existing directory pages (e.g. `/services`)

### 4.2 Patterns to Follow
- Follow the structure and gating conventions established by the recently-built Services Directory (`apps/web/app/services/**`, `ServiceProvider` model) for: route layout (`page.tsx`, `register/page.tsx`, `[id]/edit`), server-side eligibility/active-status checks, and admin moderation via a status-style field.
- Reuse the existing `withAuth()` helpers and active-member gating logic rather than writing new auth checks.

### 4.3 Files/Modules Affected (indicative — to be finalized in Design phase)
- `apps/web/prisma/schema.prisma` — add `ExpertiseProfile` model + `ExpertiseCategory` enum; add back-relation on `Member`
- `apps/web/app/membership/expertise/**` (or similar route — see Open Questions) — listing, registration, edit pages
- `apps/web/app/api/**` — registration, listing (with filter/pagination), edit/delete, admin hide/unhide endpoints
- Admin panel — entry moderation UI

### 4.4 Files NOT to Modify
- `ServiceProvider` / `ServiceContactLog` models and `/services/**` routes — this is a distinct feature with different eligibility and no messaging component; do not merge or repurpose them.

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- **Auth Layer (SPEC-2)**: Requires `withAuth()` and Supabase session/`memberStatus` checks.
- **Member Model**: Requires `membershipType` to be populated and accurate for eligibility checks.

### 5.2 Downstream Impact
- Admin Panel gains a new moderation surface (entries to hide/unhide).

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Exact route/URL for the directory (e.g. `/membership/expertise`, `/membership/expertise-directory`)? | Open | To be decided in Design phase, following existing `/membership` sub-route conventions |
| "Most recent first" — sort by initial registration date (`createdAt`) or last-updated date (`updatedAt`)? Editing an entry would bump it to the top under the latter. | Open | To be confirmed — default assumption is `createdAt desc` (registration order) unless otherwise specified |
| Blurb length cap — what's the max character count for the "short blurb"? | Open | To be decided in Design phase (suggest ~280–500 chars) |
| Should a member's entry automatically become hidden/inactive if they later lose eligibility (e.g. tier change, status goes expired)? | Open | To be decided — suggest auto-hiding entries for non-active members, independent of admin moderation |

---

## 7. References
- [Services Directory Spec (SPEC-23)](file:///Users/utkalnayak/Documents/code/membership-event-registration/specs/completed/SPEC-23-services-directory.md)
- [Prisma Schema Reference](file:///Users/utkalnayak/Documents/code/membership-event-registration/apps/web/prisma/schema.prisma)

---

## Agent Workflow Tracking

### Phase 1: Analysis
- **Status:** Complete — Ready for Design (no blocking questions; recommended defaults proposed for route name, sort field, blurb cap, and no-auto-hide-on-ineligibility)
- **Artifact:** `specs/artifacts/SPEC-29-expertise-directory/01-analysis.md`

### Phase 2: Design
- **Status:** Complete — Approved, ready for Implementation (model `ExpertiseProfile`, routes `/api/expertise`, pages under `/membership/expertise`, admin moderation via `isHidden` flag)
- **Artifact:** `specs/artifacts/SPEC-29-expertise-directory/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-29-expertise-directory/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-29-expertise-directory/04-qa-report.md`
