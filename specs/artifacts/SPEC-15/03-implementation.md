# SPEC-15 — Phase 3: Implementation

**Spec:** Navigation Bar (Redesign)
**Implementer:** Claude Code
**Date:** 2026-06-07
**Status:** Complete

---

## 1. Summary

Implemented the redesigned menu tree exactly as resolved in `02-design.md` §2, plus all supporting infrastructure (Programs/Sanity integration, redirects, new stub pages, home page additions). All changes were surgical — only the files listed in the design's §5 file list were touched.

## 2. Changes Made

| File | Change |
|---|---|
| `app/components/nav-bar.tsx` | Restructured into the new 8-menu tree (About Us, Members, Events, Programs, Chapters, Publications, Admin, Donate) + utility bar; component is now `async` and fetches the Programs list server-side via `sanityFetch(PROGRAMS_BY_SECTION_QUERY)`, defaulting to `[]` on failure |
| `sanity/lib/queries.ts` | Added `PROGRAMS_BY_SECTION_QUERY` (filters `static_page` by `section == "programs"`, ordered by `sort_order`); also added `UPCOMING_EVENTS_QUERY` and `NEWS_LATEST_QUERY` for the new home page widgets |
| `types/sanity.ts` | Added `SanityProgramLink` type for the Programs nav listing |
| `app/programs/[slug]/page.tsx` | New dynamic route, mirrors `news/[slug]`, reuses existing `STATIC_PAGE_BY_SLUG_QUERY` |
| `app/about/policy-documents/page.tsx`, `app/about/forms/page.tsx` | New public stubs (slugs `about-policy-documents`, `about-forms`), follow the established `STATIC_PAGE_BY_SLUG_QUERY` + "Coming soon" fallback pattern |
| `app/admin/events/page.tsx`, `app/admin/reports/page.tsx` | New gated stubs (slugs `admin-events`, `admin-reports`), follow the `chapters/executives` session-redirect + static-page pattern; `/admin/*` is already covered by `middleware.ts` |
| `next.config.ts` | Added `redirects()`: 12× `/activities/{slug}` → `/programs/{slug}` (all except `convention`/`awards`, which moved to the Events menu and kept their routes), `/about/contact` → `/`, `/about/committees` → `/programs/osa-committees` |
| `app/page.tsx` | Added 4 new sections (FR-20): Current Executive (`static_page` slug `home-executive-info`), Upcoming Events (`UPCOMING_EVENTS_QUERY`), News (`NEWS_LATEST_QUERY`), Contact Us (`static_page` slug `home-contact-info`) — all follow the existing `sanityFetch` + `<section><h2>` pattern used by Announcements |

## 3. Implementation Notes / Decisions Made During Coding

- **"Current Executive Info" data source** (left as "confirm during implementation" in design §4): `leadership_program` does not represent the current executive committee — it records past Leadership Program award recipients. Rather than design a new Sanity schema (out of surgical scope for a nav spec), this section is backed by a generic `static_page` document (`slug: "home-executive-info"`), exactly the same mechanism already recommended for "Contact Info" (`slug: "home-contact-info"`). Both are simple, content-editable, schema-free, and consistent with how every other one-off content block in this codebase is modeled.
- **"Statement of Member Rights & Privileges"** (`/about/member-rights`): the spec's access-control table marks this "auth-gated", but the live page (read during implementation) has no session check and renders publicly — and it rendered unconditionally in the original `nav-bar.tsx` too. Implementation follows the page's actual (public) behavior rather than the table label, consistent with the "stale spec status is not authoritative — code is" principle established during the SPEC-22 audit.
- **Redirect slugs**: chosen as 1:1 matches with the existing `/activities/*` directory names (e.g., `/activities/library` → `/programs/library`) so Sanity Studio seed-content slugs can mirror them mechanically.
- **Home page widget queries** (`UPCOMING_EVENTS_QUERY`, `NEWS_LATEST_QUERY`): added as small, narrowly-scoped projections (not the full `ALL_EVENTS_QUERY`/`ALL_NEWS_POSTS_QUERY` shapes) to keep the homepage payload minimal — mirrors the existing `ANNOUNCEMENTS_LATEST_QUERY` "latest N, limited" convention.

## 4. Verification

- `npx tsc --noEmit` — clean, no type errors
- `pnpm --filter=web lint` — no ESLint warnings or errors
- Not yet run: `pnpm --filter=web test:e2e` (Phase 4 QA)

## 5. Outstanding Content-Authoring Tasks (not code — Sanity Studio operations)

These are **not implementation blockers**; the nav and pages render gracefully ("Coming soon" / empty lists) without them:
- Seed 13 `static_page` documents with `section: "programs"` (12 migrated Activities entries + OSA Committees)
- Author `static_page` documents for `home-executive-info`, `home-contact-info`, `about-policy-documents`, `about-forms`, `admin-events`, `admin-reports`
