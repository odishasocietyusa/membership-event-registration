# Feature Specification: Member Search

> **Spec ID:** SPEC-16-member-search
> **Status:** Draft
> **Author:** Utkal Nayak
> **Created:** 2026-05-17

---

## 1. Overview

### 1.1 Summary
A member-facing search page at `/members/search` that lets any authenticated, active OSA member search the membership directory by first name, last name, city, state, and country. Results are displayed in an unstyled table showing Last Name, First Name, City, State, Member Since, Membership Type, and Membership Status. Each result row includes a "Send Message" link pre-encoded with the target member's ID for future messaging epic wiring. The searcher must be active; results include members of any status (active, expired, suspended) so members can reconnect regardless of their peer's standing.

### 1.2 Goals
- [ ] Any active member can search the directory without admin access
- [ ] Suspended, expired, or unauthenticated users are blocked from accessing the page and API
- [ ] Search supports six filter fields: First Name, Last Name, City, State (dropdown), Country (dropdown: USA / Canada)
- [ ] State dropdown shows US states by default; swaps to Canadian provinces when Canada is selected
- [ ] Blank/trivial searches are rejected: at least one name or city field must have ≥ 3 characters, OR a state must be selected; country alone is never sufficient
- [ ] Results include members of any status (active, expired, suspended) — not restricted to active only
- [ ] Results paginate at 100 per page with total count displayed; hard cap of 1 000 total results
- [ ] Results table shows seven columns: Last Name, First Name, City, State, Member Since, Membership Type, Membership Status
- [ ] Each result row includes a "Send Message" link pre-encoded as `/messages/new?to={memberId}`
- [ ] No CSS styling — bare functional HTML only (consistent with current project phase)

### 1.3 Non-Goals (Out of Scope)
- Searching by email, phone, or member ID
- Exposing contact details (phone, email) in search results
- Respecting per-member `profileVisibility` flags for result columns — deferred to a separate epic
- Sorting controls in the UI (results ordered by last name ascending, then first name)
- Admin-level search (SPEC-13 admin panel handles that separately)
- "Send Message" link functionality — link is present and encoded; messaging epic will create the target route

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Page redirects unauthenticated users to `/login` | Must Have | Server-side redirect |
| FR-02 | Page returns 403 if the logged-in member's `memberStatus` is not `active` | Must Have | Expired and suspended members are blocked as searchers |
| FR-03 | Search form has four text inputs (First Name, Last Name, City, Country dropdown, State/Province dropdown) | Must Have | Country defaults to USA; State defaults to empty |
| FR-04 | Country dropdown contains exactly two options: USA and Canada | Must Have | |
| FR-05 | State dropdown shows all 50 US states when USA is selected; swaps to all 13 Canadian provinces/territories when Canada is selected | Must Have | Dynamic swap on country change — no page reload |
| FR-06 | Search is rejected client-side if: all name fields are empty AND city is empty AND no state is selected | Must Have | Country alone is never a valid sole filter |
| FR-07 | Any name or city text input that is non-empty must contain ≥ 3 characters; shorter values show a validation error and block submission | Must Have | Client-side guard |
| FR-08 | API enforces the same minimum-length rule server-side; returns 400 if violated | Must Have | Defense in depth — client validation is not trusted |
| FR-09 | `GET /api/members/search` returns members of any status (active, expired, suspended); `deletedAt = null` always enforced | Must Have | Searcher finds peers regardless of their membership standing |
| FR-10 | API requires a valid session token and `memberStatus = active` for the caller; returns 401/403 otherwise | Must Have | Uses `withAuth` + active-status check on caller only |
| FR-11 | firstName and lastName filters use case-insensitive substring match against stored name data | Must Have | See OQ-1 re: name field structure |
| FR-12 | City filter uses case-insensitive substring match against `address.city` | Must Have | `address` is a JSON field — use Prisma JSON path query |
| FR-13 | State filter matches `address.state` exactly (case-insensitive); country filter matches `address.country` | Must Have | Dropdown value is the canonical state/province name |
| FR-14 | Multiple filters combined with AND | Must Have | e.g. city="Atlanta" AND state="Georgia" narrows results |
| FR-15 | API response includes `total` (capped at 1 000), `page`, `pageSize` (100), and `results` array | Must Have | Total reflects matched records up to the 1 000 cap |
| FR-16 | Results beyond 1 000 matches are silently truncated at the DB query level; UI shows "Showing top 1 000 results — refine your search" when total hits cap | Must Have | Prevents full directory enumeration |
| FR-17 | Page UI shows total result count and current page range (e.g. "Showing 1–100 of 243 results") | Must Have | |
| FR-18 | Pagination controls navigate between 100-record pages client-side | Must Have | Previous / Next at minimum |
| FR-19 | Results table columns: Last Name, First Name, City, State, Member Since (joinDate), Membership Type, Membership Status, Actions | Must Have | Empty fields show "—" |
| FR-20 | Actions column contains a "Send Message" link with `href="/messages/new?to={memberId}"` | Must Have | Messaging epic will create the target route |
| FR-21 | Results ordered by last name ascending, then first name ascending | Should Have | Alphabetical UX expectation |
| FR-22 | "No results found" message shown when query returns zero rows | Must Have | |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | API response time | < 500 ms for typical queries | Index on `deleted_at` exists; analyst to confirm index on `address` JSON fields |
| NFR-02 | No PII beyond the seven result columns | Email, phone must not appear in API response; `memberId` only appears in the Send Message link href, never as a visible table cell | Response shape is a strict DTO, not a raw Prisma `Member` row |
| NFR-03 | Active-status check is server-side for the caller | Not client-side only | Page (server component) and API route both enforce it |
| NFR-04 | Minimum-length validation is enforced server-side | API returns 400 for sub-3-char inputs | Not relying solely on client-side guard |
| NFR-05 | No CSS | Unstyled HTML — no className, no Tailwind, no inline styles | Consistent with project-wide styling freeze |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] Unauthenticated GET to `/members/search` redirects to `/login`
- [ ] Authenticated but non-active member (expired/suspended) gets 403 on the page
- [ ] All-empty form submission is blocked client-side with a validation message
- [ ] Text input with 1–2 characters is blocked with a "minimum 3 characters" message
- [ ] Country-only selection (no name, city, or state) is blocked client-side
- [ ] Selecting Canada swaps State dropdown to Canadian provinces without page reload
- [ ] Search by last name returns members of any status whose name contains the term
- [ ] Search by city returns members of any status whose address.city contains the term
- [ ] Combined first name + state filter returns the AND intersection
- [ ] State filter matches members whose address.state equals the selected state value
- [ ] Results table has seven data columns plus an Actions column with "Send Message" link
- [ ] "Send Message" link href is `/messages/new?to={memberId}`
- [ ] Response includes `total`, `page`, `pageSize` fields
- [ ] Page UI shows "Showing X–Y of Z results"
- [ ] When total hits 1 000, UI shows "Showing top 1 000 results — refine your search"
- [ ] Pagination Previous/Next controls work correctly
- [ ] `GET /api/members/search` with no token returns 401
- [ ] `GET /api/members/search` with an expired caller token returns 403
- [ ] `GET /api/members/search?firstName=ab` (2 chars) returns 400
- [ ] Response body contains no email or phone fields

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Unauthenticated access | No session | Visit `/members/search` | Redirect to `/login` |
| Expired caller blocked (page) | Session with `memberStatus = expired` | Visit `/members/search` | 403 message with link to `/membership` |
| All-empty submit | Active member, all fields blank | Click Search | Validation message; no API call |
| Country-only submit | Active member, only country selected | Click Search | Validation message; state required |
| Too-short input | Active member, firstName = "Na" | Click Search | "Minimum 3 characters" error |
| State dropdown swap | Active member, country = USA | Select Canada | State dropdown replaces with Canadian provinces |
| Last name search — finds expired member | Active member; DB has expired member "Nayak" | lastName="Nayak" | Expired member row appears (any status in results) |
| City + state search | Active member; member in Atlanta, Georgia | city="Atlanta", state="Georgia" | That member appears |
| Case insensitivity | Active member; city stored as "Atlanta" | city="atlanta" | Row still appears |
| Canadian province search | Active member; member in Ontario, Canada | country="Canada", state="Ontario" | That member appears |
| No results | Active member; no match | lastName="Zzzzz" | "No results found" |
| Pagination | 250 members match | Page 1 loaded | Shows rows 1–100, total "250 results", Next enabled |
| 1 000 cap hit | 1 200 members match | Search returns | Total shown as 1 000, cap warning displayed |
| API — no token | — | GET `/api/members/search?lastName=Nay` | 401 JSON |
| API — expired caller | Expired member's token | GET `/api/members/search?lastName=Nay` | 403 JSON |
| API — too-short param | Active token | GET `/api/members/search?firstName=ab` | 400 JSON |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Next.js App Router, TypeScript, Prisma, Zod, `withAuth` middleware
- **Must Avoid:** CSS classes, inline styles, Tailwind — unstyled HTML only

### 4.2 Patterns to Follow
- API route follows the pattern in `apps/web/app/api/memberships/route.ts` (withAuth + Zod query parsing + strict response shape)
- Active-status enforcement follows the pattern used in `apps/web/app/api/messages/route.ts` if it exists; otherwise add inline check after `withAuth` call: `if (user.memberStatus !== 'active') return 403`
- Page follows the pattern in `apps/web/app/members/search/page.tsx` (server component, session check at top)
- Service function added to `apps/web/lib/members/member-service.ts` (alongside `listMembers`)
- Zod schema added to `apps/web/lib/validation/member.schema.ts`

### 4.3 Files to Create or Modify

| File | Action | Notes |
|------|--------|-------|
| `apps/web/app/api/members/search/route.ts` | **Create** | New route — separate from admin `/api/members` |
| `apps/web/app/members/search/page.tsx` | **Replace** | Current stub is effectively empty — full replacement |
| `apps/web/lib/members/member-service.ts` | **Modify** | Add `searchMembers()` function |
| `apps/web/lib/validation/member.schema.ts` | **Modify** | Add `MemberSearchQuerySchema` (incl. min-3-char refinements, country/state enum), `MemberSearchResultSchema`, and `MemberSearchResponseSchema` |
| `apps/web/lib/constants/geo.ts` | **Create** | US states list and Canadian provinces list as typed string arrays |

### 4.4 Files NOT to Modify
- `apps/web/app/api/members/route.ts` — admin-only route; access level must not change
- `apps/web/lib/auth/with-auth.ts` — do not add global active-status enforcement here; scope it to this feature only

---

## 5. Open Questions

| # | Question | Status | Answer |
|---|----------|--------|--------|
| OQ-1 | Is `fullName` the only name field, or does `profileData` JSON contain separate `firstName`/`lastName` keys from the registration flow? | **Open** | Analyst must check `apps/web/app/api/` registration route and `profileData` shape. If separate keys exist, use them for more accurate first/last search. If not, fall back to substring match on `fullName`. |
| OQ-2 | Should `address` JSON path queries (`address->>'city'`, `address->>'state'`) be done via Prisma JSON filter or `$queryRaw`? | **Open** | Analyst must verify Prisma 5.x support for `path`-based JSON filtering on PostgreSQL. If unsupported, `$queryRaw` is acceptable. |
| OQ-3 | What should the page show to a non-active caller? | **Resolved** | Plain paragraph: "Member search is available to active members only." with a link to `/membership`. |
| OQ-4 | How should `address.country` be stored for existing members — is it "USA", "United States", or something else? | **Open** | Analyst must check seed data and registration flow to confirm canonical country string so the country filter matches correctly. |

---

## 6. Dependencies

### 6.1 Upstream Dependencies
- Auth infrastructure (SPEC-2) — complete
- Member data layer / Prisma schema (SPEC-3, SPEC-11) — complete
- `withAuth` middleware — complete

### 6.2 Downstream Impact
- **Messaging epic** — the "Send Message" stub link in each result row will be the entry point for the future member-to-member messaging flow; the link target route is TBD in that spec
- `profileVisibility` enforcement epic — a future spec will layer per-member visibility preferences on top of this feature's result columns

---

## 7. References
- Prisma schema: `apps/web/prisma/schema.prisma` — `Member` model
- Existing admin member list: `apps/web/app/api/members/route.ts`
- `withAuth` middleware: `apps/web/lib/auth/with-auth.ts`
- Member service: `apps/web/lib/members/member-service.ts`

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation

### Phase 1: Analysis
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-16/01-analysis.md`

### Phase 2: Design
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-16/02-design.md`

### Phase 3: Implementation
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-16/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-16/04-qa-report.md`
