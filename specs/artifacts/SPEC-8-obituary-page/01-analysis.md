# SPEC-8 — Phase 1: Analysis

**Spec:** Obituary Page
**Analyst:** Claude Code
**Date:** 2026-06-06
**Status:** Complete — Awaiting Human Approval

---

## 1. Requirements Mapping

### Functional Requirements Confirmed

| ID | Requirement | Analysis Notes |
|----|-------------|----------------|
| FR-01 | Admin/author creates obituary in Sanity Studio | Follows established schema pattern (defineType/defineField); adds `obituary` schema to `sanity/schemas/index.ts` |
| FR-02 | Public listing page `/obituaries` | ISR — `revalidate = 60`; no auth required |
| FR-03 | Filter by name (text search), state, year | GROQ `match`/`==` filters; can be query-param driven on the server or client-side filter over a full fetch |
| FR-04 | Detail page `/obituaries/[slug]` | ISR — `revalidate = 60`; `generateStaticParams` pre-renders all known slugs |
| FR-05 | Bio + photo on detail page | Sanity `image` field; `urlFor()` from `@/sanity/lib/image` (already in use by news pages) |
| FR-06 | Active members can post comments | `memberStatus === 'active'` checked server-side in POST handler; `withAuth()` covers auth |
| FR-07 | Comments in chronological order | `ORDER BY created_at ASC` in Prisma query |
| FR-08 | Visitors can read but not post | GET `/api/obituaries/[slug]/comments` is public; POST is `withAuth`-protected |
| FR-09 | Expired/suspended members cannot post | Explicit `memberStatus !== 'active'` → 403 check after `withAuth` resolves |
| FR-10 | Comment max 500 chars, non-empty | Zod schema: `z.string().min(1).max(500)` |
| FR-11 | Pages update within 60s of Sanity publish | `revalidate = 60` on both listing and detail pages |
| FR-12 | Deceased optionally linked to Member record | Nullable `member_id` string field in Sanity schema; no Prisma FK needed (Sanity holds the reference) |
| FR-13 | Admin hard-delete any comment | `withAuth(handler, { role: 'admin' })` on DELETE route |

### Non-Functional Requirements Confirmed

| ID | Requirement | Analysis Notes |
|----|-------------|----------------|
| NFR-01 | Comments immutable for members after posting | No member-facing PATCH/DELETE endpoint; admin-only delete |
| NFR-02 | No Sanity token exposed to browser | `SANITY_API_TOKEN` (no `NEXT_PUBLIC_` prefix); all Sanity fetches in Server Components |
| NFR-03 | Member status validated server-side | `withAuth()` loads member; status check is explicit code in the handler, not just client-side |
| NFR-04 | Spam: `member_status = active` only | Sufficient per spec — no additional rate limiting required |

---

## 2. Edge Cases & Risks

### EC-01 — Existing `/obituary` Stub (Singular Route)
`apps/web/app/obituary/page.tsx` already exists as a placeholder that renders a Sanity `static_page` with slug `"obituary"`. SPEC-8 calls for `/obituaries` (plural). **These are two different routes.**

**Decision needed:** Should we:
- **(A) Keep `/obituary` as-is and add a new `/obituaries` directory** — two separate routes exist in parallel
- **(B) Delete the stub and redirect `/obituary` → `/obituaries`** — clean break, simpler nav

Recommendation: **Option B** — delete the stub, replace with the full implementation at `/obituaries`, add a redirect from `/obituary` to `/obituaries` in `next.config.ts` or the page itself.

### EC-02 — ISR Detail Page + Fresh Comments
The detail page has `revalidate = 60`. Comments posted will not appear until the ISR cache refreshes (up to 60 seconds). The spec does not require real-time comment display.

**Resolution:** Accept the 60s delay. This is consistent with the ISR SLA stated in FR-11.

### EC-03 — Slug Mutation Risk
`ObituaryComment.obituarySlug` stores the Sanity slug as a plain string. If an admin edits the slug in Sanity Studio, existing comments become orphaned (no FK to enforce this). **This is a known architectural risk** — Sanity slugs are intended to be immutable after publish.

**Resolution:** Document this in the implementation log; no schema change required. Sanity convention is to treat slugs as permanent once published.

### EC-04 — Admin Role Name
`withAuth(handler, { role: 'admin' })` — confirmed the `Role` enum in `lib/auth/roles.ts` includes `'admin'`. DELETE route uses this pattern consistently with other admin-only endpoints.

### EC-05 — `generateStaticParams` for SEO
The spec says obituary pages are publicly indexable. Pre-rendering at build time via `generateStaticParams` ensures Google can crawl them without JS. This follows the identical pattern in `app/news/[slug]/page.tsx`.

### EC-06 — Comment Author Name Display
Open question resolved in spec: display `member.fullName`. If `fullName` is null (edge case for incomplete profiles), fallback to member email prefix or "OSA Member".

### EC-07 — Slug Validation for Comment Routes
`POST /api/obituaries/[slug]/comments` must return 404 if the slug doesn't correspond to a real Sanity obituary. The handler should verify the Sanity document exists before inserting the comment.

---

## 3. Architecture Observations

### 3.1 What Already Exists
- `sanityFetch()` + Sanity client in `@/sanity/lib/client.ts` — ready to extend with new queries
- `urlFor()` helper in `@/sanity/lib/image.ts` — used for photo rendering
- `withAuth()` in `@/lib/auth/with-auth.ts` — handles auth + role; status check is the caller's responsibility
- `app/news/[slug]/page.tsx` — ISR + `generateStaticParams` reference implementation
- `app/api/messages/route.ts` — service-layer + Zod + `withAuth` pattern to replicate

### 3.2 What Must Be Created

| Artifact | Notes |
|----------|-------|
| `sanity/schemas/obituary.ts` | New Sanity document type |
| `sanity/schemas/index.ts` | Add `obituary` to exports |
| `sanity/lib/queries.ts` | Add 4 GROQ queries (listing, detail, all-slugs, filtered) |
| `prisma/schema.prisma` | Add `ObituaryComment` model + Member back-relation |
| `lib/obituaries/comment-service.ts` | `createComment`, `listComments`, `deleteComment` |
| `lib/validation/obituary-comment.schema.ts` | Zod schema |
| `app/obituaries/page.tsx` | ISR listing page with filters |
| `app/obituaries/[slug]/page.tsx` | ISR detail page |
| `app/obituaries/[slug]/CommentForm.tsx` | Client component — auth-aware submit form |
| `app/api/obituaries/[slug]/comments/route.ts` | GET (public), POST (active member) |
| `app/api/obituaries/[slug]/comments/[id]/route.ts` | DELETE (admin only) |

### 3.3 What Must Be Modified

| File | Change |
|------|--------|
| `app/obituary/page.tsx` | Replace with redirect to `/obituaries` |
| `prisma/schema.prisma` | Add `obituaryComments ObituaryComment[]` back-relation on `Member` |

### 3.4 What Must NOT Be Modified
Per spec: `lib/auth/with-auth.ts`, `lib/db/prisma.ts`, `sanity/lib/client.ts` — import only.

---

## 4. Filtering Strategy

For FR-03 (name/state/year filtering), two approaches exist:

| Approach | Pro | Con |
|----------|-----|-----|
| GROQ server-side filtering via query params | No over-fetching; scales well | Requires URL navigation or server action |
| Client-side filter over full dataset | Instant response; no extra requests | All obituaries loaded upfront (acceptable for a small community dataset) |

**Recommendation:** GROQ server-side filtering via `next/navigation` `useSearchParams` on the listing page — keeps the pattern consistent with the rest of the app and avoids loading potentially hundreds of records. Listing page is a Server Component; filter inputs are client components that update URL params.

---

## 5. Open Questions for Human Operator

| # | Question | Impact |
|---|----------|--------|
| OQ-1 | **Route naming**: Replace `/obituary` stub with redirect → `/obituaries`, or keep both? (Recommendation: redirect) | Affects routing and whether stub file is deleted |
| OQ-2 | **Comment freshness**: 60s ISR delay for comments is acceptable per spec — confirm no requirement for real-time display? | If real-time needed, comments must move to client-side fetching |
| OQ-3 | **Filtering UX**: Server-side GROQ filter (URL params) vs. client-side filter — confirm preference? | Affects how listing page is structured |

---

## 6. Implementation Sequencing (Proposed)

1. **Schema** — Prisma `ObituaryComment` model + `npx prisma db push` + `npx prisma generate`
2. **Sanity schema** — `obituary.ts` + add to `index.ts`
3. **GROQ queries** — extend `sanity/lib/queries.ts`
4. **Zod schema** — `lib/validation/obituary-comment.schema.ts`
5. **Service layer** — `lib/obituaries/comment-service.ts`
6. **API routes** — comments GET/POST + DELETE (with tests)
7. **Pages** — listing + detail + CommentForm client component
8. **Redirect** — replace `app/obituary/page.tsx` stub

Each step has a clear test-first target before implementation code.
