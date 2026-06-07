# SPEC-8 — Phase 2: Design

**Spec:** Obituary Page
**Architect:** Claude Code
**Date:** 2026-06-06
**Status:** Complete — Awaiting Human Approval

---

## 0. Decisions from Phase 1 Sign-Off

| Question | Decision |
|----------|----------|
| OQ-1: Route naming | `/obituary` (singular) — existing stub replaced in-place; no redirect needed |
| OQ-2: Comment freshness | 60s ISR delay accepted; no real-time requirement |
| OQ-3: Filtering | Server-side GROQ filter via URL search params |

---

## 1. File Map

### Create (new files)

| File | Purpose |
|------|---------|
| `sanity/schemas/obituary.ts` | Sanity document type |
| `lib/obituaries/comment-service.ts` | `createComment`, `listComments`, `deleteComment` |
| `lib/validation/obituary-comment.schema.ts` | Zod schema for comment body |
| `app/obituary/[slug]/page.tsx` | ISR detail page (bio, photo, comments) |
| `app/obituary/[slug]/CommentForm.tsx` | Client component — auth-aware comment submit |
| `app/api/obituary/[slug]/comments/route.ts` | GET (public) + POST (active member) |
| `app/api/obituary/[slug]/comments/[id]/route.ts` | DELETE (admin only) |
| `app/api/obituary/[slug]/comments/route.test.ts` | Jest unit tests for GET + POST |
| `app/api/obituary/[slug]/comments/[id]/route.test.ts` | Jest unit tests for DELETE |

### Modify (existing files)

| File | Change |
|------|--------|
| `sanity/schemas/index.ts` | Add `obituary` import + export |
| `sanity/lib/queries.ts` | Add 4 GROQ queries for obituary |
| `prisma/schema.prisma` | Add `ObituaryComment` model + back-relation on `Member` |
| `types/sanity.ts` | Add `SanityObituary` and `SanityObituarySlug` interfaces |
| `app/obituary/page.tsx` | Replace stub with ISR listing page |

---

## 2. Schema Design

### 2.1 Sanity Schema — `obituary.ts`

```typescript
defineType({
  name: 'obituary',
  title: 'Obituary',
  type: 'document',
  fields: [
    defineField({ name: 'name',            type: 'string',   validation: required }),
    defineField({ name: 'slug',            type: 'slug',     options: { source: 'name' }, validation: required }),
    defineField({ name: 'date_of_passing', type: 'date',     validation: required }),
    defineField({ name: 'year',            type: 'number',   validation: required }),  // denormalized for fast GROQ filter
    defineField({ name: 'state',           type: 'string' }),                           // US state abbreviation e.g. "CA"
    defineField({ name: 'chapter',         type: 'string' }),
    defineField({ name: 'biography',       type: 'text',     validation: required }),
    defineField({ name: 'photo',           type: 'image',    options: { hotspot: true } }),
    defineField({ name: 'member_id',       type: 'string' }), // nullable Supabase member UUID
  ],
  orderings: [{ name: 'dateDesc', title: 'Date of Passing, Newest', by: [{ field: 'date_of_passing', direction: 'desc' }] }],
  preview: { select: { title: 'name', subtitle: 'year', media: 'photo' } },
})
```

### 2.2 Prisma Model — `ObituaryComment`

```prisma
model ObituaryComment {
  id           String   @id @default(uuid()) @db.Uuid
  obituarySlug String   @map("obituary_slug")
  memberId     String   @map("member_id") @db.Uuid
  body         String
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz

  member       Member   @relation(fields: [memberId], references: [id])

  @@index([obituarySlug])
  @@index([memberId])
  @@map("obituary_comments")
}
```

**Back-relation on `Member` model** (add to existing `Member` block):
```prisma
obituaryComments ObituaryComment[]
```

### 2.3 TypeScript Types — `types/sanity.ts` additions

```typescript
export interface SanityObituary {
  _id: string
  name: string
  slug: string
  date_of_passing: string
  year: number
  state?: string
  chapter?: string
  biography: string
  photo?: SanityImage
  member_id?: string
}

export interface SanityObituarySlug {
  slug: string
}
```

---

## 3. GROQ Queries — `sanity/lib/queries.ts` additions

```groq
// Listing (no biography — smaller payload)
ALL_OBITUARIES_QUERY
*[_type == "obituary"
  && ($name == "" || name match $name + "*")
  && ($state == "" || state == $state)
  && ($year == 0  || year == $year)
] | order(date_of_passing desc) {
  _id, name, "slug": slug.current, year, state, date_of_passing, photo, chapter
}

// Detail (full biography)
OBITUARY_BY_SLUG_QUERY
*[_type == "obituary" && slug.current == $slug][0] {
  _id, name, "slug": slug.current, date_of_passing, year, state, chapter, biography, photo, member_id
}

// generateStaticParams
ALL_OBITUARY_SLUGS_QUERY
*[_type == "obituary"] { "slug": slug.current }
```

---

## 4. Service Layer Interface — `lib/obituaries/comment-service.ts`

```typescript
export type CommentWithAuthor = {
  id: string
  obituarySlug: string
  memberId: string
  body: string
  createdAt: Date
  member: { fullName: string | null; email: string }
}

// Creates a comment. Caller is responsible for authorization checks.
export async function createComment(
  obituarySlug: string,
  memberId: string,
  body: string
): Promise<CommentWithAuthor>

// Lists all comments for a slug in chronological order.
export async function listComments(obituarySlug: string): Promise<CommentWithAuthor[]>

// Hard-deletes a comment by ID. Returns true if found and deleted, false if not found.
export async function deleteComment(commentId: string): Promise<boolean>
```

---

## 5. API Route Contracts

### `GET /api/obituary/[slug]/comments` — Public

- **Auth:** None required
- **Response 200:**
  ```json
  { "comments": [{ "id": "...", "body": "...", "createdAt": "...", "authorName": "..." }] }
  ```
- **Response 500:** `{ "error": "Internal server error" }`

### `POST /api/obituary/[slug]/comments` — Active Member

- **Auth:** `Authorization: Bearer <token>` → `withAuth`
- **Body:** `{ "body": string }` (1–500 chars, Zod-validated)
- **Response 201:** `{ "comment": { "id": "...", "body": "...", "createdAt": "..." } }`
- **Response 400:** Invalid/empty body or Zod parse failure
- **Response 401:** Missing/invalid token
- **Response 403:** Member status is not `active`
- **Response 404:** Sanity obituary with that slug does not exist

### `DELETE /api/obituary/[slug]/comments/[id]` — Admin

- **Auth:** `withAuth(handler, { role: 'admin' })`
- **Response 204:** Comment deleted
- **Response 401:** Missing/invalid token
- **Response 403:** Not admin
- **Response 404:** Comment not found

---

## 6. Page Architecture

### `app/obituary/page.tsx` — Listing (replaces stub)

```
Server Component | revalidate = 60
├── Reads searchParams: { name?, state?, year? }
├── sanityFetch(ALL_OBITUARIES_QUERY, { name, state, year })
├── Renders filter form (client component, URL-param driven)
└── Renders obituary card list (name, year, state, photo thumbnail)
```

Filter inputs use `<form method="GET">` — no JS required, degrades gracefully.

### `app/obituary/[slug]/page.tsx` — Detail

```
Server Component | revalidate = 60 | generateStaticParams
├── sanityFetch(OBITUARY_BY_SLUG_QUERY, { slug }) → notFound() if null
├── listComments(slug) — direct service call (inherits page revalidation)
├── Renders: name, date_of_passing, state, biography, photo
├── Renders: comments list (chronological)
└── Renders: <CommentForm slug={slug} /> (client component)
```

### `app/obituary/[slug]/CommentForm.tsx` — Client Component

```
Client Component
├── Uses createSupabaseBrowser() to get session token
├── If no session → shows "Log in to comment" message
├── If session but memberStatus != active → shows "Active membership required"
├── If active → renders textarea + submit button
│   POST /api/obituary/[slug]/comments
│   On success → router.refresh() to reload page comments
└── Shows inline success/error state
```

*Note: `memberStatus` for the CommentForm display state is read from the session — but the API enforces the authoritative server-side check regardless.*

---

## 7. RED Test Cases (write before implementation)

### `app/api/obituary/[slug]/comments/route.test.ts`

| # | Test | Expected |
|---|------|----------|
| T-01 | GET — no comments for slug | `200 { comments: [] }` |
| T-02 | GET — returns existing comments in order | `200 { comments: [oldest, newest] }` |
| T-03 | POST — missing Authorization header | `401` |
| T-04 | POST — invalid/expired token | `401` |
| T-05 | POST — member status `expired` | `403` |
| T-06 | POST — member status `suspended` | `403` |
| T-07 | POST — member status `null` (incomplete profile) | `403` |
| T-08 | POST — empty body | `400` |
| T-09 | POST — body > 500 chars | `400` |
| T-10 | POST — Sanity slug not found | `404` |
| T-11 | POST — valid active member, valid body | `201 { comment: { id, body, createdAt } }` |

### `app/api/obituary/[slug]/comments/[id]/route.test.ts`

| # | Test | Expected |
|---|------|----------|
| T-12 | DELETE — missing auth | `401` |
| T-13 | DELETE — member-role (non-admin) | `403` |
| T-14 | DELETE — admin, comment not found | `404` |
| T-15 | DELETE — admin, valid comment ID | `204` |

### `lib/obituaries/comment-service.test.ts` (optional, covered by API tests via mocking)

Service-level unit tests for `createComment`, `listComments`, `deleteComment` if logic grows complex. The API route tests mock Prisma directly and cover the same surface, so these are not strictly required by the RED phase.

---

## 8. Implementation Sequence

Execute in this order — each step is independently testable:

1. **Prisma schema** — add `ObituaryComment` + back-relation; `npx prisma db push && npx prisma generate`
2. **Sanity schema** — create `obituary.ts`, add to `index.ts`
3. **GROQ queries** — add to `sanity/lib/queries.ts`
4. **TypeScript types** — add to `types/sanity.ts`
5. **Zod schema** — `lib/validation/obituary-comment.schema.ts`
6. **Service layer** — `lib/obituaries/comment-service.ts`
7. **RED tests** — write all 15 test cases (they will fail)
8. **API routes** — implement to make T-01–T-15 pass (GREEN)
9. **Listing page** — replace `app/obituary/page.tsx` stub
10. **Detail page** — `app/obituary/[slug]/page.tsx` + `CommentForm.tsx`
11. **Full test run** — `pnpm --filter=web test` + `pnpm --filter=web lint` + `tsc --noEmit`
