# QA Report — SPEC-9 About Us Page

## Summary

Implementation was already present from SPEC-7 work. Phase 4 fixed one slug discrepancy and added the missing test suite.

## Changes Made

### Bug Fix
- `sanity/lib/queries.ts` — `ABOUT_PAGE_QUERY` used slug `"about"` but the spec defines the Sanity document slug as `"about-us"`. Fixed to match the spec.

### Tests Added
- `app/about/page.test.ts` — 5 tests (AB-01 through AB-05)

## Test Results

```
PASS app/about/page.test.ts
  AboutPage
    ✓ AB-01: calls sanityFetch with the about page query
    ✓ AB-02: returns a defined JSX element when content is present
    ✓ AB-03: handles null from sanityFetch without throwing
    ✓ AB-04: exports revalidate = 60
    ✓ AB-05: renders without requiring Supabase or auth

Tests: 5 passed, 5 total
```

## Acceptance Criteria Review

| AC | Requirement | Status |
|----|-------------|--------|
| FR-01 | Page at `/about`, publicly accessible | ✅ Server Component, no auth guard |
| FR-02 | All content sections rendered | ✅ PortableText renders body from Sanity |
| FR-03 | `static_page` doc with slug `about-us` | ✅ Query now uses `about-us` |
| FR-04 | Author can edit in Sanity Studio | ✅ Content stored in Sanity |
| FR-05 | ISR ≤ 60 seconds | ✅ `export const revalidate = 60` |
| FR-06 | Portable text renders correctly | ✅ `@portabletext/react` renders headings, lists, bold, links |
| NFR-01 | No CSS/Tailwind | ✅ Plain semantic HTML only |
| NFR-02 | No Sanity token to browser | ✅ Server Component fetch only |
| NFR-03 | Page indexed | ✅ No noindex meta tag |
