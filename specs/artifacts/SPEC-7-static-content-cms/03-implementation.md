# Phase 3: Implementation Log

> **Spec:** SPEC-7-static-content-cms
> **Implementer Agent:** implementer-frontend-s7
> **Date:** 2026-05-14
> **Status:** COMPLETE

---

## 1. Files Created (23 new files)

### Sanity Configuration
| File | Description |
|------|-------------|
| `apps/web/sanity.config.ts` | Studio config — project ID, dataset, base path `/studio`, all 6 schema types registered |
| `apps/web/sanity/schemas/event.ts` | Event schema with slug, dates, location, flyer, registration_link |
| `apps/web/sanity/schemas/news-post.ts` | News post schema with Portable Text body |
| `apps/web/sanity/schemas/announcement.ts` | Announcement schema with audience, expires_at, CTA fields |
| `apps/web/sanity/schemas/leadership-program.ts` | Leadership program schema grouped by year |
| `apps/web/sanity/schemas/static-page.ts` | Static page schema with Portable Text body |
| `apps/web/sanity/schemas/media-gallery.ts` | Media gallery schema with photos array |
| `apps/web/sanity/schemas/index.ts` | Barrel export of all 6 schemas |
| `apps/web/sanity/lib/client.ts` | `createClient` (useCdn: false) + `sanityFetch` helper with try/catch |
| `apps/web/sanity/lib/queries.ts` | All GROQ queries for all content types |
| `apps/web/sanity/lib/image.ts` | `urlFor` helper using `@sanity/image-url` |

### TypeScript Types
| File | Description |
|------|-------------|
| `apps/web/types/sanity.ts` | Interfaces for all 6 content types + `SanityImage` |

### Pages (ISR)
| File | `revalidate` | Notes |
|------|-------------|-------|
| `apps/web/app/events/page.tsx` | 60 | Listing, empty state |
| `apps/web/app/events/[slug]/page.tsx` | 60 | Detail + `generateStaticParams` |
| `apps/web/app/news/page.tsx` | 60 | Listing, empty state |
| `apps/web/app/news/[slug]/page.tsx` | 60 | Detail + `generateStaticParams` + Portable Text |
| `apps/web/app/about/page.tsx` | 60 | Slug=`about` lookup, graceful null fallback |
| `apps/web/app/announcements/page.tsx` | 60 | Public, no auth gating |
| `apps/web/app/gallery/page.tsx` | 60 | Listing with cover photo |
| `apps/web/app/leadership-program/page.tsx` | 60 | Listing grouped by year |

### Pages (Static MDX)
| File | Notes |
|------|-------|
| `apps/web/app/constitution/page.tsx` | `next-mdx-remote/rsc` MDXRemote |
| `apps/web/app/bylaws/page.tsx` | Same pattern |

### MDX Content
| File | Notes |
|------|-------|
| `apps/web/content/constitution.mdx` | Placeholder content |
| `apps/web/content/bylaws.mdx` | Placeholder content |

### Studio
| File | Notes |
|------|-------|
| `apps/web/app/studio/[[...tool]]/page.tsx` | `'use client'`, `dynamic = 'force-dynamic'`, `<NextStudio>` |

---

## 2. Files Modified (3 existing files)

| File | Change |
|------|--------|
| `apps/web/next.config.ts` | Added `cdn.sanity.io` to `images.remotePatterns` |
| `apps/web/middleware.ts` | Added `\|studio` to matcher negative lookahead — prevents Supabase session refresh on Studio routes |
| `apps/web/app/page.tsx` | Added announcements widget (public ISR, no auth gating) |

---

## 3. Design Deviations

| # | Deviation | Reason |
|---|-----------|--------|
| D1 | Announcements use a single public query (`ALL_ANNOUNCEMENTS_QUERY`) instead of the two-variant PUBLIC/MEMBER pattern from design §7 | User decision after design was approved: all announcements are public-facing; audience gating removed entirely |
| D2 | `/announcements` page uses `revalidate = 60` instead of `dynamic = 'force-dynamic'` | Direct consequence of D1 — no per-session content difference, standard ISR is correct |
| D3 | Homepage widget has no Supabase session check | Direct consequence of D1 |

---

## 4. Test Results

All 32 pre-existing tests (SPEC-2) pass with zero regressions:

```
Test Suites: 7 passed, 7 total
Tests:       32 passed, 32 total
```

No new unit tests added in this phase — test authoring is Phase 4 (QA).

---

## 5. Manual Steps Required Before Feature is Functional

### 5.1 Environment Variables
Ensure `apps/web/.env.local` contains:
```bash
NEXT_PUBLIC_SANITY_PROJECT_ID=<your-project-id>
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=<your-api-token>
```
(User confirmed these are already set.)

### 5.2 Sanity CORS Configuration
Add the following to **Sanity project settings → API → CORS origins** at sanity.io/manage:
- `http://localhost:3000` (development)
- Production URL (after deployment)

Without this, Sanity Studio at `/studio` will fail to load content.

### 5.3 Sanity Content
Pages will render empty states until content is published in Sanity Studio. To test:
1. Navigate to `http://localhost:3000/studio`
2. Create at least one Event, News Post, and Announcement
3. Pages at `/events`, `/news`, `/announcements` will reflect published content within 60 seconds (ISR)

---

## 6. Package Installation Note

The following packages were added to `apps/web/package.json`:
- `next-sanity` — Sanity client with Next.js ISR support
- `sanity` — Studio v3 + schema APIs
- `@sanity/image-url` — CDN URL builder
- `@portabletext/react` — Portable Text renderer
- `next-mdx-remote` — MDX file reader for `content/` directory
- `@sanity/vision` (dev) — GROQ playground in Studio
