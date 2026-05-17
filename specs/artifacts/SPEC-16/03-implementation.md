# Phase 3 Implementation — SPEC-16: Member Search

> **Spec:** `specs/active/SPEC-16-member-search.md`
> **Status:** Complete
> **Date:** 2026-05-17
> **Depends on:** `02-design.md`

---

## Files Created

### `apps/web/lib/constants/geo.ts`
New file. Exports `GeoOption` interface, `US_STATES` (50 entries), and `CA_PROVINCES` (13 entries). All use state/province abbreviations as values and full names as labels.

### `apps/web/app/api/members/search/route.ts`
New file. GET-only route. Enforces `memberStatus === 'active'` on the caller, parses query params through `MemberSearchQuerySchema`, and delegates to `searchMembers()`.

### `apps/web/app/members/search/MemberSearchClient.tsx`
New Client Component. Owns all interactive state: form fields, country/state dropdown swap, search results, pagination, loading/error states. Fetches `/api/members/search` with the Supabase Bearer token from `createSupabaseBrowser()`.

---

## Files Modified

### `apps/web/lib/validation/member.schema.ts`
Appended three exports after the existing `CreateProfileInput` type:
- `MemberSearchQuerySchema` — Zod object with optional firstName/lastName/city (min 3 chars each), state, country enum, page; refine ensures at least one filter beyond country is present
- `MemberSearchResultSchema` — strict DTO with 8 fields; no email/phone/sensitive fields
- `MemberSearchResponseSchema` — wraps results array with total, page, pageSize, truncated

### `apps/web/lib/members/member-service.ts`
- Added `Prisma` and `MemberSearchResult`/`MemberSearchResponse` imports at the top
- Appended `MemberSearchInput` interface, `parseName()` helper, and `searchMembers()` function
- `searchMembers()` builds a Prisma `AND` array; uses `select` (not full row) to prevent email/phone leaking at DB layer; caps total at 1 000; maps rows to DTO via `parseName()`

### `apps/web/app/members/search/page.tsx`
Full replacement of the Sanity CMS stub. Now a Server Component that: gets session (redirects to `/login` if missing), calls `/api/auth/me` to check `memberStatus`, renders a 403 message for non-active members, or renders `<MemberSearchClient />` for active members.

---

## Deviations from Design

None. Implementation matches the design document exactly.

---

## Build Verification

```
pnpm build --filter=web  →  Tasks: 1 successful
/members/search           →  2.67 kB (Dynamic, server-rendered on demand)
```

TypeScript errors in pre-existing `.test.ts` files are unrelated to this spec and existed before this implementation.

---

## Acceptance Criteria Coverage

| Criterion | Covered by |
|-----------|-----------|
| Unauthenticated → redirect `/login` | `page.tsx` |
| Non-active caller → 403 message + link to `/membership` | `page.tsx` + `route.ts` |
| Empty form blocked client-side | `MemberSearchClient.tsx` `validate()` |
| Sub-3-char input blocked | `validate()` + `MemberSearchQuerySchema` |
| Country-only blocked | `validate()` + Zod refine |
| Canada → province dropdown | `MemberSearchClient.tsx` `handleCountryChange()` |
| Results include any member status | `searchMembers()` — no memberStatus filter on results |
| 100 per page, total shown, cap at 1 000 | `searchMembers()` + `MemberSearchClient.tsx` |
| 7 data columns + Actions column | `MemberSearchClient.tsx` table |
| Send Message link pre-encoded | `href="/messages/new?to=${m.memberId}"` |
| No email/phone in API response | `select` in Prisma query + strict DTO |
| API 401 with no token | `withAuth` |
| API 403 with non-active token | inline check in `route.ts` |
| API 400 with sub-3-char param | `MemberSearchQuerySchema` |
