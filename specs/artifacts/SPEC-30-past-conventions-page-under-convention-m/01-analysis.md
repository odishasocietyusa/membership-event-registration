# SPEC-30 — Phase 1: Analysis

**Analyst:** Claude Code
**Date:** 2026-06-11
**Status:** Complete — Awaiting human approval before Phase 2

---

## 1. Requirement Summary

Add a public "Past Conventions" section to the site. Content is authored in Sanity CMS. The main entry point (`/conventions/past`) auto-redirects to the most recent convention year. Each year lives at `/conventions/past/[year]` and shows a structured page: header metadata, overview text, core team, guests, tiered donors, award winners, and optional media links. A year-selector dropdown lets visitors navigate between years. "Past Conventions" is added as a nav link under the Events menu (alongside the existing Annual Convention link).

---

## 2. Functional Requirements Inventory

| ID | Requirement | Source | Notes |
|----|-------------|--------|-------|
| FR-01 | New Sanity document type `past_convention` | Issue spec | One document per year |
| FR-02 | Convention header: number, year, city, state, dates_text, venue, theme, host_chapter | Issue spec | Number is manual entry (e.g. 56 → displayed "56th"); year is primary key |
| FR-03 | Overview: free-form rich text (Portable Text) | Issue spec | Optional |
| FR-04 | Core Team: ordered list of `{ name, role }` pairs | Issue spec | e.g. "General Secretary — John Doe" |
| FR-05 | Convention Guests: ordered list of `{ name, role }` | Issue spec | e.g. "Chief Guest — Jane Smith" |
| FR-06 | Donors: tiered structure — each tier has a free-text heading and a list of `{ name, organization? }` entries; tier count is not predefined | Issue spec | Nested array: array of tiers, each tier contains array of donors |
| FR-07 | Award Winners: list of `{ award_name, recipient_name }` | Issue spec | No categories |
| FR-08 | Media: optional YouTube link and optional photo album link, rendered as clickable buttons | Issue spec | No embedding, no thumbnails |
| FR-09 | Route `/conventions/past` → redirect to most recent year's page | Issue spec | Server-side redirect via Next.js `redirect()` |
| FR-10 | Route `/conventions/past/[year]` — the full convention page | Issue spec | `year` is a 4-digit number in the URL (string param, parsed to number for query) |
| FR-11 | Year-selector dropdown (most recent first) on each year page | Issue spec | Must trigger full navigation to new year URL |
| FR-12 | Empty/unpublished years show an empty state — no placeholder copy | Issue spec | If no Sanity doc exists for that year, show minimal empty page |
| FR-13 | Public access — no login required, no auth gate | Issue spec | No middleware changes needed |
| FR-14 | "Past Conventions" added as submenu item under Events in the top nav | Issue spec | Placed alongside existing Annual Convention link |

---

## 3. Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | ISR revalidation | 60 s (matches existing Sanity-backed pages) |
| NFR-02 | Public route — no `withAuth` | No auth middleware or session checks |
| NFR-03 | Consistent ESLint compliance | All internal links use `<Link>`, no `<a>` for page routes |

---

## 4. Codebase Patterns to Follow

### 4.1 Sanity Schema Conventions
- Document type names: `snake_case` → new type is `past_convention`
- Field names: `snake_case` throughout
- Every schema: `orderings` array + `preview` block
- Optional fields: no `.required()` validator; TypeScript uses `field?: Type`
- Arrays of structured objects: use Sanity `object` type inline (no separate schema needed for simple sub-objects like `{ name, role }`)
- Rich text: `type: 'array', of: [{ type: 'block' }]`
- Nested arrays (donors → tiers → donor entries): outer array of inline `object` types, each containing an inner array of inline `object` types

### 4.2 TypeScript Interface Conventions
- All Sanity interfaces: `Sanity` prefix + PascalCase → `SanityPastConvention`
- Defined in `apps/web/types/sanity.ts`
- Arrays of sub-objects typed as separate interfaces or inline types

### 4.3 Sanity Query Conventions
- GROQ queries: exported constants from `apps/web/sanity/lib/queries.ts`
- Naming pattern: `PAST_CONVENTION_BY_YEAR_QUERY`, `ALL_CONVENTION_YEARS_QUERY`
- All fetches use `sanityFetch<T>()` from `@/sanity/lib/client`
- ISR: pass no `revalidate` arg (defaults to 60 s)

### 4.4 Page / Route Conventions
- Server Components throughout; ISR via `export const revalidate = 60`
- `params` is a `Promise` in Next.js 15 — always `await params` before use
- Year-selector dropdown requires a Client Component (`'use client'`) for `useRouter` navigation

### 4.5 Navigation Conventions
- Nav lives in `apps/web/app/components/nav-bar.tsx`
- All internal nav links use `<Link>` from `next/link`
- The Events `<details>` block currently has: Events (auth-gated), Annual Convention, Awards
- "Past Conventions" is added here, after Annual Convention

---

## 5. Edge Cases & Risk Inventory

| # | Edge Case | Handling |
|---|-----------|----------|
| EC-01 | No convention documents published yet | `/conventions/past` has no "most recent year" → show a static "No past conventions yet" page instead of crashing |
| EC-02 | URL contains a year with no Sanity document | Show empty page (spec-mandated); do not call `notFound()` |
| EC-03 | URL contains a non-numeric year param (e.g. `/conventions/past/abc`) | Parse fails → treat as "no document", show empty page |
| EC-04 | Convention has no donors / no core_team / no award_winners | Sections with empty arrays are simply omitted from the rendered page — no "empty" placeholder row |
| EC-05 | A tier in the donors section has zero donor entries | Render the tier heading but no rows below it (valid author choice) |
| EC-06 | Year-selector with only one year | Dropdown still renders; no UX issue |
| EC-07 | Convention number ordinal display | Store as plain integer (e.g. `56`); display as ordinal string in the UI (e.g. "56th") using a small utility function. Flag to user: see Question Q-01 |

---

## 6. Blocking Questions — Resolved

| ID | Question | Resolution |
|----|----------|------------|
| Q-01 | Integer with auto-ordinal, or string authored by hand? | **String** — authors type "56th" directly into a text field. No ordinal utility needed. |
| Q-02 | Keep Annual Convention at `/activities/convention` or reorganise? | **Route `/activities/convention/past/[year]`** — past conventions nest under the existing annual convention URL tree. Consistent and no existing link changes needed. |
| Q-03 | Donor de-duplication across tiers? | No constraint — content authors manage this. |

---

## 7. Files to Create or Modify

| File | Change |
|------|--------|
| `apps/web/sanity/schemas/past-convention.ts` | New: Sanity document schema |
| `apps/web/sanity/schemas/index.ts` | Add `pastConvention` to `schemaTypes` |
| `apps/web/sanity/lib/queries.ts` | Add `PAST_CONVENTION_BY_YEAR_QUERY`, `ALL_CONVENTION_YEARS_QUERY` |
| `apps/web/types/sanity.ts` | Add `SanityPastConvention`, `SanityConventionYear` interfaces |
| `apps/web/app/activities/convention/past/page.tsx` | New: redirect to most recent year (or empty state) |
| `apps/web/app/activities/convention/past/[year]/page.tsx` | New: full convention year page (Server Component) |
| `apps/web/app/activities/convention/past/[year]/YearSelector.tsx` | New: Client Component year-selector dropdown |
| `apps/web/app/components/nav-bar.tsx` | Add "Past Conventions" link under Events `<details>` |

### Files NOT to touch
- `apps/web/app/activities/convention/page.tsx` — Annual Convention page; out of scope
- `middleware.ts` — public route, no auth changes needed
- Any existing passing tests

---

## 8. Acceptance Criteria (Phase 4 gate)

- [ ] `/activities/convention/past` redirects to the most recent published year
- [ ] `/activities/convention/past/[year]` renders all populated sections for a published convention year
- [ ] Sections with no data (empty arrays) are not rendered
- [ ] Year-selector navigates to the selected year's URL
- [ ] "Past Conventions" appears in the Events nav dropdown
- [ ] All internal links use `<Link>` (no bare `<a>` tags) — no ESLint errors
- [ ] Page is publicly accessible (no auth required)
- [ ] ISR revalidation set to 60 s
