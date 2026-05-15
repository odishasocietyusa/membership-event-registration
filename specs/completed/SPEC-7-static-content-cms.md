# Feature Specification: Static Content & CMS

> **Spec ID:** SPEC-7-static-content-cms
> **Status:** Draft
> **Author:** Utkal Nayak

---

## 1. Overview

### 1.1 Summary
Integrate Sanity CMS for all volunteer-editable content (events, news, announcements, media galleries, leadership programme certificates, static pages) and Git-based MDX for legal/governance documents (constitution, bylaws). Volunteer authors publish content via Sanity Studio with no developer involvement; Next.js fetches and renders it via ISR so pages update within seconds of publish.

### 1.2 Goals
- [ ] Sanity Studio accessible for volunteer authors to manage all editorial content
- [ ] Events, news, announcements, and media galleries served via Next.js ISR pages
- [ ] Static governance documents (constitution, bylaws) served as MDX pages from Git
- [ ] Content boundary strictly enforced — no member data in Sanity, no editorial content in Supabase

### 1.3 Non-Goals (Out of Scope)
- Member authentication for Sanity Studio (authors use Sanity's own auth)
- Event registration (members register via Supabase — out of scope for this spec)
- Member-only announcement filtering (deferred to a future spec)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Volunteer authors can create/edit/publish events in Sanity Studio | Must Have | |
| FR-02 | Events page on website updates within 60 seconds of Sanity publish | Must Have | ISR with `revalidate = 60` |
| FR-03 | News posts page served via ISR | Must Have | |
| FR-04 | Announcements displayed on homepage, filtered by `expires_at` | Must Have | |
| FR-05 | Media gallery pages served from Sanity | Should Have | |
| FR-06 | Leadership programme certificates page served from Sanity | Should Have | |
| FR-07 | Constitution, bylaws, and chapter guidelines served as MDX static pages | Must Have | From Git, not Sanity |
| FR-08 | Static MDX pages are versioned in Git and deployed with the codebase | Must Have | |
| FR-09 | All images in Sanity content served via Sanity CDN | Must Have | Not stored in Supabase Storage |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | ISR revalidation | ≤ 60 seconds | `next: { revalidate: 60 }` on Sanity fetches |
| NFR-02 | No Sanity API key exposed to browser | Server-only fetch | All Sanity queries in Server Components or `generateStaticParams` |
| NFR-03 | Build does not fail if Sanity is unreachable | Graceful fallback | Return empty arrays, not errors |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] Sanity Studio runs at `/studio` route (or external Sanity-hosted URL)
- [ ] `GET /events` renders a list of events fetched from Sanity
- [ ] Publishing a new event in Sanity Studio causes the events page to reflect it within 60 seconds (no redeploy)
- [ ] `GET /news` renders news posts from Sanity
- [ ] `GET /about` renders the about static page from Sanity
- [ ] `GET /constitution` renders constitution from MDX file in Git
- [ ] `GET /bylaws` renders bylaws from MDX file in Git
- [ ] No Supabase member data appears on any Sanity-driven page
- [ ] All tests passing

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Events page renders | Events exist in Sanity | `GET /events` | Page lists all non-expired events |
| ISR revalidation | New event published in Sanity | Wait up to 60s, then `GET /events` | New event appears without redeploy |
| Expired announcement hidden | Announcement `expires_at` is in the past | Homepage loaded | Expired announcement not shown |
| MDX constitution page | `content/constitution.mdx` in Git | `GET /constitution` | Page renders correctly formatted document |
| Empty state | No events in Sanity | `GET /events` | Page renders gracefully with empty state message |
| Sanity unreachable | Sanity API returns error | `GET /events` during build or ISR | Returns empty list, does not throw 500 |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Sanity v3, `next-sanity` for ISR integration, `@sanity/image-url` for image URLs, `next-mdx-remote` or `@next/mdx` for MDX pages
- **Must Avoid:** Storing editorial content in Supabase DB; storing member data in Sanity

### 4.2 Patterns to Follow
- All Sanity queries in Server Components using `fetch` with `next: { revalidate: 60 }`
- Sanity `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET` are safe to expose (read-only)
- `SANITY_API_TOKEN` (write token for Studio) must be server-only
- MDX files live in `content/` directory at project root

### 4.3 Files/Modules to Create
- `sanity.config.ts` — Sanity Studio configuration with all schemas
- `sanity/schemas/` — one schema file per content type (event, news-post, announcement, leadership-program, static-page, media-gallery)
- `sanity/lib/client.ts` — Sanity client singleton
- `sanity/lib/queries.ts` — GROQ queries for all content types
- `app/events/page.tsx` — ISR events listing page
- `app/events/[slug]/page.tsx` — individual event page
- `app/news/page.tsx` — news listing page
- `app/news/[slug]/page.tsx` — individual news post page
- `app/about/page.tsx` — static page from Sanity
- `app/studio/[[...tool]]/page.tsx` — embedded Sanity Studio (if self-hosted)
- `content/constitution.mdx` — OSA Constitution (placeholder content, real doc to be provided)
- `content/bylaws.mdx` — OSA Bylaws (placeholder content, real doc to be provided)
- `app/constitution/page.tsx` — renders constitution MDX
- `app/bylaws/page.tsx` — renders bylaws MDX

### 4.4 Files NOT to Modify
- Any files under `lib/auth/`, `lib/db/`, or `app/api/` — CMS is read-only content, no API routes needed

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- SPEC-2 (foundation-auth) — project must exist; no direct code dependency but deployment environment is shared
- Sanity project created at sanity.io with project ID and dataset configured

### 5.2 Downstream Impact
- Events page provides the registration link that will eventually connect to member event registration

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should Sanity Studio be embedded in the Next.js app (`/studio`) or hosted separately on sanity.io? | Resolved | Embedded at `/studio` inside the Next.js app. One deployment, one repo. |
| Which governance documents need MDX pages at launch? | Resolved | Constitution (`/constitution`) and Bylaws (`/bylaws`) only. Chapter and convention guidelines deferred. |
| Should announcements targeted at `audience: members` require login to view? | Resolved | Yes — member-targeted announcements are gated. Logged-in members see all announcements; public visitors see only `audience: all`. |

---

## 7. References

- [`docs/osa-architecture.md`](../../docs/osa-architecture.md) — CMS schema (all 6 Sanity content types), content boundary table
- Sanity documentation: https://www.sanity.io/docs/next-js

---

## Agent Workflow Tracking

### Phase 1: Analysis
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-7-static-content-cms/01-analysis.md`

### Phase 2: Design
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-7-static-content-cms/02-design.md`

### Phase 3: Implementation
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-7-static-content-cms/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-7-static-content-cms/04-qa-report.md`
