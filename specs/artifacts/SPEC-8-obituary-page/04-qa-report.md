# SPEC-8 — Phase 4: QA Report

**Spec:** Obituary Page
**QA:** Claude Code
**Date:** 2026-06-07
**Status:** APPROVED

---

## Test Suite Results

| Suite | Tests | Result |
|-------|-------|--------|
| `app/api/obituary/[slug]/comments/route.test.ts` | 10 | ✅ All pass |
| `app/api/obituary/[slug]/comments/[id]/route.test.ts` | 3 | ✅ All pass |
| Full suite (`pnpm test`) | 329 | ✅ 328 pass / 1 pre-existing fail (unrelated) |
| ESLint (`pnpm lint`) | — | ✅ No warnings or errors |
| TypeScript (`tsc --noEmit`) | — | ✅ No errors |

**Pre-existing failure:** `app/api/auth/callback/route.test.ts` — test expects redirect to `/dashboard`, route redirects to `/dashboard/profile`. Confirmed pre-existing before SPEC-8 via git stash; not caused by this spec.

---

## Manual Verification

| Check | Result |
|-------|--------|
| Published obituary visible at `/obituary/sudeep-panda` | ✅ |
| Listing page at `/obituary` shows all published obituaries | ✅ |
| Name/state/year filters narrow results correctly | ✅ |
| Clear link resets filters | ✅ |
| Nav → Members → Obituary link navigates to listing page | ✅ |
| Unauthenticated user: CommentForm shows, POST returns 403 on submit | ✅ |
| Active member: comment submits successfully, appears on refresh | ✅ |
| `router.refresh()` shows new comment without full reload | ✅ |
| New Sanity slugs route correctly without code changes | ✅ (dynamic `[slug]` route) |

---

## Files Delivered

| File | Action |
|------|--------|
| `apps/web/prisma/schema.prisma` | Added `ObituaryComment` model + back-relation on Member |
| `apps/web/sanity/schemas/obituary.ts` | Created — Sanity document type |
| `apps/web/sanity/schemas/index.ts` | Added obituary import + export |
| `apps/web/sanity/lib/queries.ts` | Added 3 GROQ queries |
| `apps/web/types/sanity.ts` | Added `SanityObituary`, `SanityObituarySlug` |
| `apps/web/lib/validation/obituary-comment.schema.ts` | Created — Zod schema |
| `apps/web/lib/obituaries/comment-service.ts` | Created — service layer |
| `apps/web/app/api/obituary/[slug]/comments/route.ts` | Created — GET + POST |
| `apps/web/app/api/obituary/[slug]/comments/route.test.ts` | Created — 10 tests |
| `apps/web/app/api/obituary/[slug]/comments/[id]/route.ts` | Created — DELETE |
| `apps/web/app/api/obituary/[slug]/comments/[id]/route.test.ts` | Created — 3 tests |
| `apps/web/app/obituary/page.tsx` | Replaced stub — ISR listing with filters |
| `apps/web/app/obituary/[slug]/page.tsx` | Created — ISR detail page |
| `apps/web/app/obituary/[slug]/CommentForm.tsx` | Created — client comment form |

---

## Known Limitations

- **EC-03 (slug mutation):** `obituarySlug` stored as plain string in comments. If a Sanity editor renames a slug after publish, existing comments become orphaned. Mitigation: treat slugs as immutable after publish (Sanity convention). No DB FK to Sanity is possible by design.
- **Comment staleness:** ISR caches the detail page for 60s. `router.refresh()` shows the submitting user's comment immediately; other users see it within the next ISR window.

---

## SPEC-8 CLOSED
