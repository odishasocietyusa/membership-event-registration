# Phase 2: Design Document

> Spec: SPEC-7-static-content-cms
> Architect Agent: architect-s7
> Date: 2026-05-14
> Status: COMPLETE

---

## 1. Package Installation

Run from `apps/web/`:

```bash
cd apps/web
pnpm add next-sanity sanity @sanity/image-url @portabletext/react next-mdx-remote
pnpm add -D @sanity/vision
```

**Version notes:**
- `next-sanity` v9.x — compatible with Next.js 15 App Router; includes `createClient` with native `fetch` ISR support and `<NextStudio>` component.
- `sanity` v3.x — Studio v3 schema definitions; peer-required by `next-sanity`.
- `@sanity/image-url` v1.x — CDN URL builder.
- `@portabletext/react` v3.x — Portable Text renderer for `news_post.body` and `static_page.body`.
- `next-mdx-remote` v5.x — reads MDX from `content/` directory outside `app/`; confirmed choice over `@next/mdx` (Q1 resolved).
- `@sanity/vision` — dev-only GROQ playground inside Studio.

**No `transpilePackages` needed** for `sanity` in Next.js 15 — `next-sanity` v9 handles this internally. Verify during implementation and add `transpilePackages: ['sanity']` to `next.config.ts` only if build errors appear.

---

## 2. Environment Variables

### `apps/web/.env.local`

```bash
# Sanity — browser-safe (read-only, public Sanity project metadata)
NEXT_PUBLIC_SANITY_PROJECT_ID=<your-sanity-project-id>
NEXT_PUBLIC_SANITY_DATASET=production

# Sanity — server-only (write token for Studio mutations; never expose to browser)
SANITY_API_TOKEN=<your-sanity-api-token>
```

**Classification:**

| Variable | Exposure | Used In |
|----------|----------|---------|
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | Browser-safe | `sanity/lib/client.ts`, `sanity/lib/image.ts`, `sanity.config.ts` |
| `NEXT_PUBLIC_SANITY_DATASET` | Browser-safe | Same as above |
| `SANITY_API_TOKEN` | Server-only | `sanity/lib/client.ts` (for authenticated Studio mutations only) |

**Important:** `SANITY_API_TOKEN` must NEVER appear in any `'use client'` component, any file imported by a client component, or any `NEXT_PUBLIC_` variable. All GROQ fetches are in Server Components where this variable is inaccessible to the browser bundle.

**Add to `.env.example`** (already exists or create if not present):
```bash
NEXT_PUBLIC_SANITY_PROJECT_ID=your_project_id_here
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=your_api_token_here
```

---

## 3. `next.config.ts` Changes

Exact diff — add `cdn.sanity.io` to `images.remotePatterns`:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      // ADD THIS BLOCK:
      {
        protocol: 'https',
        hostname: 'cdn.sanity.io',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
```

**Note:** `transpilePackages: ['sanity']` is NOT added preemptively. If Sanity Studio fails to compile under Turbopack (`next dev --turbopack`), add it as a fallback. Document in the implementation log.

---

## 4. `middleware.ts` Change

Add `studio` to the matcher exclusion list. This prevents the Supabase session refresh from running on every Studio sub-route request — a performance improvement since Studio uses Sanity's own auth entirely.

**Exact updated file:**

```typescript
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isProtected =
    pathname.startsWith('/dashboard') || pathname.startsWith('/admin')

  if (!user && isProtected) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // CHANGED: added |studio to exclusion list
    '/((?!_next/static|_next/image|favicon.ico|api/auth/callback|studio).*)',
  ],
}
```

**Change summary:** The only modification is in the `matcher` regex — `|studio` added to the negative lookahead group.

---

## 5. Sanity Configuration Files

### 5.1 `apps/web/sanity.config.ts`

```typescript
import { defineConfig } from 'sanity'
import { structuredContent } from 'sanity/structure'   // built-in desk tool
import { visionTool } from '@sanity/vision'
import { schemaTypes } from './sanity/schemas'

export default defineConfig({
  name: 'osa-platform',
  title: 'OSA Community Platform',

  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,

  basePath: '/studio',

  plugins: [
    structuredContent(),
    visionTool(),               // GROQ playground — dev use only (included in all envs is fine)
  ],

  schema: {
    types: schemaTypes,         // All 6 content types from sanity/schemas/index.ts
  },
})
```

### 5.2 `apps/web/sanity/lib/client.ts`

```typescript
import { createClient } from 'next-sanity'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET!
const apiVersion = '2024-01-01'

// Server-side client — token included, useCdn: false for ISR freshness
export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false,   // false: always fetches from Sanity origin; ISR cache is Next.js-managed
  token: process.env.SANITY_API_TOKEN,   // server-only; undefined in browser (never NEXT_PUBLIC_)
})

// Typed fetch helper with ISR revalidation baked in
export async function sanityFetch<T>(
  query: string,
  params?: Record<string, unknown>,
  revalidate: number | false = 60
): Promise<T | null> {
  try {
    return await client.fetch<T>(query, params ?? {}, {
      next: { revalidate },
    })
  } catch (error) {
    console.error('[Sanity] fetch error:', error)
    return null
  }
}
```

### 5.3 `apps/web/sanity/lib/image.ts`

```typescript
import imageUrlBuilder from '@sanity/image-url'
import { client } from './client'
import type { SanityImageSource } from '@sanity/image-url/lib/types/types'

const builder = imageUrlBuilder(client)

export function urlFor(source: SanityImageSource) {
  return builder.image(source)
}
```

### 5.4 `apps/web/sanity/schemas/index.ts`

```typescript
import { event } from './event'
import { newsPost } from './news-post'
import { announcement } from './announcement'
import { leadershipProgram } from './leadership-program'
import { staticPage } from './static-page'
import { mediaGallery } from './media-gallery'

export const schemaTypes = [
  event,
  newsPost,
  announcement,
  leadershipProgram,
  staticPage,
  mediaGallery,
]
```

---

## 6. Sanity Schema Definitions

### 6.1 `apps/web/sanity/schemas/event.ts`

```typescript
import { defineType, defineField } from 'sanity'

export const event = defineType({
  name: 'event',
  title: 'Event',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'start_date',
      title: 'Start Date',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'end_date',
      title: 'End Date',
      type: 'datetime',
      validation: (Rule) =>
        Rule.custom((endDate, context) => {
          const startDate = (context.document as { start_date?: string })?.start_date
          if (endDate && startDate && endDate < startDate) {
            return 'End date must be on or after start date'
          }
          return true
        }),
    }),
    defineField({
      name: 'location',
      title: 'Location',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'flyer',
      title: 'Flyer Image',
      type: 'image',
      options: { hotspot: true },
    }),
    defineField({
      name: 'registration_link',
      title: 'Registration Link',
      type: 'url',
    }),
    defineField({
      name: 'chapter',
      title: 'Chapter',
      type: 'string',
    }),
    defineField({
      name: 'is_convention',
      title: 'Is Convention',
      type: 'boolean',
      initialValue: false,
    }),
  ],
  orderings: [
    {
      title: 'Start Date, Newest First',
      name: 'startDateDesc',
      by: [{ field: 'start_date', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'title', subtitle: 'start_date', media: 'flyer' },
  },
})
```

### 6.2 `apps/web/sanity/schemas/news-post.ts`

```typescript
import { defineType, defineField } from 'sanity'

export const newsPost = defineType({
  name: 'news_post',
  title: 'News Post',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'published_at',
      title: 'Published At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'author_name',
      title: 'Author Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'cover_image',
      title: 'Cover Image',
      type: 'image',
      options: { hotspot: true },
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      of: [{ type: 'block' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'tags',
      title: 'Tags',
      type: 'array',
      of: [{ type: 'string' }],
    }),
    defineField({
      name: 'featured',
      title: 'Featured',
      type: 'boolean',
      initialValue: false,
    }),
  ],
  orderings: [
    {
      title: 'Published Date, Newest First',
      name: 'publishedAtDesc',
      by: [{ field: 'published_at', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'title', subtitle: 'published_at', media: 'cover_image' },
  },
})
```

### 6.3 `apps/web/sanity/schemas/announcement.ts`

```typescript
import { defineType, defineField } from 'sanity'

export const announcement = defineType({
  name: 'announcement',
  title: 'Announcement',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'text',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'published_at',
      title: 'Published At',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'expires_at',
      title: 'Expires At',
      type: 'datetime',
    }),
    defineField({
      name: 'audience',
      title: 'Audience',
      type: 'string',
      options: {
        list: [
          { title: 'All (Public)', value: 'all' },
          { title: 'Members Only', value: 'members' },
          { title: 'Chapter', value: 'chapter' },
        ],
        layout: 'radio',
      },
      initialValue: 'all',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'chapter',
      title: 'Chapter',
      type: 'string',
      description: 'Required when audience is set to "Chapter"',
      validation: (Rule) =>
        Rule.custom((chapter, context) => {
          const doc = context.document as { audience?: string }
          if (doc?.audience === 'chapter' && !chapter) {
            return 'Chapter is required when audience is "Chapter"'
          }
          return true
        }),
      hidden: ({ document }) => (document as { audience?: string })?.audience !== 'chapter',
    }),
    defineField({
      name: 'cta_link',
      title: 'Call-to-Action Link',
      type: 'url',
    }),
    defineField({
      name: 'cta_label',
      title: 'Call-to-Action Label',
      type: 'string',
      description: 'Required when Call-to-Action Link is set',
      validation: (Rule) =>
        Rule.custom((label, context) => {
          const doc = context.document as { cta_link?: string }
          if (doc?.cta_link && !label) {
            return 'CTA Label is required when CTA Link is set'
          }
          return true
        }),
    }),
  ],
  orderings: [
    {
      title: 'Published Date, Newest First',
      name: 'publishedAtDesc',
      by: [{ field: 'published_at', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'title', subtitle: 'audience' },
  },
})
```

### 6.4 `apps/web/sanity/schemas/leadership-program.ts`

```typescript
import { defineType, defineField } from 'sanity'

export const leadershipProgram = defineType({
  name: 'leadership_program',
  title: 'Leadership Program',
  type: 'document',
  fields: [
    defineField({
      name: 'program_name',
      title: 'Program Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'recipient_name',
      title: 'Recipient Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'year',
      title: 'Year',
      type: 'number',
      validation: (Rule) =>
        Rule.required().integer().min(1900).max(new Date().getFullYear() + 1),
    }),
    defineField({
      name: 'chapter',
      title: 'Chapter',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'photo',
      title: 'Photo',
      type: 'image',
      options: { hotspot: true },
    }),
    defineField({
      name: 'notes',
      title: 'Notes',
      type: 'text',
    }),
  ],
  orderings: [
    {
      title: 'Year, Newest First',
      name: 'yearDesc',
      by: [{ field: 'year', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'recipient_name', subtitle: 'year', media: 'photo' },
  },
})
```

### 6.5 `apps/web/sanity/schemas/static-page.ts`

```typescript
import { defineType, defineField } from 'sanity'

export const staticPage = defineType({
  name: 'static_page',
  title: 'Static Page',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'body',
      title: 'Body',
      type: 'array',
      of: [{ type: 'block' }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'section',
      title: 'Section',
      type: 'string',
      description: 'Navigation grouping (e.g. "about", "history")',
    }),
    defineField({
      name: 'sort_order',
      title: 'Sort Order',
      type: 'number',
      initialValue: 0,
    }),
    defineField({
      name: 'last_updated',
      title: 'Last Updated',
      type: 'datetime',
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'slug.current' },
  },
})
```

### 6.6 `apps/web/sanity/schemas/media-gallery.ts`

```typescript
import { defineType, defineField } from 'sanity'

export const mediaGallery = defineType({
  name: 'media_gallery',
  title: 'Media Gallery',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'event_date',
      title: 'Event Date',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'chapter',
      title: 'Chapter',
      type: 'string',
    }),
    defineField({
      name: 'photos',
      title: 'Photos',
      type: 'array',
      of: [
        {
          type: 'image',
          options: { hotspot: true },
          fields: [
            defineField({
              name: 'caption',
              title: 'Caption',
              type: 'string',
            }),
          ],
        },
      ],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
    }),
  ],
  orderings: [
    {
      title: 'Event Date, Newest First',
      name: 'eventDateDesc',
      by: [{ field: 'event_date', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'title', subtitle: 'event_date', media: 'photos.0' },
  },
})
```

---

## 7. GROQ Queries

### `apps/web/sanity/lib/queries.ts`

```typescript
import { groq } from 'next-sanity'

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export const ALL_EVENTS_QUERY = groq`
  *[_type == "event"] | order(start_date desc) {
    _id,
    title,
    "slug": slug.current,
    start_date,
    end_date,
    location,
    description,
    flyer,
    registration_link,
    chapter,
    is_convention
  }
`

export const EVENT_BY_SLUG_QUERY = groq`
  *[_type == "event" && slug.current == $slug][0] {
    _id,
    title,
    "slug": slug.current,
    start_date,
    end_date,
    location,
    description,
    flyer,
    registration_link,
    chapter,
    is_convention
  }
`

export const ALL_EVENT_SLUGS_QUERY = groq`
  *[_type == "event"] { "slug": slug.current }
`

// ---------------------------------------------------------------------------
// News Posts
// ---------------------------------------------------------------------------

export const ALL_NEWS_POSTS_QUERY = groq`
  *[_type == "news_post"] | order(published_at desc) {
    _id,
    title,
    "slug": slug.current,
    published_at,
    author_name,
    cover_image,
    tags,
    featured
  }
`

export const NEWS_POST_BY_SLUG_QUERY = groq`
  *[_type == "news_post" && slug.current == $slug][0] {
    _id,
    title,
    "slug": slug.current,
    published_at,
    author_name,
    cover_image,
    body,
    tags,
    featured
  }
`

export const ALL_NEWS_SLUGS_QUERY = groq`
  *[_type == "news_post"] { "slug": slug.current }
`

// ---------------------------------------------------------------------------
// Announcements — two variants based on session state
// ---------------------------------------------------------------------------

// Public visitors: only audience == 'all' or 'chapter' (both treated as public per Q8 decision)
// expires_at check: either no expiry set, or expiry is in the future
export const PUBLIC_ANNOUNCEMENTS_QUERY = groq`
  *[
    _type == "announcement" &&
    audience in ["all", "chapter"] &&
    (expires_at == null || expires_at > now())
  ] | order(published_at desc) {
    _id,
    title,
    body,
    published_at,
    expires_at,
    audience,
    cta_link,
    cta_label
  }
`

// Authenticated members: audience == 'all', 'chapter', or 'members'
export const MEMBER_ANNOUNCEMENTS_QUERY = groq`
  *[
    _type == "announcement" &&
    audience in ["all", "members", "chapter"] &&
    (expires_at == null || expires_at > now())
  ] | order(published_at desc) {
    _id,
    title,
    body,
    published_at,
    expires_at,
    audience,
    cta_link,
    cta_label
  }
`

// Latest N announcements for homepage widget — same two variants
// Use GROQ slice [0...$limit] at call site, e.g. append [0...5] to the query string,
// or pass a $limit param and use [0...$limit] in the query.
export const PUBLIC_ANNOUNCEMENTS_LATEST_QUERY = groq`
  *[
    _type == "announcement" &&
    audience in ["all", "chapter"] &&
    (expires_at == null || expires_at > now())
  ] | order(published_at desc) [0...$limit] {
    _id,
    title,
    body,
    published_at,
    expires_at,
    audience,
    cta_link,
    cta_label
  }
`

export const MEMBER_ANNOUNCEMENTS_LATEST_QUERY = groq`
  *[
    _type == "announcement" &&
    audience in ["all", "members", "chapter"] &&
    (expires_at == null || expires_at > now())
  ] | order(published_at desc) [0...$limit] {
    _id,
    title,
    body,
    published_at,
    expires_at,
    audience,
    cta_link,
    cta_label
  }
`

// ---------------------------------------------------------------------------
// About (Static Page — slug-based lookup, Q3 resolved)
// ---------------------------------------------------------------------------

export const ABOUT_PAGE_QUERY = groq`
  *[_type == "static_page" && slug.current == "about"][0] {
    _id,
    title,
    "slug": slug.current,
    body,
    section,
    last_updated
  }
`

// ---------------------------------------------------------------------------
// Gallery
// ---------------------------------------------------------------------------

export const ALL_GALLERIES_QUERY = groq`
  *[_type == "media_gallery"] | order(event_date desc) {
    _id,
    title,
    event_date,
    chapter,
    description,
    "photoCount": count(photos),
    "coverPhoto": photos[0]
  }
`

// ---------------------------------------------------------------------------
// Leadership Program
// ---------------------------------------------------------------------------

export const ALL_LEADERSHIP_QUERY = groq`
  *[_type == "leadership_program"] | order(year desc, recipient_name asc) {
    _id,
    program_name,
    recipient_name,
    year,
    chapter,
    photo,
    notes
  }
`
```

---

## 8. File Structure

Complete list of files to **create** or **modify**:

```
apps/web/
├── sanity/                            [CREATE directory]
│   ├── schemas/
│   │   ├── event.ts                   [CREATE]
│   │   ├── news-post.ts               [CREATE]
│   │   ├── announcement.ts            [CREATE]
│   │   ├── leadership-program.ts      [CREATE]
│   │   ├── static-page.ts             [CREATE]
│   │   ├── media-gallery.ts           [CREATE]
│   │   └── index.ts                   [CREATE — barrel export]
│   └── lib/
│       ├── client.ts                  [CREATE]
│       ├── queries.ts                 [CREATE]
│       └── image.ts                   [CREATE]
├── app/
│   ├── page.tsx                       [MODIFY — add announcements widget]
│   ├── events/
│   │   ├── page.tsx                   [CREATE — ISR listing]
│   │   └── [slug]/
│   │       └── page.tsx               [CREATE — ISR detail + generateStaticParams]
│   ├── news/
│   │   ├── page.tsx                   [CREATE — ISR listing]
│   │   └── [slug]/
│   │       └── page.tsx               [CREATE — ISR detail + generateStaticParams]
│   ├── about/
│   │   └── page.tsx                   [CREATE — ISR, slug='about' lookup]
│   ├── announcements/
│   │   └── page.tsx                   [CREATE — ISR listing, audience-gated]
│   ├── gallery/
│   │   └── page.tsx                   [CREATE — ISR listing]
│   ├── leadership-program/
│   │   └── page.tsx                   [CREATE — ISR listing]
│   ├── constitution/
│   │   └── page.tsx                   [CREATE — static MDX]
│   ├── bylaws/
│   │   └── page.tsx                   [CREATE — static MDX]
│   └── studio/
│       └── [[...tool]]/
│           └── page.tsx               [CREATE — 'use client', dynamic='force-dynamic']
├── content/                           [CREATE directory]
│   ├── constitution.mdx               [CREATE — placeholder]
│   └── bylaws.mdx                     [CREATE — placeholder]
├── sanity.config.ts                   [CREATE]
├── next.config.ts                     [MODIFY — add cdn.sanity.io remotePattern]
└── middleware.ts                      [MODIFY — add studio to matcher exclusion]
```

**Files NOT modified** (per spec §4.4 constraint):
- `lib/auth/with-auth.ts` — confirmed: this is for API Route Handlers only; CMS pages do not use it
- `lib/auth/roles.ts`, `lib/auth/supabase-admin.ts`
- `lib/db/prisma.ts`
- `app/api/**`
- `app/login/page.tsx`, `app/dashboard/page.tsx`

---

## 9. Page Pseudocode

### 9.1 `app/events/page.tsx` — ISR Listing

```typescript
// No 'use client' — Server Component
import { sanityFetch } from '@/sanity/lib/client'
import { ALL_EVENTS_QUERY } from '@/sanity/lib/queries'
import type { SanityEvent } from '@/types/sanity'  // define in types/sanity.ts

export const revalidate = 60

export default async function EventsPage() {
  const events = await sanityFetch<SanityEvent[]>(ALL_EVENTS_QUERY) ?? []

  return (
    <main>
      <h1>Events</h1>
      {events.length === 0 ? (
        <p>No events found.</p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event._id}>
              <a href={`/events/${event.slug}`}>{event.title}</a>
              <time>{event.start_date}</time>
              <p>{event.location}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

### 9.2 `app/events/[slug]/page.tsx` — ISR Detail

```typescript
// No 'use client' — Server Component
import { notFound } from 'next/navigation'
import { sanityFetch } from '@/sanity/lib/client'
import { EVENT_BY_SLUG_QUERY, ALL_EVENT_SLUGS_QUERY } from '@/sanity/lib/queries'
import type { SanityEvent } from '@/types/sanity'

export const revalidate = 60

export async function generateStaticParams() {
  try {
    const slugs = await sanityFetch<{ slug: string }[]>(ALL_EVENT_SLUGS_QUERY, {}, false) ?? []
    return slugs.map((s) => ({ slug: s.slug }))
  } catch {
    return []  // Graceful fallback: pages render on-demand
  }
}

export default async function EventDetailPage({ params }: { params: { slug: string } }) {
  const event = await sanityFetch<SanityEvent>(EVENT_BY_SLUG_QUERY, { slug: params.slug })

  if (!event) {
    notFound()
  }

  return (
    <main>
      <h1>{event.title}</h1>
      <time>{event.start_date}</time>
      {event.end_date && <time>{event.end_date}</time>}
      <p>{event.location}</p>
      <p>{event.description}</p>
      {event.registration_link && <a href={event.registration_link}>Register</a>}
      {event.flyer && <img src={urlFor(event.flyer).url()} alt={`${event.title} flyer`} />}
    </main>
  )
}
```

**Note on `generateStaticParams` revalidate:** Pass `false` as the third arg to `sanityFetch` to disable ISR revalidation for the slugs-only query — it's called at build time only, not during ISR.

### 9.3 `app/news/page.tsx` — ISR Listing

```typescript
export const revalidate = 60

export default async function NewsPage() {
  const posts = await sanityFetch<SanityNewsPost[]>(ALL_NEWS_POSTS_QUERY) ?? []

  return (
    <main>
      <h1>News</h1>
      {posts.length === 0 ? (
        <p>No news posts found.</p>
      ) : (
        <ul>
          {posts.map((post) => (
            <li key={post._id}>
              <a href={`/news/${post.slug}`}>{post.title}</a>
              <time>{post.published_at}</time>
              <p>{post.author_name}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

### 9.4 `app/news/[slug]/page.tsx` — ISR Detail with Portable Text

```typescript
export const revalidate = 60

export async function generateStaticParams() {
  try {
    const slugs = await sanityFetch<{ slug: string }[]>(ALL_NEWS_SLUGS_QUERY, {}, false) ?? []
    return slugs.map((s) => ({ slug: s.slug }))
  } catch {
    return []
  }
}

export default async function NewsPostPage({ params }: { params: { slug: string } }) {
  const post = await sanityFetch<SanityNewsPost>(NEWS_POST_BY_SLUG_QUERY, { slug: params.slug })

  if (!post) {
    notFound()
  }

  return (
    <main>
      <h1>{post.title}</h1>
      <time>{post.published_at}</time>
      <p>By {post.author_name}</p>
      {post.cover_image && <img src={urlFor(post.cover_image).url()} alt={post.title} />}
      <PortableText value={post.body} />  {/* from @portabletext/react */}
    </main>
  )
}
```

### 9.5 `app/about/page.tsx` — ISR Static Page

```typescript
export const revalidate = 60

export default async function AboutPage() {
  const page = await sanityFetch<SanityStaticPage>(ABOUT_PAGE_QUERY)

  if (!page) {
    return (
      <main>
        <h1>About OSA</h1>
        <p>Content coming soon.</p>
      </main>
    )
  }

  return (
    <main>
      <h1>{page.title}</h1>
      <PortableText value={page.body} />
    </main>
  )
}
```

### 9.6 `app/announcements/page.tsx` — ISR with Audience Gating

See §10 for the full audience gating pattern.

```typescript
// No 'use client' — Server Component
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { sanityFetch } from '@/sanity/lib/client'
import {
  PUBLIC_ANNOUNCEMENTS_QUERY,
  MEMBER_ANNOUNCEMENTS_QUERY,
} from '@/sanity/lib/queries'

export const revalidate = 60

export default async function AnnouncementsPage() {
  // Audience-gating: determine which query to run based on session
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  )
  const { data: { user } } = await supabase.auth.getUser()

  const query = user ? MEMBER_ANNOUNCEMENTS_QUERY : PUBLIC_ANNOUNCEMENTS_QUERY
  const announcements = await sanityFetch<SanityAnnouncement[]>(query) ?? []

  return (
    <main>
      <h1>Announcements</h1>
      {announcements.length === 0 ? (
        <p>No announcements at this time.</p>
      ) : (
        <ul>
          {announcements.map((a) => (
            <li key={a._id}>
              <h2>{a.title}</h2>
              <p>{a.body}</p>
              {a.cta_link && <a href={a.cta_link}>{a.cta_label ?? 'Learn more'}</a>}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

### 9.7 `app/gallery/page.tsx` — ISR Listing

```typescript
export const revalidate = 60

export default async function GalleryPage() {
  const galleries = await sanityFetch<SanityMediaGallery[]>(ALL_GALLERIES_QUERY) ?? []

  return (
    <main>
      <h1>Gallery</h1>
      {galleries.length === 0 ? (
        <p>No galleries found.</p>
      ) : (
        <ul>
          {galleries.map((gallery) => (
            <li key={gallery._id}>
              <h2>{gallery.title}</h2>
              <time>{gallery.event_date}</time>
              {gallery.coverPhoto && (
                <img src={urlFor(gallery.coverPhoto).width(400).url()} alt={gallery.title} />
              )}
              <p>{gallery.photoCount} photos</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

### 9.8 `app/leadership-program/page.tsx` — ISR Listing

```typescript
export const revalidate = 60

export default async function LeadershipProgramPage() {
  const records = await sanityFetch<SanityLeadershipProgram[]>(ALL_LEADERSHIP_QUERY) ?? []

  // Group by year client-side after fetch
  const byYear = records.reduce<Record<number, SanityLeadershipProgram[]>>((acc, r) => {
    ;(acc[r.year] ??= []).push(r)
    return acc
  }, {})

  const sortedYears = Object.keys(byYear).map(Number).sort((a, b) => b - a)

  return (
    <main>
      <h1>Leadership Program</h1>
      {sortedYears.length === 0 ? (
        <p>No records found.</p>
      ) : (
        sortedYears.map((year) => (
          <section key={year}>
            <h2>{year}</h2>
            <ul>
              {byYear[year].map((r) => (
                <li key={r._id}>
                  {r.recipient_name} — {r.program_name} ({r.chapter})
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  )
}
```

### 9.9 `app/constitution/page.tsx` — Static MDX

```typescript
// Static build-time page — no ISR
import { readFile } from 'fs/promises'
import path from 'path'
import { MDXRemote } from 'next-mdx-remote/rsc'

// No revalidate export needed — static by default

export default async function ConstitutionPage() {
  const filePath = path.join(process.cwd(), 'content', 'constitution.mdx')
  const source = await readFile(filePath, 'utf8')

  return (
    <main>
      <MDXRemote source={source} />
    </main>
  )
}
```

**Note:** `next-mdx-remote/rsc` provides the RSC-compatible `MDXRemote` that works directly in async Server Components without a separate `serialize` + `hydrate` step. `process.cwd()` in Next.js App Router resolves to the project root (`apps/web/`), so `path.join(process.cwd(), 'content', 'constitution.mdx')` correctly resolves to `apps/web/content/constitution.mdx`.

### 9.10 `app/bylaws/page.tsx` — Static MDX

```typescript
// Identical pattern to constitution page, different file path
import { readFile } from 'fs/promises'
import path from 'path'
import { MDXRemote } from 'next-mdx-remote/rsc'

export default async function BylawsPage() {
  const filePath = path.join(process.cwd(), 'content', 'bylaws.mdx')
  const source = await readFile(filePath, 'utf8')

  return (
    <main>
      <MDXRemote source={source} />
    </main>
  )
}
```

### 9.11 `app/studio/[[...tool]]/page.tsx` — Sanity Studio

```typescript
'use client'

// Must be force-dynamic: Studio is not statically renderable
export const dynamic = 'force-dynamic'

import { NextStudio } from 'next-sanity/studio'
import config from '@/sanity.config'

export default function StudioPage() {
  return <NextStudio config={config} />
}
```

**Important:** This file uses `'use client'` which means NO server-side data fetching here. `SANITY_API_TOKEN` is NOT imported here — Studio uses its own auth, not this token. `NextStudio` handles all Studio routing internally; the `[[...tool]]` catch-all route passes the path to Studio.

### 9.12 `app/page.tsx` — Homepage with Announcements Widget (MODIFY)

See §10 for the full gating design. The homepage is modified to add an announcements section below the existing content, using the same audience-gating pattern as `/announcements`.

---

## 10. Announcements Audience Gating Design

### 10.1 Design Principles

1. The GROQ query is the enforcement layer — no client-side filtering.
2. Session check uses `@supabase/ssr` cookie-based client — same as `middleware.ts`, NOT `withAuth()` (which is for API Route Handlers only).
3. The server never sends member PII to Sanity. Only the query variant changes.
4. ISR caching implication: because the page content differs based on auth state, the page cannot be uniformly cached by Next.js ISR. The page renders per-request when the user is authenticated. For unauthenticated visits, ISR caching applies normally. In practice, setting `revalidate = 60` still works because Next.js caches the unauthenticated render and re-renders for authenticated sessions via cookies.

> **Caching note:** For the `/announcements` route and homepage widget, if strict per-user rendering is needed, consider `export const dynamic = 'force-dynamic'` for the announcements listing page only. The `/announcements` page has auth-conditional content and cannot be shared across authenticated/unauthenticated users by a single ISR cache entry. **Decision:** Use `dynamic = 'force-dynamic'` for `/announcements` (full listing page). For the homepage widget, use `revalidate = 60` but accept that ISR will serve the public version to all users until the next revalidation. The homepage is lower-risk since member-only announcements are typically informational (not sensitive), consistent with the risk acceptance documented in analysis §7.8.

### 10.2 Homepage Widget Pattern

**In `app/page.tsx`** (modified):

```typescript
// No 'use client' — Server Component
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { sanityFetch } from '@/sanity/lib/client'
import {
  PUBLIC_ANNOUNCEMENTS_LATEST_QUERY,
  MEMBER_ANNOUNCEMENTS_LATEST_QUERY,
} from '@/sanity/lib/queries'
import type { SanityAnnouncement } from '@/types/sanity'

const HOMEPAGE_ANNOUNCEMENT_LIMIT = 5

export const revalidate = 60

export default async function Home() {
  // 1. Check Supabase session (cookie-based, server-side only)
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},  // Read-only; we don't need to set cookies in a page component
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()

  // 2. Select query variant based on auth state
  const announcementQuery = user
    ? MEMBER_ANNOUNCEMENTS_LATEST_QUERY
    : PUBLIC_ANNOUNCEMENTS_LATEST_QUERY

  // 3. Fetch with limit param
  const announcements = await sanityFetch<SanityAnnouncement[]>(
    announcementQuery,
    { limit: HOMEPAGE_ANNOUNCEMENT_LIMIT }
  ) ?? []

  // 4. Render (no CSS — unstyled stub)
  return (
    <main>
      <h1>OSA Community Platform</h1>
      <p>The Odisha Society of the Americas</p>
      <p>Platform is under development</p>

      {/* Announcements widget */}
      {announcements.length > 0 && (
        <section>
          <h2>Announcements</h2>
          <ul>
            {announcements.map((a) => (
              <li key={a._id}>
                <h3>{a.title}</h3>
                <p>{a.body}</p>
                {a.cta_link && <a href={a.cta_link}>{a.cta_label ?? 'Learn more'}</a>}
              </li>
            ))}
          </ul>
          <a href="/announcements">View all announcements</a>
        </section>
      )}
    </main>
  )
}
```

### 10.3 `/announcements` Full Listing Pattern

```typescript
// No 'use client' — Server Component
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { sanityFetch } from '@/sanity/lib/client'
import {
  PUBLIC_ANNOUNCEMENTS_QUERY,
  MEMBER_ANNOUNCEMENTS_QUERY,
} from '@/sanity/lib/queries'

// Force dynamic because content differs per auth state (no safe shared ISR cache)
export const dynamic = 'force-dynamic'

export default async function AnnouncementsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()

  const audienceFilter = user
    ? MEMBER_ANNOUNCEMENTS_QUERY   // includes audience: 'members'
    : PUBLIC_ANNOUNCEMENTS_QUERY   // audience: 'all' or 'chapter' only

  const announcements = await sanityFetch<SanityAnnouncement[]>(audienceFilter) ?? []

  return (
    <main>
      <h1>Announcements</h1>
      {user && <p>(Showing member announcements)</p>}
      {announcements.length === 0 ? (
        <p>No announcements at this time.</p>
      ) : (
        <ul>
          {announcements.map((a) => (
            <li key={a._id}>
              <h2>{a.title}</h2>
              <p>{a.body}</p>
              {a.expires_at && <small>Expires: {a.expires_at}</small>}
              {a.cta_link && <a href={a.cta_link}>{a.cta_label ?? 'Learn more'}</a>}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

### 10.4 Auth Check Summary

```
Server Component:
  1. cookies() → get all request cookies (Next.js 15 cookies() is async)
  2. createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, { cookies }) — from @supabase/ssr
  3. supabase.auth.getUser() — validates JWT from cookies server-side; never trusts client
  4. If user exists → audienceFilter = "all", "members", "chapter"
  5. If no user  → audienceFilter = "all", "chapter" only
  6. GROQ query uses the appropriate variant
  7. No member data (email, ID) is ever sent to Sanity API
```

---

## 11. Testing Strategy

Testing is integration/render focused since these pages are Server Components with no API routes.

### 11.1 Unit Tests (Jest — existing test runner)

**`sanity/lib/client.test.ts`**
- `sanityFetch` returns `null` on network error (mock `client.fetch` to throw)
- `sanityFetch` returns `null` on Sanity API 5xx (mock 500 response)
- `sanityFetch` passes `next: { revalidate: 60 }` option to `client.fetch`

**`sanity/lib/image.test.ts`**
- `urlFor` returns a valid CDN URL string for a well-formed image reference
- `urlFor` does not throw when passed a minimal image object `{ _type: 'image', asset: { _ref: '...' } }`

### 11.2 Page-Level Integration Tests (Jest with `react` test renderer or Playwright)

Since existing test infrastructure uses Jest for unit tests and Playwright for API tests, new page tests follow the same Jest pattern.

**`app/events/page.test.tsx`**
- Mock `sanityFetch` to return an array of 2 events → page renders an `<ul>` with 2 `<li>` items
- Mock `sanityFetch` to return `null` (Sanity unreachable) → page renders "No events found." empty state
- Mock `sanityFetch` to return `[]` (empty Sanity) → page renders "No events found." empty state

**`app/news/[slug]/page.test.tsx`**
- Mock `sanityFetch` to return a news post → page renders the title and author
- Mock `sanityFetch` to return `null` → `notFound()` is called (Next.js 404)

**`app/about/page.test.tsx`**
- Mock `sanityFetch` to return a static page → page renders the title
- Mock `sanityFetch` to return `null` → page renders "Content coming soon." fallback (not a 404)

**`app/announcements/page.test.tsx`**
- Mock Supabase `auth.getUser()` to return `null` → only public announcements GROQ query is called
- Mock Supabase `auth.getUser()` to return a user → member announcements GROQ query is called
- Verify audience filter: a `members`-only announcement is NOT in the result set for the public query mock
- Verify audience filter: a `members`-only announcement IS in the result set for the member query mock

**`app/constitution/page.test.tsx`**
- Mock `fs/promises.readFile` to return a string `"# Test"` → page renders an `<h1>Test</h1>`
- Verify `readFile` is called with path ending in `content/constitution.mdx`

**`app/bylaws/page.test.tsx`**
- Same pattern as constitution; path ends in `content/bylaws.mdx`

**`app/studio/[[...tool]]/page.test.tsx`**
- Mock `next-sanity/studio` `NextStudio` component → page renders without error
- Verify `dynamic = 'force-dynamic'` is exported

### 11.3 ISR / Revalidation Behavior (Acceptance Test — Manual)

These cannot be automated with Jest; they are manual verification steps for Phase 4:

1. **Events ISR:** Publish a new event in Studio → wait up to 60 seconds → `GET /events` returns the new event without redeployment.
2. **Expired announcement filter:** Create an announcement with `expires_at` in the past → `GET /` does not show it.
3. **Audience gating:** Create a `members`-only announcement → unauthenticated `GET /announcements` does not show it → authenticated `GET /announcements` shows it.
4. **Sanity unreachable:** With Sanity credentials invalid → `GET /events` renders the empty state, no 500 error.

### 11.4 `generateStaticParams` Behavior

**`app/events/[slug]/page.test.tsx`**
- Mock `sanityFetch` to return a list of slugs → `generateStaticParams` returns the mapped array
- Mock `sanityFetch` to throw → `generateStaticParams` returns `[]` (no build failure)

### 11.5 CORS Setup (Pre-implementation Manual Step)

Before Playwright API tests can reach Studio, the Sanity project must have CORS origins configured:
- Add `http://localhost:3000` at `sanity.io/manage → project → API → CORS origins`
- Add production URL after deployment

This is a one-time prerequisite documented for the implementer.

---

## Appendix: TypeScript Types

The implementer should create `apps/web/types/sanity.ts` with interfaces matching all GROQ query projections. Example:

```typescript
export interface SanityEvent {
  _id: string
  title: string
  slug: string
  start_date: string
  end_date?: string
  location: string
  description: string
  flyer?: SanityImage
  registration_link?: string
  chapter?: string
  is_convention: boolean
}

export interface SanityNewsPost {
  _id: string
  title: string
  slug: string
  published_at: string
  author_name: string
  cover_image?: SanityImage
  body?: PortableTextBlock[]
  tags?: string[]
  featured: boolean
}

export interface SanityAnnouncement {
  _id: string
  title: string
  body: string
  published_at: string
  expires_at?: string
  audience: 'all' | 'members' | 'chapter'
  cta_link?: string
  cta_label?: string
}

export interface SanityStaticPage {
  _id: string
  title: string
  slug: string
  body: PortableTextBlock[]
  section?: string
  last_updated?: string
}

export interface SanityLeadershipProgram {
  _id: string
  program_name: string
  recipient_name: string
  year: number
  chapter: string
  photo?: SanityImage
  notes?: string
}

export interface SanityMediaGallery {
  _id: string
  title: string
  event_date: string
  chapter?: string
  description?: string
  photoCount: number
  coverPhoto?: SanityImage
}

// Shared
export interface SanityImage {
  _type: 'image'
  asset: { _ref: string; _type: 'reference' }
  hotspot?: { x: number; y: number; height: number; width: number }
}

export type PortableTextBlock = {
  _type: 'block'
  // ... full PortableText block shape from @portabletext/types
}
```

---

## Appendix: MDX Placeholder Content

**`apps/web/content/constitution.mdx`**
```mdx
# OSA Constitution

*Placeholder — full document to be provided by OSA leadership.*

This page will contain the official Constitution of the Odisha Society of the Americas.
```

**`apps/web/content/bylaws.mdx`**
```mdx
# OSA Bylaws

*Placeholder — full document to be provided by OSA leadership.*

This page will contain the official Bylaws of the Odisha Society of the Americas.
```
