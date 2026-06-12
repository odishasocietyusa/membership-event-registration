# SPEC-30 — Phase 2: Design

**Architect:** Claude Code
**Date:** 2026-06-12
**Status:** Complete — Awaiting human approval before Phase 3

---

## 1. Schema Design — `past_convention`

**File:** `apps/web/sanity/schemas/past-convention.ts`

```typescript
import { defineType, defineField } from 'sanity'

export const pastConvention = defineType({
  name: 'past_convention',
  title: 'Past Convention',
  type: 'document',
  fields: [
    // ── Identity ────────────────────────────────────────────────────────────
    defineField({
      name: 'year',
      title: 'Year',
      type: 'number',
      validation: (Rule) => Rule.required().integer().min(1900).max(2100),
    }),
    defineField({
      name: 'convention_number',
      title: 'Convention Number',
      type: 'string',
      description: 'e.g. "56th"',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'city',
      title: 'City',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'state',
      title: 'State',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    // ── Optional header fields ───────────────────────────────────────────────
    defineField({
      name: 'dates_text',
      title: 'Convention Dates',
      type: 'string',
      description: 'Free-form, e.g. "July 4–6, 2025"',
    }),
    defineField({
      name: 'venue_name',
      title: 'Venue Name',
      type: 'string',
    }),
    defineField({
      name: 'theme',
      title: 'Convention Theme / Motto',
      type: 'string',
    }),
    defineField({
      name: 'host_chapter',
      title: 'Host Chapter or Region',
      type: 'string',
    }),
    // ── Content sections ─────────────────────────────────────────────────────
    defineField({
      name: 'overview',
      title: 'Overview',
      type: 'array',
      of: [{ type: 'block' }],
    }),
    defineField({
      name: 'core_team',
      title: 'Convention Core Team',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'name', title: 'Name', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({ name: 'role', title: 'Role', type: 'string', validation: (Rule) => Rule.required() }),
          ],
          preview: { select: { title: 'role', subtitle: 'name' } },
        },
      ],
    }),
    defineField({
      name: 'convention_guests',
      title: 'Convention Guests',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'name', title: 'Name', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({ name: 'role', title: 'Role', type: 'string', validation: (Rule) => Rule.required() }),
          ],
          preview: { select: { title: 'role', subtitle: 'name' } },
        },
      ],
    }),
    defineField({
      name: 'donors',
      title: 'Convention Donors',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'tier_name', title: 'Tier Name', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({
              name: 'entries',
              title: 'Donors',
              type: 'array',
              of: [
                {
                  type: 'object',
                  fields: [
                    defineField({ name: 'name', title: 'Donor Name', type: 'string', validation: (Rule) => Rule.required() }),
                    defineField({ name: 'organization', title: 'Organization', type: 'string' }),
                  ],
                  preview: { select: { title: 'name', subtitle: 'organization' } },
                },
              ],
            }),
          ],
          preview: { select: { title: 'tier_name' } },
        },
      ],
    }),
    defineField({
      name: 'award_winners',
      title: 'Convention Award Winners',
      type: 'array',
      of: [
        {
          type: 'object',
          fields: [
            defineField({ name: 'award_name', title: 'Award Name', type: 'string', validation: (Rule) => Rule.required() }),
            defineField({ name: 'recipient_name', title: 'Recipient Name', type: 'string', validation: (Rule) => Rule.required() }),
          ],
          preview: { select: { title: 'award_name', subtitle: 'recipient_name' } },
        },
      ],
    }),
    // ── Media ────────────────────────────────────────────────────────────────
    defineField({
      name: 'youtube_link',
      title: 'YouTube Video Link',
      type: 'url',
    }),
    defineField({
      name: 'photo_album_link',
      title: 'Photo Album Link',
      type: 'url',
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
    select: { title: 'convention_number', subtitle: 'year' },
    prepare({ title, subtitle }) {
      return { title: `${title} Annual Convention`, subtitle: String(subtitle) }
    },
  },
})
```

---

## 2. TypeScript Interfaces

**File:** `apps/web/types/sanity.ts` — append these interfaces

```typescript
export interface SanityPastConvention {
  _id: string
  year: number
  convention_number: string   // e.g. "56th"
  city: string
  state: string
  dates_text?: string
  venue_name?: string
  theme?: string
  host_chapter?: string
  overview?: PortableTextBlock[]
  core_team?: Array<{ name: string; role: string }>
  convention_guests?: Array<{ name: string; role: string }>
  donors?: Array<{
    tier_name: string
    entries: Array<{ name: string; organization?: string }>
  }>
  award_winners?: Array<{ award_name: string; recipient_name: string }>
  youtube_link?: string
  photo_album_link?: string
}

export interface SanityConventionYear {
  year: number
}
```

---

## 3. GROQ Queries

**File:** `apps/web/sanity/lib/queries.ts` — append these exports

```typescript
// ---------------------------------------------------------------------------
// Past Conventions
// ---------------------------------------------------------------------------

export const PAST_CONVENTION_BY_YEAR_QUERY = groq`
  *[_type == "past_convention" && year == $year][0] {
    _id,
    year,
    convention_number,
    city,
    state,
    dates_text,
    venue_name,
    theme,
    host_chapter,
    overview,
    core_team,
    convention_guests,
    donors,
    award_winners,
    youtube_link,
    photo_album_link
  }
`

export const ALL_CONVENTION_YEARS_QUERY = groq`
  *[_type == "past_convention"] | order(year desc) {
    year
  }
`
```

`ALL_CONVENTION_YEARS_QUERY` returns minimal `{ year }` objects — used by both the redirect page and the year-selector dropdown.

---

## 4. Route Structure

```
apps/web/app/activities/convention/
├── page.tsx                          ← EXISTING — Annual Convention (no change)
└── past/
    ├── page.tsx                      ← NEW: redirect to most recent year
    └── [year]/
        ├── page.tsx                  ← NEW: full convention year page (RSC)
        └── YearSelector.tsx          ← NEW: client component dropdown
```

---

## 5. Page Designs

### 5.1 `/activities/convention/past/page.tsx`

```typescript
import { redirect } from 'next/navigation'
import { sanityFetch } from '@/sanity/lib/client'
import { ALL_CONVENTION_YEARS_QUERY } from '@/sanity/lib/queries'
import type { SanityConventionYear } from '@/types/sanity'

export const revalidate = 60

export default async function PastConventionsIndexPage() {
  const years = (await sanityFetch<SanityConventionYear[]>(ALL_CONVENTION_YEARS_QUERY)) ?? []
  if (years.length === 0) {
    return <main><h1>Past Conventions</h1><p>No past conventions have been published yet.</p></main>
  }
  redirect(`/activities/convention/past/${years[0].year}`)
}
```

### 5.2 `/activities/convention/past/[year]/page.tsx`

```typescript
import { sanityFetch } from '@/sanity/lib/client'
import { PAST_CONVENTION_BY_YEAR_QUERY, ALL_CONVENTION_YEARS_QUERY } from '@/sanity/lib/queries'
import { PortableText } from '@portabletext/react'
import type { SanityPastConvention, SanityConventionYear } from '@/types/sanity'
import YearSelector from './YearSelector'

export const revalidate = 60

export default async function PastConventionYearPage({
  params,
}: {
  params: Promise<{ year: string }>
}) {
  const { year: yearParam } = await params
  const year = parseInt(yearParam, 10)

  const [convention, years] = await Promise.all([
    isNaN(year) ? null : sanityFetch<SanityPastConvention>(PAST_CONVENTION_BY_YEAR_QUERY, { year }),
    sanityFetch<SanityConventionYear[]>(ALL_CONVENTION_YEARS_QUERY),
  ])

  const allYears = years ?? []

  return (
    <main>
      <YearSelector years={allYears} currentYear={isNaN(year) ? null : year} />

      {!convention ? (
        <p>No convention record for {isNaN(year) ? yearParam : year}.</p>
      ) : (
        <>
          <h1>
            OSA {convention.convention_number} Annual Convention {convention.year} at {convention.city}, {convention.state}
          </h1>
          {convention.dates_text  && <p>{convention.dates_text}</p>}
          {convention.venue_name  && <p>{convention.venue_name}</p>}
          {convention.theme       && <p>Theme: {convention.theme}</p>}
          {convention.host_chapter && <p>Hosted by: {convention.host_chapter}</p>}

          {convention.overview && convention.overview.length > 0 && (
            <section>
              <h2>Overview</h2>
              <PortableText value={convention.overview} />
            </section>
          )}

          {convention.core_team && convention.core_team.length > 0 && (
            <section>
              <h2>Convention Core Team</h2>
              <ul>
                {convention.core_team.map((m, i) => (
                  <li key={i}>{m.role} — {m.name}</li>
                ))}
              </ul>
            </section>
          )}

          {convention.convention_guests && convention.convention_guests.length > 0 && (
            <section>
              <h2>Convention Guests</h2>
              <ul>
                {convention.convention_guests.map((g, i) => (
                  <li key={i}>{g.role} — {g.name}</li>
                ))}
              </ul>
            </section>
          )}

          {convention.donors && convention.donors.length > 0 && (
            <section>
              <h2>Convention Donors</h2>
              {convention.donors.map((tier, i) => (
                <div key={i}>
                  <h3>{tier.tier_name}</h3>
                  {tier.entries.length > 0 && (
                    <ul>
                      {tier.entries.map((d, j) => (
                        <li key={j}>{d.name}{d.organization ? ` — ${d.organization}` : ''}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          )}

          {convention.award_winners && convention.award_winners.length > 0 && (
            <section>
              <h2>Convention Award Winners</h2>
              <ul>
                {convention.award_winners.map((w, i) => (
                  <li key={i}>{w.award_name} — {w.recipient_name}</li>
                ))}
              </ul>
            </section>
          )}

          {(convention.youtube_link || convention.photo_album_link) && (
            <section>
              <h2>Media</h2>
              {convention.youtube_link    && <a href={convention.youtube_link}    target="_blank" rel="noopener noreferrer">Watch on YouTube</a>}
              {convention.photo_album_link && <a href={convention.photo_album_link} target="_blank" rel="noopener noreferrer">View Photo Album</a>}
            </section>
          )}
        </>
      )}
    </main>
  )
}
```

**Note on media links:** The spec requires external links (YouTube, photo album) rendered as clickable buttons. These are external URLs — `<a href target="_blank">` is correct here; the ESLint rule only flags internal page navigation, not external links.

### 5.3 `/activities/convention/past/[year]/YearSelector.tsx`

```typescript
'use client'

import { useRouter } from 'next/navigation'
import type { SanityConventionYear } from '@/types/sanity'

export default function YearSelector({
  years,
  currentYear,
}: {
  years: SanityConventionYear[]
  currentYear: number | null
}) {
  const router = useRouter()

  if (years.length === 0) return null

  return (
    <select
      value={currentYear ?? ''}
      onChange={(e) => router.push(`/activities/convention/past/${e.target.value}`)}
    >
      {years.map(({ year }) => (
        <option key={year} value={year}>{year}</option>
      ))}
    </select>
  )
}
```

---

## 6. Navigation Change

**File:** `apps/web/app/components/nav-bar.tsx`

Under the Events `<details>` block, add one line after the Annual Convention link:

```diff
  <li><Link href="/activities/convention">Annual Convention</Link></li>
+ <li><Link href="/activities/convention/past">Past Conventions</Link></li>
  <li><Link href="/activities/awards">Awards</Link></li>
```

---

## 7. Schema Registry Change

**File:** `apps/web/sanity/schemas/index.ts`

```diff
  import { event } from './event'
  import { newsPost } from './news-post'
  import { announcement } from './announcement'
  import { leadershipProgram } from './leadership-program'
  import { staticPage } from './static-page'
  import { mediaGallery } from './media-gallery'
  import { obituary } from './obituary'
+ import { pastConvention } from './past-convention'

  export const schemaTypes = [
    event,
    newsPost,
    announcement,
    leadershipProgram,
    staticPage,
    mediaGallery,
    obituary,
+   pastConvention,
  ]
```

---

## 8. Implementation Sequence

1. `past-convention.ts` schema + `index.ts` registration — Sanity Studio gets the new document type
2. `types/sanity.ts` — add interfaces
3. `queries.ts` — add two GROQ queries
4. `app/activities/convention/past/page.tsx` — redirect/empty page
5. `app/activities/convention/past/[year]/YearSelector.tsx` — client component
6. `app/activities/convention/past/[year]/page.tsx` — main page
7. `nav-bar.tsx` — add nav link

---

## 9. Test Cases (for Phase 4)

| ID | Scenario | Expected |
|----|----------|----------|
| TC-01 | GET `/activities/convention/past` with published conventions | 307 redirect to most recent year URL |
| TC-02 | GET `/activities/convention/past` with no published conventions | Shows "No past conventions published yet" — no crash |
| TC-03 | GET `/activities/convention/past/2025` with a matching document | Full page renders with all non-empty sections |
| TC-04 | GET `/activities/convention/past/2025` with no matching document | Shows "No convention record for 2025" — no crash |
| TC-05 | GET `/activities/convention/past/abc` (non-numeric year) | Shows "No convention record for abc" — no crash |
| TC-06 | Convention with no `core_team` array | Core Team section is not rendered |
| TC-07 | Convention with no `overview` | Overview section is not rendered |
| TC-08 | Year-selector renders all years; selecting a different year navigates | Correct URL pushed via `router.push` |
| TC-09 | "Past Conventions" appears in Events nav | Link present at `/activities/convention/past` |
| TC-10 | Page is accessible without auth | No redirect to `/login` |
