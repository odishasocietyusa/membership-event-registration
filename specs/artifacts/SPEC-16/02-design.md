# Phase 2 Design — SPEC-16: Member Search

> **Spec:** `specs/active/SPEC-16-member-search.md`
> **Status:** Complete
> **Date:** 2026-05-17
> **Depends on:** `01-analysis.md`

---

## 1. Architecture Overview

```
Browser
  │
  ├─ GET /members/search
  │     └─ page.tsx (Server Component)
  │           ├─ Auth guard: redirect('/login') if no session
  │           ├─ Active-status guard: show 403 message if memberStatus ≠ 'active'
  │           └─ Render <MemberSearchClient /> (Client Component)
  │
  └─ GET /api/members/search?firstName=...&page=1
        └─ route.ts
              ├─ withAuth → 401 if no/invalid token
              ├─ Active-status check → 403 if caller not active
              ├─ MemberSearchQuerySchema.parse → 400 if invalid
              └─ searchMembers() → JSON response
```

**Key structural decision:** The page is split into a thin Server Component (handles auth guards, server-side rendering of the page shell) and a Client Component (handles all interactivity — country/state dropdown swap, form state, API calls, pagination). This follows the existing pattern used by `registration-prompt.tsx` and the admin pages.

---

## 2. Data Flow

```
MemberSearchClient
  │  onChange(country) → swap state list, reset state value
  │  onSubmit → validate form → build URLSearchParams
  │
  ├─ fetch('/api/members/search?' + params, { Authorization: Bearer <token> })
  │
  └─ /api/members/search
        ├─ withAuth (validate JWT, JIT sync)
        ├─ check user.memberStatus === 'active'
        ├─ MemberSearchQuerySchema.safeParse(queryParams)
        └─ searchMembers(input)
              ├─ Build Prisma WHERE (AND array)
              ├─ Promise.all([count capped at 1000, findMany])
              ├─ parseName(fullName) → { firstName, lastName }
              └─ Return MemberSearchResponse DTO
```

---

## 3. File Design

### 3.1 `apps/web/lib/constants/geo.ts` — **Create**

Exports typed arrays of US states and Canadian provinces. Both use **abbreviations as values** (matches most common free-text convention in existing member data) and full names as labels.

```typescript
export interface GeoOption {
  label: string
  value: string
}

export const US_STATES: GeoOption[] = [
  { label: 'Alabama', value: 'AL' },
  { label: 'Alaska', value: 'AK' },
  { label: 'Arizona', value: 'AZ' },
  { label: 'Arkansas', value: 'AR' },
  { label: 'California', value: 'CA' },
  { label: 'Colorado', value: 'CO' },
  { label: 'Connecticut', value: 'CT' },
  { label: 'Delaware', value: 'DE' },
  { label: 'Florida', value: 'FL' },
  { label: 'Georgia', value: 'GA' },
  { label: 'Hawaii', value: 'HI' },
  { label: 'Idaho', value: 'ID' },
  { label: 'Illinois', value: 'IL' },
  { label: 'Indiana', value: 'IN' },
  { label: 'Iowa', value: 'IA' },
  { label: 'Kansas', value: 'KS' },
  { label: 'Kentucky', value: 'KY' },
  { label: 'Louisiana', value: 'LA' },
  { label: 'Maine', value: 'ME' },
  { label: 'Maryland', value: 'MD' },
  { label: 'Massachusetts', value: 'MA' },
  { label: 'Michigan', value: 'MI' },
  { label: 'Minnesota', value: 'MN' },
  { label: 'Mississippi', value: 'MS' },
  { label: 'Missouri', value: 'MO' },
  { label: 'Montana', value: 'MT' },
  { label: 'Nebraska', value: 'NE' },
  { label: 'Nevada', value: 'NV' },
  { label: 'New Hampshire', value: 'NH' },
  { label: 'New Jersey', value: 'NJ' },
  { label: 'New Mexico', value: 'NM' },
  { label: 'New York', value: 'NY' },
  { label: 'North Carolina', value: 'NC' },
  { label: 'North Dakota', value: 'ND' },
  { label: 'Ohio', value: 'OH' },
  { label: 'Oklahoma', value: 'OK' },
  { label: 'Oregon', value: 'OR' },
  { label: 'Pennsylvania', value: 'PA' },
  { label: 'Rhode Island', value: 'RI' },
  { label: 'South Carolina', value: 'SC' },
  { label: 'South Dakota', value: 'SD' },
  { label: 'Tennessee', value: 'TN' },
  { label: 'Texas', value: 'TX' },
  { label: 'Utah', value: 'UT' },
  { label: 'Vermont', value: 'VT' },
  { label: 'Virginia', value: 'VA' },
  { label: 'Washington', value: 'WA' },
  { label: 'West Virginia', value: 'WV' },
  { label: 'Wisconsin', value: 'WI' },
  { label: 'Wyoming', value: 'WY' },
]

export const CA_PROVINCES: GeoOption[] = [
  { label: 'Alberta', value: 'AB' },
  { label: 'British Columbia', value: 'BC' },
  { label: 'Manitoba', value: 'MB' },
  { label: 'New Brunswick', value: 'NB' },
  { label: 'Newfoundland and Labrador', value: 'NL' },
  { label: 'Northwest Territories', value: 'NT' },
  { label: 'Nova Scotia', value: 'NS' },
  { label: 'Nunavut', value: 'NU' },
  { label: 'Ontario', value: 'ON' },
  { label: 'Prince Edward Island', value: 'PE' },
  { label: 'Quebec', value: 'QC' },
  { label: 'Saskatchewan', value: 'SK' },
  { label: 'Yukon', value: 'YT' },
]
```

---

### 3.2 `apps/web/lib/validation/member.schema.ts` — **Modify** (append)

Add three new exports after the existing schemas. Do not touch existing exports.

```typescript
// ── Member search query (GET /api/members/search) ─────────────────────────────

export const MemberSearchQuerySchema = z.object({
  firstName: z.string().min(3, 'Minimum 3 characters').max(100).optional(),
  lastName:  z.string().min(3, 'Minimum 3 characters').max(100).optional(),
  city:      z.string().min(3, 'Minimum 3 characters').max(100).optional(),
  state:     z.string().max(10).optional(),
  country:   z.enum(['USA', 'Canada']).optional(),
  page:      z.coerce.number().int().min(1).default(1),
}).refine(
  ({ firstName, lastName, city, state }) =>
    !!(firstName || lastName || city || state),
  { message: 'At least one of first name, last name, city, or state must be provided' }
)
export type MemberSearchQuery = z.infer<typeof MemberSearchQuerySchema>

// ── Member search result DTO ──────────────────────────────────────────────────

export const MemberSearchResultSchema = z.object({
  memberId:       z.string(),
  firstName:      z.string().nullable(),
  lastName:       z.string().nullable(),
  city:           z.string().nullable(),
  state:          z.string().nullable(),
  memberSince:    z.string().nullable(),  // ISO date string YYYY-MM-DD
  membershipType: z.string().nullable(),
  memberStatus:   z.string().nullable(),
})
export type MemberSearchResult = z.infer<typeof MemberSearchResultSchema>

// ── Member search response ────────────────────────────────────────────────────

export const MemberSearchResponseSchema = z.object({
  results:   z.array(MemberSearchResultSchema),
  total:     z.number(),     // capped at 1 000
  page:      z.number(),
  pageSize:  z.number(),     // always 100
  truncated: z.boolean(),    // true when raw DB count > 1 000
})
export type MemberSearchResponse = z.infer<typeof MemberSearchResponseSchema>
```

---

### 3.3 `apps/web/lib/members/member-service.ts` — **Modify** (append)

Add `searchMembers()` and its helper `parseName()` after the existing exports.

```typescript
// ── Member search ─────────────────────────────────────────────────────────────

const SEARCH_PAGE_SIZE = 100
const SEARCH_RESULT_CAP = 1000

export interface MemberSearchInput {
  firstName?: string
  lastName?:  string
  city?:      string
  state?:     string
  country?:   string
  page:       number
}

// Splits "Utkal Nayak" → { firstName: 'Utkal', lastName: 'Nayak' }
// "Ravi Shankar Prasad" → { firstName: 'Ravi Shankar', lastName: 'Prasad' }
// Single word or null → lastName is null
function parseName(fullName: string | null): { firstName: string | null; lastName: string | null } {
  if (!fullName?.trim()) return { firstName: null, lastName: null }
  const parts = fullName.trim().split(/\s+/)
  if (parts.length === 1) return { firstName: parts[0], lastName: null }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName:  parts[parts.length - 1],
  }
}

export async function searchMembers(input: MemberSearchInput): Promise<MemberSearchResponse> {
  const { firstName, lastName, city, state, country, page } = input
  const skip = (page - 1) * SEARCH_PAGE_SIZE

  // Guard: if skip would exceed cap, return empty immediately
  if (skip >= SEARCH_RESULT_CAP) {
    return { results: [], total: SEARCH_RESULT_CAP, page, pageSize: SEARCH_PAGE_SIZE, truncated: true }
  }

  const AND: Prisma.MemberWhereInput[] = [
    { deletedAt: null },
    ...(firstName ? [{ fullName: { contains: firstName, mode: 'insensitive' as const } }] : []),
    ...(lastName  ? [{ fullName: { contains: lastName,  mode: 'insensitive' as const } }] : []),
    ...(city    ? [{ address: { path: ['city'],    string_contains: city,    mode: 'insensitive' as const } }] : []),
    ...(state   ? [{ address: { path: ['state'],   string_contains: state,   mode: 'insensitive' as const } }] : []),
    ...(country ? [{ address: { path: ['country'], string_contains: country, mode: 'insensitive' as const } }] : []),
  ]

  const take = Math.min(SEARCH_PAGE_SIZE, SEARCH_RESULT_CAP - skip)

  const [rawCount, rows] = await Promise.all([
    prisma.member.count({ where: { AND } }),
    prisma.member.findMany({
      where:   { AND },
      select: {
        id:             true,
        fullName:       true,
        address:        true,
        joinDate:       true,
        membershipType: true,
        memberStatus:   true,
      },
      orderBy: [{ fullName: 'asc' }],
      skip,
      take,
    }),
  ])

  const truncated = rawCount > SEARCH_RESULT_CAP
  const total     = Math.min(rawCount, SEARCH_RESULT_CAP)

  const results: MemberSearchResult[] = rows.map((row) => {
    const addr = row.address as Record<string, string> | null
    const { firstName: fn, lastName: ln } = parseName(row.fullName)
    return {
      memberId:       row.id,
      firstName:      fn,
      lastName:       ln,
      city:           addr?.city   ?? null,
      state:          addr?.state  ?? null,
      memberSince:    row.joinDate ? row.joinDate.toISOString().slice(0, 10) : null,
      membershipType: row.membershipType ?? null,
      memberStatus:   row.memberStatus   ?? null,
    }
  })

  return { results, total, page, pageSize: SEARCH_PAGE_SIZE, truncated }
}
```

**Note on ordering:** Prisma `orderBy: [{ fullName: 'asc' }]` sorts by the full `fullName` string. This gives last-name-ish ordering for most "FirstName LastName" entries (e.g., "Arun Kumar" before "Bimal Das") which is good enough without a separate lastName column.

**Import needed at top of file:** Add `import type { MemberSearchResult, MemberSearchResponse } from '@/lib/validation/member.schema'` and `import { Prisma } from '@prisma/client'`.

---

### 3.4 `apps/web/app/api/members/search/route.ts` — **Create**

```typescript
import { withAuth } from '@/lib/auth/with-auth'
import { searchMembers } from '@/lib/members/member-service'
import { MemberSearchQuerySchema } from '@/lib/validation/member.schema'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET = withAuth(async (req, { user }) => {
  if (user.memberStatus !== 'active') {
    return jsonResponse(403, { error: 'Member search is available to active members only.' })
  }

  const url    = new URL(req.url)
  const params = Object.fromEntries(url.searchParams)
  const parsed = MemberSearchQuerySchema.safeParse(params)

  if (!parsed.success) {
    return jsonResponse(400, { error: parsed.error.flatten() })
  }

  const result = await searchMembers(parsed.data)
  return jsonResponse(200, result)
})
```

---

### 3.5 `apps/web/app/members/search/page.tsx` — **Replace**

Server Component. Handles auth + active-status guard, then delegates all interactivity to the Client Component.

```typescript
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/auth/supabase-server'
import MemberSearchClient from './MemberSearchClient'

export const dynamic = 'force-dynamic'

export default async function MemberSearchPage() {
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const res  = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: 'no-store',
  })
  const { user } = await res.json()

  if (user?.memberStatus !== 'active') {
    return (
      <main>
        <h1>Member Search</h1>
        <p>
          Member search is available to active members only.{' '}
          <a href="/membership">View membership options</a>
        </p>
      </main>
    )
  }

  return (
    <main>
      <h1>Member Search</h1>
      <MemberSearchClient />
    </main>
  )
}
```

---

### 3.6 `apps/web/app/members/search/MemberSearchClient.tsx` — **Create**

Client Component. Owns all interactive state.

```typescript
'use client'

import { useState } from 'react'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'
import { US_STATES, CA_PROVINCES } from '@/lib/constants/geo'
import type { MemberSearchResult, MemberSearchResponse } from '@/lib/validation/member.schema'

// ── Label helpers ─────────────────────────────────────────────────────────────

const MEMBERSHIP_TYPE_LABELS: Record<string, string> = {
  annualStudentNoVote: 'Annual Student',
  annualSingle:        'Annual Single',
  annualFamily:        'Annual Family',
  fiveYearFamily:      'Five-Year Family',
  life:                'Life',
  lifeWard:            'Life (Ward)',
  patron:              'Patron',
  benefactor:          'Benefactor',
  honoraryNoVote:      'Honorary',
}

const MEMBER_STATUS_LABELS: Record<string, string> = {
  active:    'Active',
  expired:   'Expired',
  suspended: 'Suspended',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MemberSearchClient() {
  // Form state
  const [firstName, setFirstName] = useState('')
  const [lastName,  setLastName]  = useState('')
  const [city,      setCity]      = useState('')
  const [country,   setCountry]   = useState<'USA' | 'Canada'>('USA')
  const [state,     setState]     = useState('')

  // Results state
  const [results,   setResults]   = useState<MemberSearchResult[]>([])
  const [total,     setTotal]     = useState(0)
  const [page,      setPage]      = useState(1)
  const [truncated, setTruncated] = useState(false)
  const [searched,  setSearched]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)

  const PAGE_SIZE = 100
  const stateOptions = country === 'Canada' ? CA_PROVINCES : US_STATES

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleCountryChange(value: 'USA' | 'Canada') {
    setCountry(value)
    setState('')  // reset state when country changes
  }

  function validate(): string | null {
    const trimmedFirst = firstName.trim()
    const trimmedLast  = lastName.trim()
    const trimmedCity  = city.trim()

    if (trimmedFirst && trimmedFirst.length < 3) return 'First name must be at least 3 characters'
    if (trimmedLast  && trimmedLast.length  < 3) return 'Last name must be at least 3 characters'
    if (trimmedCity  && trimmedCity.length  < 3) return 'City must be at least 3 characters'
    if (!trimmedFirst && !trimmedLast && !trimmedCity && !state) {
      return 'Please enter at least one search term (name, city, or state)'
    }
    return null
  }

  async function fetchPage(targetPage: number) {
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setLoading(true)
    setError(null)

    const params = new URLSearchParams({ page: String(targetPage) })
    if (firstName.trim()) params.set('firstName', firstName.trim())
    if (lastName.trim())  params.set('lastName',  lastName.trim())
    if (city.trim())      params.set('city',       city.trim())
    if (state)            params.set('state',      state)
    if (country)          params.set('country',    country)

    try {
      const supabase = createSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()

      const res = await fetch(`/api/members/search?${params}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body?.error ?? 'Search failed. Please try again.')
        return
      }

      const data: MemberSearchResponse = await res.json()
      setResults(data.results)
      setTotal(data.total)
      setPage(data.page)
      setTruncated(data.truncated)
      setSearched(true)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    fetchPage(1)
  }

  // ── Derived values ───────────────────────────────────────────────────────────

  const totalPages  = Math.ceil(total / PAGE_SIZE)
  const rangeStart  = (page - 1) * PAGE_SIZE + 1
  const rangeEnd    = Math.min(page * PAGE_SIZE, total)

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>Search Members</legend>

          <div>
            <label htmlFor="firstName">First Name</label>
            <input
              id="firstName" type="text" value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="lastName">Last Name</label>
            <input
              id="lastName" type="text" value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="city">City</label>
            <input
              id="city" type="text" value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="country">Country</label>
            <select
              id="country"
              value={country}
              onChange={(e) => handleCountryChange(e.target.value as 'USA' | 'Canada')}
            >
              <option value="USA">USA</option>
              <option value="Canada">Canada</option>
            </select>
          </div>

          <div>
            <label htmlFor="state">State / Province</label>
            <select
              id="state"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              <option value="">— Select —</option>
              {stateOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {error && <p role="alert">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </fieldset>
      </form>

      {searched && !loading && (
        <section>
          {truncated && (
            <p>Showing top 1,000 results — refine your search for more specific results.</p>
          )}

          {total > 0 && (
            <p>Showing {rangeStart}–{rangeEnd} of {total} result{total !== 1 ? 's' : ''}</p>
          )}

          {results.length === 0 ? (
            <p>No results found.</p>
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Last Name</th>
                    <th>First Name</th>
                    <th>City</th>
                    <th>State</th>
                    <th>Member Since</th>
                    <th>Membership Type</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((m) => (
                    <tr key={m.memberId}>
                      <td>{m.lastName       ?? '—'}</td>
                      <td>{m.firstName      ?? '—'}</td>
                      <td>{m.city           ?? '—'}</td>
                      <td>{m.state          ?? '—'}</td>
                      <td>{m.memberSince    ?? '—'}</td>
                      <td>{m.membershipType ? (MEMBERSHIP_TYPE_LABELS[m.membershipType] ?? m.membershipType) : '—'}</td>
                      <td>{m.memberStatus   ? (MEMBER_STATUS_LABELS[m.memberStatus]     ?? m.memberStatus)   : '—'}</td>
                      <td><a href={`/messages/new?to=${m.memberId}`}>Send Message</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {totalPages > 1 && (
                <nav aria-label="Search results pagination">
                  <button
                    onClick={() => fetchPage(page - 1)}
                    disabled={page <= 1 || loading}
                  >
                    Previous
                  </button>
                  <span>Page {page} of {totalPages}</span>
                  <button
                    onClick={() => fetchPage(page + 1)}
                    disabled={page >= totalPages || loading}
                  >
                    Next
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      )}
    </>
  )
}
```

---

## 4. Implementation Sequence

Build in this order to avoid import errors:

| Step | File | Reason |
|------|------|--------|
| 1 | `lib/constants/geo.ts` | No dependencies |
| 2 | `lib/validation/member.schema.ts` | Depends on nothing new |
| 3 | `lib/members/member-service.ts` | Depends on schema types |
| 4 | `app/api/members/search/route.ts` | Depends on service + schema |
| 5 | `app/members/search/MemberSearchClient.tsx` | Depends on geo + schema types |
| 6 | `app/members/search/page.tsx` | Depends on MemberSearchClient |

---

## 5. API Contract

### Request
```
GET /api/members/search
Authorization: Bearer <supabase-jwt>

Query params (all optional, at least one of firstName/lastName/city/state required):
  firstName  string   min 3 chars
  lastName   string   min 3 chars
  city       string   min 3 chars
  state      string   abbreviation e.g. 'GA', 'ON'
  country    string   'USA' | 'Canada'
  page       integer  default 1, min 1
```

### Response 200
```json
{
  "results": [
    {
      "memberId":       "uuid",
      "firstName":      "Utkal",
      "lastName":       "Nayak",
      "city":           "Atlanta",
      "state":          "GA",
      "memberSince":    "2022-07-04",
      "membershipType": "annualFamily",
      "memberStatus":   "active"
    }
  ],
  "total":     243,
  "page":      1,
  "pageSize":  100,
  "truncated": false
}
```

### Error responses
| Status | Condition |
|--------|-----------|
| 401 | Missing or invalid Bearer token |
| 403 | Caller's `memberStatus` ≠ `active` |
| 400 | Validation failure (min-length, no filter provided, invalid country) |

---

## 6. Design Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| Server Component wraps Client Component | Auth guard runs server-side (no flash of content); dropdown interactivity requires client |
| `fetchPage()` called for both initial search and pagination | Keeps pagination stateless — re-runs query with new page, preserves form values |
| `select` (not `findMany` with all fields) in Prisma query | Returns only the 6 fields needed for the DTO; avoids leaking `email`, `phone`, `stripeCustomerId` at the DB layer |
| `orderBy: [{ fullName: 'asc' }]` | Best available proxy for last-name sort given single-field storage |
| `truncated` flag separate from `total` | Allows UI to distinguish "exactly 1000 results" from "more than 1000 capped" |
| Validation in both client and API | Defense in depth — client validation for UX, server validation for security |
| Country alone fails refine check | `state` is not provided when only country is set; refine returns false → 400/client error |

---

## 7. Out-of-Scope Confirmations

- No changes to `apps/web/app/api/members/route.ts` (admin route unchanged)
- No changes to `apps/web/lib/auth/with-auth.ts` (active-status check is local to this feature)
- No CSS, Tailwind, or inline styles anywhere in the new files
- `memberId` appears only in the `href` of the Send Message link — never as a visible table cell
