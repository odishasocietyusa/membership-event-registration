# Phase 1: Analysis Report

> Spec: SPEC-7-static-content-cms
> Analyst Agent: analyst-s7
> Date: 2026-05-14
> Status: COMPLETE

---

## 1. Requirements Interpretation

### 1.1 Functional Requirements

| ID | Spec FR | Technical Interpretation |
|----|---------|--------------------------|
| FR-01 | Volunteer authors can create/edit/publish events in Sanity Studio | Sanity Studio embedded at `/studio/[[...tool]]` route; uses Sanity's own auth (separate from Supabase Auth). All 6 content schemas must be registered in `sanity.config.ts`. |
| FR-02 | Events page updates within 60s of Sanity publish | `fetch()` in Server Component with `next: { revalidate: 60 }`. No webhook-based on-demand revalidation needed (though it could be added later for sub-60s). |
| FR-03 | News posts page served via ISR | Same pattern as FR-02: `revalidate: 60` on the GROQ query fetch. |
| FR-04 | Announcements on homepage filtered by `expires_at` | GROQ query includes `expires_at > now()` filter. Additionally, `audience: members` items must be withheld from unauthenticated visitors. The `audience` filter is applied server-side in the Server Component (Supabase session checked before deciding which GROQ query to run). |
| FR-05 | Media gallery pages served from Sanity | ISR listing at `/gallery` (or `/media`) and optional per-gallery detail route. |
| FR-06 | Leadership programme certificates page served from Sanity | ISR listing at `/leadership-program`; no per-record detail route required by the spec. |
| FR-07 | Constitution & bylaws served as MDX static pages | Files at `content/constitution.mdx` and `content/bylaws.mdx`. Pages at `/constitution` and `/bylaws`. Rendered at build time — no ISR needed. |
| FR-08 | MDX pages versioned in Git | MDX files committed to the monorepo; changes deploy with CI/CD. No CMS involvement. |
| FR-09 | All images served via Sanity CDN | `@sanity/image-url` constructs CDN URLs from Sanity `image` objects. No Supabase Storage for editorial images. |

**Important clarification from Open Question resolution in the spec:**
- FR-04 audience gating is IN SCOPE: `audience: all` is public, `audience: members` requires a valid Supabase session. This contradicts the "Non-Goals" bullet that says "Member-only announcement filtering deferred to a future spec." The Open Questions section explicitly resolves it as IN SCOPE. This analysis treats it as IN SCOPE.

### 1.2 Non-Functional Requirements

| ID | Spec NFR | Technical Interpretation |
|----|----------|--------------------------|
| NFR-01 | ISR revalidation ≤ 60 seconds | Every Sanity `fetch()` call in Server Components must use `next: { revalidate: 60 }`. The Sanity client must not use the `useCdn: true` option for server-side fetches (CDN caches up to 60s on Sanity's side independently; combining both is fine but default CDN edge TTL should be understood). |
| NFR-02 | No Sanity API key exposed to browser | All GROQ queries run in Server Components (never in `'use client'` components). `SANITY_API_TOKEN` is server-only. `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET` may be public (read-only, standard Sanity pattern). |
| NFR-03 | Build does not fail if Sanity is unreachable | Every `fetch()` call must be wrapped in `try/catch`. On error, return `[]` (empty array) or `null`. Pages must render a graceful empty-state UI instead of throwing. |
| NFR-04 (inferred) | Sanity Studio must not be accessible to anonymous visitors without Sanity credentials | Studio at `/studio` uses Sanity's own auth — unauthenticated users who navigate to `/studio` will be redirected by Sanity's own auth flow, not our Supabase middleware. The Next.js middleware must NOT intercept `/studio` routes (no redirect to `/login`). |
| NFR-05 (inferred) | No CSS/styling until Figma design delivered | Per project-wide constraint in memory, all new pages must be unstyled functional stubs. |

---

## 2. Sanity Schema Design

Based on `docs/osa-architecture.md` § 3 "CMS Schema — Sanity". Each schema below is interpreted for the Sanity v3 `defineType` / `defineField` API.

### 2.1 `event`

| Field | Sanity Type | Validation |
|-------|-------------|------------|
| `title` | `string` | required |
| `slug` | `slug` (source: `title`) | required, unique |
| `start_date` | `datetime` | required |
| `end_date` | `datetime` | optional; must be ≥ `start_date` (custom validation rule) |
| `location` | `string` | required |
| `description` | `text` | required |
| `flyer` | `image` (with hotspot) | optional |
| `registration_link` | `url` | optional |
| `chapter` | `string` | optional |
| `is_convention` | `boolean` | default `false` |

**Notes:** `slug` is the canonical page identifier for `/events/[slug]`. Events with `start_date` in the past are still returned — filtering for "upcoming only" is UI-level, not schema-level, so editorial staff can browse past events in Studio.

### 2.2 `news_post`

| Field | Sanity Type | Validation |
|-------|-------------|------------|
| `title` | `string` | required |
| `slug` | `slug` (source: `title`) | required, unique |
| `published_at` | `datetime` | required |
| `author_name` | `string` | required |
| `cover_image` | `image` (with hotspot) | optional |
| `body` | `array` of `block` (Portable Text) | required |
| `tags` | `array` of `string` | optional |
| `featured` | `boolean` | default `false` |

**Notes:** Body is Portable Text (Sanity's rich text format), not plain `text`. The Next.js renderer needs `@portabletext/react` to render it.

### 2.3 `announcement`

| Field | Sanity Type | Validation |
|-------|-------------|------------|
| `title` | `string` | required |
| `body` | `text` | required |
| `published_at` | `datetime` | required |
| `expires_at` | `datetime` | optional; if set, item hidden after this date |
| `audience` | `string` with `list` options: `all`, `members`, `chapter` | required, default `all` |
| `chapter` | `string` | optional; required when `audience == 'chapter'` (custom validation rule) |
| `cta_link` | `url` | optional |
| `cta_label` | `string` | optional; required when `cta_link` is set (custom validation rule) |

**Notes:** `audience: members` items require Supabase session to view. `audience: chapter` is out of scope for ISR rendering in this spec (no per-chapter filtering UI designed yet); they should be fetched the same way as `audience: all` and visually filtered if chapter data is available.

### 2.4 `leadership_program`

| Field | Sanity Type | Validation |
|-------|-------------|------------|
| `program_name` | `string` | required |
| `recipient_name` | `string` | required |
| `year` | `number` (integer) | required |
| `chapter` | `string` | required |
| `photo` | `image` (with hotspot) | optional |
| `notes` | `text` | optional |

**Notes:** No slug needed — no detail page per record. Listing at `/leadership-program` grouped by year.

### 2.5 `static_page`

| Field | Sanity Type | Validation |
|-------|-------------|------------|
| `title` | `string` | required |
| `slug` | `slug` (source: `title`) | required, unique |
| `body` | `array` of `block` (Portable Text) | required |
| `section` | `string` | optional; used for navigation grouping (e.g. `about`, `history`) |
| `sort_order` | `number` (integer) | optional; default `0` |
| `last_updated` | `datetime` | optional |

**Notes:** The `/about` route fetches the `static_page` document whose slug is `about`. The slug-based approach means volunteer authors control which document maps to `/about`. The Architect should decide whether to use a fixed slug lookup or a `section` + `sort_order` query.

### 2.6 `media_gallery`

| Field | Sanity Type | Validation |
|-------|-------------|------------|
| `title` | `string` | required |
| `event_date` | `datetime` | required |
| `chapter` | `string` | optional |
| `photos` | `array` of `image` (each with hotspot + optional caption) | required; min 1 item |
| `description` | `text` | optional |

**Notes:** No slug in the architecture spec. If a detail page per gallery is needed, a slug field must be added. For now, assume gallery listing only at `/gallery` (or `/media-gallery`). This is an open question for the Architect.

---

## 3. Next.js Page Inventory

### 3.1 Routes to Create

| Route | File Path | Data Source | Auth Required | Notes |
|-------|-----------|-------------|---------------|-------|
| `/events` | `app/events/page.tsx` | Sanity `event` | No | ISR listing; all events (Architect to decide past/future filter) |
| `/events/[slug]` | `app/events/[slug]/page.tsx` | Sanity `event` by slug | No | ISR detail page; `generateStaticParams` from all slugs |
| `/news` | `app/news/page.tsx` | Sanity `news_post` | No | ISR listing |
| `/news/[slug]` | `app/news/[slug]/page.tsx` | Sanity `news_post` by slug | No | ISR detail; Portable Text rendering |
| `/about` | `app/about/page.tsx` | Sanity `static_page` (slug=`about`) | No | ISR |
| `/constitution` | `app/constitution/page.tsx` | `content/constitution.mdx` (Git) | No | Static; no ISR |
| `/bylaws` | `app/bylaws/page.tsx` | `content/bylaws.mdx` (Git) | No | Static; no ISR |
| `/studio/[[...tool]]` | `app/studio/[[...tool]]/page.tsx` | Sanity Studio | Sanity auth (not Supabase) | `'use client'`; must be excluded from Next.js middleware |
| `/gallery` *(or `/media-gallery`)* | `app/gallery/page.tsx` | Sanity `media_gallery` | No | ISR listing; route name TBD by Architect |
| `/leadership-program` | `app/leadership-program/page.tsx` | Sanity `leadership_program` | No | ISR listing |

### 3.2 Existing Routes (No Changes Needed)

| Route | File | Notes |
|-------|------|-------|
| `/` | `app/page.tsx` | May need announcements widget added; Architect to decide |
| `/login` | `app/login/page.tsx` | Existing; no changes |
| `/dashboard` | `app/dashboard/page.tsx` | Existing; no changes |
| `/api/auth/callback` | `app/api/auth/callback/route.ts` | Existing; no changes |
| `/api/auth/me` | `app/api/auth/me/route.ts` | Existing; no changes |

### 3.3 Sanity Support Files to Create (not routes)

| File | Purpose |
|------|---------|
| `sanity.config.ts` | Studio configuration; registers all 6 schemas; sets project ID, dataset, base path `/studio` |
| `sanity/schemas/event.ts` | Event schema definition |
| `sanity/schemas/news-post.ts` | News post schema definition |
| `sanity/schemas/announcement.ts` | Announcement schema definition |
| `sanity/schemas/leadership-program.ts` | Leadership program schema definition |
| `sanity/schemas/static-page.ts` | Static page schema definition |
| `sanity/schemas/media-gallery.ts` | Media gallery schema definition |
| `sanity/schemas/index.ts` | Barrel export of all schemas |
| `sanity/lib/client.ts` | Sanity client singleton (server-only) |
| `sanity/lib/queries.ts` | All GROQ queries |
| `sanity/lib/image.ts` | `@sanity/image-url` builder helper |
| `content/constitution.mdx` | Constitution placeholder (Git) |
| `content/bylaws.mdx` | Bylaws placeholder (Git) |

---

## 4. ISR Strategy

### 4.1 General Pattern

All Sanity-driven pages use Next.js App Router Server Components with `fetch()` options:

```typescript
// In a Server Component (no 'use client')
const data = await fetch(
  `https://${projectId}.api.sanity.io/v2021-10-21/data/query/${dataset}?query=${encodedGROQ}`,
  { next: { revalidate: 60 } }
)
```

The `next-sanity` package's `createClient` supports passing `{ next: { revalidate: 60 } }` as a fetch option via its `fetch` configuration. The Sanity client in `sanity/lib/client.ts` should be configured with `useCdn: false` for server-side fetches to avoid double-caching (Sanity CDN + Next.js ISR), unless the Architect decides CDN is acceptable for initial reads.

### 4.2 Per-Page ISR Settings

| Route | `revalidate` | Rationale |
|-------|-------------|-----------|
| `/events` | `60` | Volunteers publish events; 60s acceptable |
| `/events/[slug]` | `60` | Same |
| `/news` | `60` | News posts |
| `/news/[slug]` | `60` | |
| `/about` | `60` | Infrequent changes but ISR still appropriate |
| `/gallery` | `60` | |
| `/leadership-program` | `60` | |
| `/constitution` | `false` (static) | Git-sourced MDX; redeployed manually |
| `/bylaws` | `false` (static) | Git-sourced MDX; redeployed manually |
| `/studio/[[...tool]]` | N/A | Client-rendered Studio; no ISR |

### 4.3 `generateStaticParams` for Slug Routes

For `/events/[slug]` and `/news/[slug]`, `generateStaticParams` should fetch all slugs at build time. This pre-renders known pages. New slugs published after build are handled by on-demand ISR (Next.js will render and cache them on first request).

```typescript
export async function generateStaticParams() {
  try {
    const slugs = await getClient().fetch(ALL_EVENT_SLUGS_QUERY)
    return slugs.map((s: { slug: string }) => ({ slug: s.slug }))
  } catch {
    return [] // Graceful fallback: no pages pre-built, but still works on first request
  }
}
```

### 4.4 MDX Pages — Static (No ISR)

Pages at `/constitution` and `/bylaws` use `@next/mdx` or `next-mdx-remote` to read `.mdx` files from `content/`. These are fully static (`export const dynamic = 'force-static'` or no `revalidate` export). They only update on redeploy.

---

## 5. Auth Boundary Analysis

### 5.1 Public vs Member-Gated Pages

| Page | Public? | Member-Gated? | Mechanism |
|------|---------|---------------|-----------|
| `/events` | Yes | No | No auth check |
| `/events/[slug]` | Yes | No | No auth check |
| `/news` | Yes | No | No auth check |
| `/news/[slug]` | Yes | No | No auth check |
| `/about` | Yes | No | No auth check |
| `/gallery` | Yes | No | No auth check |
| `/leadership-program` | Yes | No | No auth check |
| `/constitution` | Yes | No | No auth check |
| `/bylaws` | Yes | No | No auth check |
| `/studio/[[...tool]]` | Sanity auth | Sanity auth | Sanity's own login; Next.js middleware must skip this path |
| Announcements (homepage) | `audience: all` only | `audience: members` also visible | Server-side session check + conditional GROQ query |

### 5.2 Announcements Auth Pattern

The homepage (`app/page.tsx`) or an announcements component needs to check the Supabase session server-side:

```
Server Component:
  1. createServerClient() from @supabase/ssr (uses request cookies)
  2. supabase.auth.getUser()
  3. If user exists → GROQ query: fetch announcements where audience in ['all', 'members'] AND expires_at > now()
  4. If no user → GROQ query: fetch announcements where audience == 'all' AND expires_at > now()
```

**Key constraint:** The Sanity GROQ query itself is the only filtering mechanism. The Sanity API is never called client-side, so the audience check is enforced at the server render layer. No member data (email, ID) is sent to Sanity.

**withAuth() is NOT used here** — `withAuth()` in `lib/auth/with-auth.ts` is for API Route Handlers (accepts `Request`, returns `Response`). Announcements gating uses the Supabase SSR client pattern (same as `middleware.ts`) directly inside a Server Component.

### 5.3 Middleware Adjustment Required

The current `middleware.ts` protects `/dashboard` and `/admin` but does NOT protect `/studio`. Since `/studio` uses Sanity's own auth, the middleware should explicitly exclude `/studio` from ALL Supabase session checks (not just the protected-path check). This prevents the Supabase session refresh from running on every Studio request, which is unnecessary overhead.

Current middleware matcher:
```typescript
matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth/callback).*)']
```

The Studio path (`/studio`) needs to be added to the exclusion list, or the `isProtected` check must not match `/studio`:

```typescript
const isProtected = pathname.startsWith('/dashboard') || pathname.startsWith('/admin')
// /studio is NOT isProtected, so unauthenticated users are NOT redirected to /login
// This is correct — Sanity handles Studio auth itself
```

The current middleware already handles this correctly by only redirecting when `!user && isProtected`. Studio paths are not `isProtected`, so the middleware won't redirect. However, it will still run the Supabase session refresh for every Studio sub-route, which adds latency. The Architect should decide whether to add `/studio` to the matcher exclusion list for performance.

### 5.4 `withAuth()` Usage — NOT Applicable to CMS Pages

`withAuth()` in `lib/auth/with-auth.ts` is designed for API Route Handlers that receive a `Request` and return a `Response`. It is NOT used for Server Component page rendering. CMS pages use the Supabase SSR client (cookie-based session) directly, consistent with how `middleware.ts` and the existing dashboard page work.

---

## 6. Package Requirements

### 6.1 Packages to Install (not yet in `apps/web/package.json`)

| Package | Version | Purpose | Location |
|---------|---------|---------|----------|
| `next-sanity` | `^9.x` (latest v3-compatible) | Sanity client for Next.js; includes `createClient` with ISR support, LiveQuery, Studio routing | `dependencies` |
| `sanity` | `^3.x` | Sanity Studio v3 + schema definition APIs | `dependencies` |
| `@sanity/image-url` | `^1.x` | Construct Sanity CDN image URLs from image references | `dependencies` |
| `@sanity/vision` | `^3.x` | GROQ query playground in Studio (dev tool) | `devDependencies` |
| `@portabletext/react` | `^3.x` | Render Sanity Portable Text (rich text) in React | `dependencies` |
| `next-mdx-remote` | `^5.x` | Parse and render MDX files from the filesystem | `dependencies` |

**Note on `@next/mdx` vs `next-mdx-remote`:**
- `@next/mdx` requires configuring `next.config.ts` with `withMDX()` and treating MDX as pages directly; simpler but less flexible for `content/` directory outside `app/`.
- `next-mdx-remote` reads MDX files from any path at runtime and is more flexible.
- The spec says "Must Use: `next-mdx-remote` or `@next/mdx`". Given that MDX files live in `content/` (outside `app/`), `next-mdx-remote` is the better fit. Architect to confirm.

### 6.2 Already Installed (no action needed)

| Package | Installed Version | Relevance |
|---------|------------------|-----------|
| `next` | `^15.1.4` | App Router ISR support |
| `@supabase/ssr` | `^0.5.2` | SSR session for announcements gating |
| `@supabase/supabase-js` | `^2.47.10` | Supabase client |
| `react` | `^19.0.0` | Required by Sanity Studio v3 |
| `typescript` | `^5.7.2` | Schema type definitions |

### 6.3 `next.config.ts` Changes Required

1. Add `cdn.sanity.io` to `images.remotePatterns` so `<Image>` works with Sanity CDN URLs.
2. If using `@next/mdx`, wrap config with `withMDX()` — not needed for `next-mdx-remote`.
3. Sanity Studio requires `transpilePackages: ['sanity']` in some Next.js versions — needs verification during implementation.

---

## 7. Edge Cases & Risks

### 7.1 Sanity Unreachable During ISR Revalidation

**Risk:** During background ISR revalidation, if Sanity's API returns a network error or 5xx, Next.js will serve the stale cached page. This is the desired behavior (`stale-while-revalidate` semantics), but the fetch must not throw an unhandled error.

**Mitigation:** Wrap all `client.fetch()` calls in `try/catch`. Return `[]` for lists and `null` for single-document lookups. Pages must handle the `null`/empty case gracefully (render an "unavailable" message or empty state).

### 7.2 Sanity Unreachable During Build (`generateStaticParams`)

**Risk:** If `generateStaticParams` fails during Vercel build, the build might fail depending on Next.js behavior.

**Mitigation:** Wrap `generateStaticParams` in `try/catch` and return `[]`. Next.js will then render slug pages on-demand (no pre-built pages). The build will succeed.

### 7.3 Image URL Construction

**Risk:** `@sanity/image-url` requires the Sanity project ID and dataset to build CDN URLs. If these are missing or the image reference is malformed, the URL will be incorrect.

**Mitigation:** The `sanity/lib/image.ts` builder helper must validate the image reference before constructing the URL. Pass `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET` from environment variables. Render a fallback `<img>` or `null` if the reference is missing.

### 7.4 Studio CORS Configuration

**Risk:** The embedded Studio at `/studio` makes API calls from `localhost:3000` (dev) and `https://your-domain.com` (prod) to Sanity's API. If CORS is not configured in the Sanity project settings, Studio will fail to load data.

**Mitigation:** After project setup, add the following URLs to Sanity project CORS origins at sanity.io/manage:
- `http://localhost:3000` (development)
- Production URL (set during deployment)

This is a one-time manual step — must be documented for the implementer.

### 7.5 MDX Parsing Edge Cases

**Risk:** Constitution and bylaws documents may contain characters that break MDX parsing (e.g., `{`, `}`, `<`, `>` in legal text).

**Mitigation:** MDX files should escape special characters or use `{/* */}` JSX comment syntax. For `next-mdx-remote`, use `remark-gfm` for GitHub-flavored markdown and `rehype-raw` to handle HTML entities. The placeholder content should be safe; the real documents will need review before insertion.

### 7.6 Sanity Studio Route Conflict with `'use client'` Requirement

**Risk:** The Sanity Studio component (`<NextStudio>` from `next-sanity/studio`) requires `'use client'`. In Next.js App Router, adding `'use client'` to a page file turns it into a Client Component, which means no server-side data fetching in that file. This is fine for the Studio page (it doesn't need server data), but the file must also export `dynamic = 'force-dynamic'` to prevent static generation attempts.

**Mitigation:** The Studio page exports:
```typescript
'use client'
export const dynamic = 'force-dynamic'
```

### 7.7 Portable Text Rendering Dependency

**Risk:** `news_post.body` is Portable Text (not plain text). The renderer `@portabletext/react` needs to be configured with custom components for any embedded images or marks. Without it, the body renders as a raw JSON array.

**Mitigation:** Install `@portabletext/react` and create a basic `PortableTextRenderer` component. Custom marks and types can be added incrementally. This is a build-time dependency, not a runtime risk.

### 7.8 Announcement Audience Gating is Server-Rendered, Not Middleware-Enforced

**Risk:** Member-targeted announcements are filtered in the Server Component, not at the middleware layer. If a developer accidentally renders announcements client-side, the audience filter would not apply.

**Mitigation:** Document that the announcements fetch must always happen in a Server Component. The GROQ query itself should not expose any member data (member data is in Supabase, not Sanity). The worst case is a `audience: members` announcement text being visible to the public — this is low-sensitivity data (it's marketing/notification content, not PII). Accept this risk in the current architecture.

### 7.9 Turbopack Compatibility

**Risk:** `apps/web` uses `next dev --turbopack`. Sanity Studio may have Turbopack compatibility issues with some versions.

**Mitigation:** Test Studio loading under Turbopack during implementation. If incompatible, fallback to `next dev` (without `--turbopack`) for Studio development. Document the workaround.

---

## 8. Open Questions for Architect

| # | Question | Context | Suggested Resolution |
|---|----------|---------|---------------------|
| Q1 | Which MDX library: `@next/mdx` or `next-mdx-remote`? | `content/` dir is outside `app/`; `@next/mdx` is simpler for `app/` co-located pages. | Recommend `next-mdx-remote` for flexibility. |
| Q2 | What is the canonical route for media galleries: `/gallery` or `/media-gallery`? | Architecture doc does not specify a route; spec says "Media gallery pages served from Sanity." | Architect to decide and document in `02-design.md`. |
| Q3 | Does `/about` use a hard-coded slug lookup (`slug == 'about'`) or a `section` field query? | `static_page` schema has both `slug` and `section` fields. | Slug lookup is simpler; section is more flexible for multi-page "About" sections. |
| Q4 | Should homepage (`/`) render announcements inline, or should a separate `/announcements` route be created? | FR-04 says "Announcements displayed on homepage." No separate route mentioned in spec. | Homepage inline; Architect to confirm if a separate listing route is also needed. |
| Q5 | Is `/studio` route excluded from Supabase middleware for performance, or just left in (runs session refresh but doesn't gate)? | Current middleware runs for all routes except `_next/static`, images, and `api/auth/callback`. | Add `/studio` to matcher exclusion for performance. |
| Q6 | Should `generateStaticParams` be implemented for `/events/[slug]` and `/news/[slug]` at launch, or rely solely on on-demand ISR? | Pre-generating known slugs avoids 1st-request latency for all pages but adds build time. | Pre-generate; build time impact is minimal for typical event/news volumes. |
| Q7 | What Sanity dataset name should be used: `production` or a custom name? | Standard Sanity setup uses `production` as default. | Use `production`; document in `.env.example`. |
| Q8 | Should a `chapter` announcement audience type be fully rendered or hidden from public pages? | `audience: chapter` is a third audience type not yet designed for rendering. | Treat `audience: chapter` as public (same as `all`) for now; chapter-specific filtering is deferred. |
| Q9 | Does the leadership program page need a per-record detail route, or is listing only sufficient? | Architecture doc has no slug on `leadership_program`. No detail route mentioned in spec. | Listing only for this spec; add slug + detail route in a future spec if needed. |
| Q10 | Should Sanity project creation (sanity.io account, project ID, dataset) be part of this spec's implementation steps, or is it a pre-requisite? | Spec §5 lists "Sanity project created at sanity.io" as an upstream dependency. | Pre-requisite; implementer must have project ID + dataset + API token before Phase 3 begins. |
