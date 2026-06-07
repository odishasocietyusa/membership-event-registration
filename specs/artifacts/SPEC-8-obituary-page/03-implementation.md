# SPEC-8 — Phase 3: Implementation Log

**Spec:** Obituary Page
**Implementer:** Claude Code
**Date:** 2026-06-06
**Status:** COMPLETE — All 10 steps delivered; QA approved 2026-06-07

---

## Steps Completed

### 1. Prisma Schema
- Added `ObituaryComment` model to `apps/web/prisma/schema.prisma`
- Added `obituaryComments ObituaryComment[]` back-relation on `Member`
- `npx prisma db push` — table created in Supabase cloud DB
- `npx prisma generate` — Prisma client regenerated; `ObituaryComment` confirmed in pnpm hoisted client

### 2. Sanity Schema
- Created `apps/web/sanity/schemas/obituary.ts` — fields: name, slug, date_of_passing, year, state, chapter, biography, photo, member_id
- Added `obituary` import + export to `apps/web/sanity/schemas/index.ts`

### 3. GROQ Queries
- Added to `apps/web/sanity/lib/queries.ts`:
  - `ALL_OBITUARIES_QUERY` — listing with server-side name/state/year filter params
  - `OBITUARY_BY_SLUG_QUERY` — full detail including biography
  - `ALL_OBITUARY_SLUGS_QUERY` — for `generateStaticParams`

### 4. TypeScript Types
- Added `SanityObituary` and `SanityObituarySlug` interfaces to `apps/web/types/sanity.ts`

### 5. Zod Schema
- Created `apps/web/lib/validation/obituary-comment.schema.ts`
- `CreateCommentSchema`: body min 1, max 500 chars

### 6. Service Layer
- Created `apps/web/lib/obituaries/comment-service.ts`
- `createComment(slug, memberId, body)` — inserts with member select
- `listComments(slug)` — ordered by createdAt ASC, includes member fullName + email
- `deleteComment(id)` — returns false on P2025 (not found), throws on other errors

### 7. RED Tests Written
- `apps/web/app/api/obituary/[slug]/comments/route.test.ts` — 10 tests
- `apps/web/app/api/obituary/[slug]/comments/[id]/route.test.ts` — 3 tests
- All tests ran RED before route files existed

### 8. API Routes Implemented (GREEN)
- `apps/web/app/api/obituary/[slug]/comments/route.ts`
  - `GET`: public, calls `listComments`, returns `{ comments: [...] }` with `authorName` (fullName fallback to email prefix)
  - `POST`: `withAuth`, checks `memberStatus === 'active'` → 403, Zod validation → 400, Sanity slug check → 404, `createComment` → 201
- `apps/web/app/api/obituary/[slug]/comments/[id]/route.ts`
  - `DELETE`: `withAuth({ role: 'admin' })`, `deleteComment` → 204 or 404

---

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| `app/api/obituary/[slug]/comments/route.test.ts` | 10 | ✅ All pass |
| `app/api/obituary/[slug]/comments/[id]/route.test.ts` | 3 | ✅ All pass |
| Full suite (`pnpm test`) | 328 | ✅ All pass |
| Pre-existing failure (`auth/callback`) | 1 | ⚠️ Pre-existing, unrelated to SPEC-8 |
| ESLint | — | ✅ No warnings or errors |
| TypeScript (`tsc --noEmit`) | — | ✅ No errors |

---

## Steps Held (pending SPEC-15 completion)

### 9. Listing page — replace `app/obituary/page.tsx` stub
- SPEC-15 is actively modifying `app/obituary/page.tsx`
- Will replace stub with ISR listing page using `ALL_OBITUARIES_QUERY` + filter inputs

### 10. Detail page + CommentForm
- Create `app/obituary/[slug]/page.tsx` — ISR, `generateStaticParams`, comments via `listComments`
- Create `app/obituary/[slug]/CommentForm.tsx` — client component, `router.refresh()` on success

---

## Files Modified

| File | Action |
|------|--------|
| `apps/web/prisma/schema.prisma` | Added `ObituaryComment` model + back-relation on Member |
| `apps/web/sanity/schemas/index.ts` | Added obituary import + export |
| `apps/web/sanity/lib/queries.ts` | Added 3 GROQ queries |
| `apps/web/types/sanity.ts` | Added `SanityObituary`, `SanityObituarySlug` |
| `apps/web/sanity/schemas/obituary.ts` | Created |
| `apps/web/lib/validation/obituary-comment.schema.ts` | Created |
| `apps/web/lib/obituaries/comment-service.ts` | Created |
| `apps/web/app/api/obituary/[slug]/comments/route.ts` | Created |
| `apps/web/app/api/obituary/[slug]/comments/route.test.ts` | Created |
| `apps/web/app/api/obituary/[slug]/comments/[id]/route.ts` | Created |
| `apps/web/app/api/obituary/[slug]/comments/[id]/route.test.ts` | Created |

---

## Implementation Notes

- **Mock leak fix**: T-08/T-09 in route.test.ts initially set unnecessary `mockSanityFetch` values (tests return 400 before Sanity is reached); the leak was detected by T-10 and fixed by removing the redundant setup. `jest.clearAllMocks()` does not clear queued `mockResolvedValueOnce` values — only `jest.resetAllMocks()` does.
- **Slug mutation risk** (EC-03): `obituarySlug` stored as plain string in comments; orphaned comments if Sanity slug is edited. Documented as known risk; Sanity slugs are treated as immutable after publish.
