# Feature Specification: About Us Page

> **Spec ID:** SPEC-9-about-us-page
> **Status:** Draft
> **Author:** Utkal Nayak

---

## 1. Overview

### 1.1 Summary
A public static "About Us" page at `/about` that presents OSA's organisational structure, history, mission, and current status. Content is authored and managed in Sanity CMS as a `static_page` document (schema already defined in SPEC-7). The page renders with no custom CSS — structural HTML only, pending Figma UX delivery.

### 1.2 Goals
- [ ] Page renders at `/about` with all provided organisational content
- [ ] Content is editable by authors in Sanity Studio without a code deploy
- [ ] Page updates within 60 seconds of a Sanity publish (ISR)
- [ ] No custom CSS — semantic HTML structure only, Figma design integrated later

### 1.3 Non-Goals (Out of Scope)
- Any styling, layout, colours, or visual design (deferred to Figma integration)
- Member authentication (page is fully public)
- Interactive elements beyond standard page links
- Sub-pages for individual sections

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Page renders at `/about` and is publicly accessible without login | Must Have | |
| FR-02 | Page renders all four sections: Executive Council, Activities, Membership, History, Mission, Current Status | Must Have | Content provided below in section 4.3 |
| FR-03 | Content is stored as a Sanity `static_page` document with slug `about-us` | Must Have | Uses existing schema from SPEC-7 — no new schema |
| FR-04 | Author can edit and republish the page from Sanity Studio | Must Have | |
| FR-05 | Page reflects Sanity edits within 60 seconds (ISR) | Must Have | `revalidate: 60` |
| FR-06 | Portable text body renders headings, lists, bold, and links correctly | Must Have | Use `@portabletext/react` |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | No custom CSS or Tailwind classes | Zero styling until Figma delivered | Use plain semantic HTML tags only |
| NFR-02 | No Sanity API token exposed to browser | Server Component fetch only | |
| NFR-03 | Page indexed by search engines | No `noindex` meta tag | Public organisational page |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] `GET /about` returns 200 and renders the page content
- [ ] All six content sections are present and correctly structured
- [ ] Headings render as `<h2>` / `<h3>` elements
- [ ] Bullet lists render as `<ul><li>` elements
- [ ] Bold text renders as `<strong>` elements
- [ ] External links render as `<a href>` elements
- [ ] Editing the Sanity document and waiting 60 seconds reflects the change on the live page
- [ ] No inline styles or CSS class names on any rendered element
- [ ] All tests passing

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Page loads | No auth | `GET /about` | Returns 200, all sections present |
| Headings present | Page loaded | Inspect DOM | `<h2>` and `<h3>` tags exist for each section |
| Lists render | Page loaded | Inspect DOM | Executive Council officers render as `<ul><li>` |
| Bold renders | Page loaded | Inspect DOM | Member count numbers wrapped in `<strong>` |
| ISR update | Content edited in Sanity Studio | Wait up to 60s, reload `/about` | Updated content appears without redeploy |
| No styling | Page loaded | Inspect DOM | No `class`, `style` attributes on content elements |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Next.js App Router Server Component, `@portabletext/react` for rendering Sanity portable text, Next.js ISR (`revalidate: 60`)
- **Must Avoid:** Any CSS, Tailwind classes, inline styles, or styled-components — structural HTML only

### 4.2 Patterns to Follow
- Fetch pattern from SPEC-7: server-only GROQ query in `sanity/lib/queries.ts`, rendered in a Server Component
- No `use client` directive — this page has no interactivity
- GROQ query filters by `slug.current == "about-us"` and `_type == "static_page"`

### 4.3 Initial Content

The following content is seeded into Sanity Studio as the initial `static_page` document. The author can edit it after go-live.

---

**Document fields:**
- `title`: About Us
- `slug`: `about-us`
- `section`: organisation
- `sort_order`: 1

**Body (portable text — structured as headings, paragraphs, and lists):**

---

#### The Executive Council

The executive council consists of the President (Chairperson of the committee), Vice President, Secretary, Treasurer and Editor-in-Chief (non-voting).

OSA BOG consists of the following officers:

- President
- Vice-President
- Secretary
- Treasurer
- Past President
- Presidents of all the OSA chapters

OSA has currently close to 20 chapters spreading all over USA and Canada.

#### Advisory Council

The Advisory Council (AC) gives advice on administrative matters that come before the organisation. The Advisory Council is not required by by-laws. However, the President may form an advisory council by appointing members that include past presidents, vice-presidents, secretary, treasurer, and editors to assist and advice in critical matters of the society. OSA: The Odisha Society of the Americas.

#### Activities

Activities of the organisation include Annual Convention, cultural promotion through festivals and events through local chapters, Odia language propagation and motherland development.

#### Membership

The membership is open to individuals and families interested in Orissa, the eastern coastal state of India, to promote activities for a better understanding of Odia culture and exchange of information between Odisha and the United States and Canada.

---

## History

The Odisha Society of the Americas (OSA) is a non-political, non-profit, and voluntary association recognized as a 501(c)(3) public non-profit in the United States. OSA was established in 1969 by a few visionary Oriyas who thought of establishing Oriya identity in the adopted land. The society was incorporated in 1981 in Tennessee as a non-profit corporation for promoting activities for a better understanding of Odia culture and exchange of information between Odisha, United States and Canada. It held an annual get-together called convention, where people of Odia origin from different parts of USA and Canada mingled and shared experiences of ethnic living.

### Our Mission

OSA will continue to strive to be a focal point of all Odias around the world to debate issues and to find action plans in the nurture and promotion of Odia heritage and culture and matters meaningful to Odias. The annual conventions and regional celebrations will continue to play major roles in this endeavour along with the electronic preservation & dissemination of information and efforts to gain media attention for Odia people's causes.

The vision of OSA is to promote and propagate Odia culture in Americas by bringing together all the people interested in Odisha.

## Current Status

Today OSA is a strong organisation with more than **1000 member** families and close to **2000 members**. This is due to individuals stepping forward to support different activities of OSA with innovative ideas which, when implemented, benefit us all. The organisation has now spread into many regional chapters, which operate as a social umbrella for different regions in the US and Canada. The chapters arrange various activities such as Odia festivals, social get together, cultural events and participate in the cultural life of the local community as representatives of Odia culture. Besides these the annual convention is known as the centrepiece of the OSA's activities.

In the constitution, the objectives are mentioned as:

- To form a non-political and non-profit organization of all persons interested in Orissa.
- To promote interest and activities in the understanding of the Oriya culture.
- To facilitate the exchange of information between Orissa and the United States/Canada.

The logo is an identifying symbol used to advertise and promote an organisation. OSA logo has the following design:

- The theme: The Orissa Society of the Americas.
- O – Graphically presented as an eye of Lord Jagannath, which represents Orissa.
- S – Graphically presented as Canadian flag, which represents societies in Canada.
- A – Graphically presented as American flag, which represents societies in the USA.

---

### 4.4 Files/Modules to Create
- `app/about/page.tsx` — Server Component, fetches Sanity `static_page` by slug `about-us`, renders with `@portabletext/react`
- `sanity/lib/queries.ts` — add `staticPageBySlugQuery` GROQ query (extend from SPEC-7 if not already present)

### 4.5 Files NOT to Modify
- `sanity/schemas/` — `static_page` schema already defined in SPEC-7; no changes needed
- `lib/auth/` — page is public, no auth
- `prisma/schema.prisma` — no database changes

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- **SPEC-7** (static-content-cms) — Sanity Studio must be set up, `static_page` schema registered, and `sanity/lib/client.ts` available before this page can be built

### 5.2 Downstream Impact
- None — this is a leaf-node feature with no downstream dependencies

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| All questions resolved — content and constraints fully defined | — | — |

---

## 7. References

- [`docs/osa-architecture.md`](../../docs/osa-architecture.md) — `static_page` Sanity schema definition and content boundary rules
- [`specs/active/SPEC-7-static-content-cms.md`](SPEC-7-static-content-cms.md) — Sanity setup this page depends on

---

## Agent Workflow Tracking

### Phase 1: Analysis
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-9-about-us-page/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-9-about-us-page/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-9-about-us-page/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-9-about-us-page/04-qa-report.md`
