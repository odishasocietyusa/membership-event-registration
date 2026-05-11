# Feature Specification: Obituary Page

> **Spec ID:** SPEC-8-obituary-page
> **Status:** Draft
> **Author:** Utkal Nayak

---

## 1. Overview

### 1.1 Summary
An obituary section that allows OSA admins and volunteer authors to memorialize community members and loved ones via Sanity CMS. Each obituary page contains a biography paragraph and photo. Authenticated, active OSA members can leave comments on each page. All pages are publicly readable and searchable by name, state, and year.

### 1.2 Goals
- [ ] Admin/author can create, edit, and publish obituary pages in Sanity Studio
- [ ] Each page displays a biography paragraph and a photo
- [ ] Listing page with search/filter by name, state, and year
- [ ] Authenticated, active members can post comments on any obituary page
- [ ] Comments are stored in Supabase and displayed alongside Sanity content
- [ ] Pages update within 60 seconds of a Sanity publish (ISR)

### 1.3 Non-Goals (Out of Scope)
- Comment moderation queue (all approved comments are immediately visible)
- Member editing or deleting their own comments
- Nomination or submission form for the public to request an obituary
- Notifications when a new obituary is published

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Admin/author can create an obituary in Sanity Studio with name, bio, photo, state, year of passing | Must Have | |
| FR-02 | Obituary listing page shows all published obituaries | Must Have | Public, no auth required |
| FR-03 | Listing page is filterable by name (text search), state, and year | Must Have | Client-side filter or GROQ query |
| FR-04 | Each obituary has a detail page at `/obituaries/[slug]` | Must Have | |
| FR-05 | Detail page displays biography paragraph and photo | Must Have | |
| FR-06 | Authenticated, active members can post a comment on a detail page | Must Have | `member_status = active` enforced |
| FR-07 | Comments are displayed on the detail page in chronological order | Must Have | |
| FR-08 | Unauthenticated visitors can read comments but cannot post | Must Have | |
| FR-09 | Members who are not active (expired, suspended) cannot post comments | Must Have | |
| FR-10 | Comment body is required and max 500 characters; empty or over-limit comments are rejected | Must Have | |
| FR-11 | Obituary pages update within 60 seconds of Sanity publish | Must Have | ISR `revalidate: 60` |
| FR-12 | Deceased person can optionally be linked to an OSA member record | Should Have | Nullable reference field in Sanity |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Comments immutable after posting | No edit or delete endpoint | Consistent with messaging module pattern |
| NFR-02 | No Sanity API key exposed to browser | Server-only GROQ queries | All fetches in Server Components |
| NFR-03 | Member status validated server-side | Not just client-side check | `withAuth()` + active status check in API route |
| NFR-04 | Comment spam protection | Member must have `member_status = active` | Suspended/expired members blocked |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] `GET /obituaries` renders listing page with all published obituaries (public)
- [ ] Listing page filter by name, state, and year works correctly
- [ ] `GET /obituaries/[slug]` renders obituary detail with bio and photo
- [ ] Detail page shows existing comments below the obituary content
- [ ] `POST /api/obituaries/[slug]/comments` creates a comment for authenticated active member
- [ ] `POST /api/obituaries/[slug]/comments` returns 401 for unauthenticated requests
- [ ] `POST /api/obituaries/[slug]/comments` returns 403 for members with non-active status
- [ ] `POST /api/obituaries/[slug]/comments` returns 400 for empty body
- [ ] `GET /api/obituaries/[slug]/comments` returns all comments for a page
- [ ] Publishing a new obituary in Sanity Studio appears on the site within 60 seconds
- [ ] All tests passing

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Public listing | No auth | `GET /obituaries` | Page renders with all published obituaries |
| Filter by name | No auth | `GET /obituaries?name=sharma` | Only matching obituaries shown |
| Filter by year | No auth | `GET /obituaries?year=2024` | Only 2024 obituaries shown |
| Filter by state | No auth | `GET /obituaries?state=CA` | Only CA obituaries shown |
| Detail page | No auth | `GET /obituaries/[slug]` | Bio, photo, and comments rendered |
| Post comment — active member | Authenticated member with `member_status = active` | `POST /api/obituaries/[slug]/comments` with body | Comment created, returned with id and timestamp |
| Post comment — unauthenticated | No auth header | `POST /api/obituaries/[slug]/comments` | Returns 401 |
| Post comment — expired member | Authenticated member with `member_status = expired` | `POST /api/obituaries/[slug]/comments` | Returns 403 |
| Post comment — suspended member | Authenticated member with `member_status = suspended` | `POST /api/obituaries/[slug]/comments` | Returns 403 |
| Post empty comment | Authenticated active member | `POST /api/obituaries/[slug]/comments` with empty body | Returns 400 |
| Post comment — invalid slug | Authenticated active member | `POST /api/obituaries/nonexistent/comments` | Returns 404 |
| Get comments | No auth | `GET /api/obituaries/[slug]/comments` | Returns comments array in chronological order |
| ISR update | New obituary published in Sanity | Wait up to 60s, then `GET /obituaries` | New obituary appears without redeploy |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Sanity v3 for obituary content, Prisma + Supabase for comments, `withAuth()` from SPEC-2, Zod for comment validation, Next.js ISR (`revalidate: 60`)
- **Must Avoid:** Storing obituary bio/photo in Supabase; storing comments in Sanity

### 4.2 Content Boundary
This spec deliberately spans two systems per the established architecture content boundary:

| Data | Store | Reason |
|------|-------|--------|
| Obituary content (name, bio, photo, state, year) | Sanity CMS | Editorial content managed by volunteer authors |
| Member comments | Supabase DB (`obituary_comments` table) | Member-generated data, requires auth and RLS |

### 4.3 Sanity Schema — `obituary`
```
string    name               (full name of deceased)
slug      slug               (auto-generated from name + year)
date      date_of_passing
int       year               (year of passing — used for filtering)
string    state              (US state where they lived)
string    chapter            (optional — OSA chapter affiliation)
text      biography          (main paragraph content)
image     photo
string    member_id          (optional — Supabase member ID if they were an OSA member)
```

### 4.4 Prisma Model — `obituary_comments`
```prisma
model ObituaryComment {
  id            String   @id @default(uuid())
  obituarySlug  String
  memberId      String
  body          String
  createdAt     DateTime @default(now())

  member        Member   @relation(fields: [memberId], references: [id])

  @@index([obituarySlug])
  @@index([memberId])
}
```

### 4.5 RLS Policy — `obituary_comments`
| Operation | Policy |
|-----------|--------|
| SELECT | Public — any visitor can read |
| INSERT | Authenticated active members only — enforced in API route via `withAuth()` + status check |
| UPDATE | Not permitted |
| DELETE | Not permitted |

### 4.6 Files/Modules to Create
- `sanity/schemas/obituary.ts` — Sanity schema definition
- `sanity/lib/queries.ts` — add GROQ queries for obituary listing and detail (extend from SPEC-7)
- `app/obituaries/page.tsx` — ISR listing page with name/state/year filter
- `app/obituaries/[slug]/page.tsx` — ISR detail page with bio, photo, comments
- `app/obituaries/[slug]/CommentForm.tsx` — client component for comment submission
- `lib/obituaries/comment-service.ts` — create and list comments
- `app/api/obituaries/[slug]/comments/route.ts` — GET (public) and POST (authenticated active member)
- `lib/validation/obituary-comment.schema.ts` — Zod schema for comment body
- `prisma/schema.prisma` — add `ObituaryComment` model

### 4.7 Files NOT to Modify
- `lib/auth/with-auth.ts` — read-only, import only
- `lib/db/prisma.ts` — read-only, import only
- `lib/members/member-service.ts` — read-only, import only
- `sanity/lib/client.ts` — extend queries only via `sanity/lib/queries.ts`

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- **SPEC-2** (foundation-auth) — `withAuth()` required for comment POST route
- **SPEC-3** (member-module) — `members` table and `member_status` field required; `ObituaryComment.memberId` FK references `members.id`
- **SPEC-7** (static-content-cms) — Sanity Studio and `sanity/lib/client.ts` must exist before adding the obituary schema

### 5.2 Downstream Impact
- GDPR export in SPEC-3 should include a member's obituary comments in the data export

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should comment authors' names be displayed publicly on the obituary page, or anonymised? | Resolved | Show full name from member profile. |
| Should there be a maximum comment length? | Resolved | 500 characters maximum. Enforced via Zod validation on the API route. |
| Should obituary pages be indexed by search engines, or excluded via robots.txt? | Resolved | Yes — allow indexing. Obituaries are public memorials; families should be able to find them via Google. |

---

## 7. References

- [`docs/osa-architecture.md`](../../docs/osa-architecture.md) — Content boundary rules, Sanity schema patterns, user roles
- [`specs/active/SPEC-7-static-content-cms.md`](SPEC-7-static-content-cms.md) — Sanity setup patterns to extend
- [`specs/active/SPEC-6-member-messaging.md`](SPEC-6-member-messaging.md) — Member auth + immutable record pattern to follow
- [`specs/active/SPEC-3-member-module.md`](SPEC-3-member-module.md) — `members` table and `member_status` field

---

## Agent Workflow Tracking

### Phase 1: Analysis
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-8-obituary-page/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-8-obituary-page/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-8-obituary-page/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-8-obituary-page/04-qa-report.md`
