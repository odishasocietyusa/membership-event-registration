# SPEC-28 — Phase 4: QA Report

**QA Date:** 2026-06-11
**Status:** Approved — Ready to Close

---

## Manual Verification Results

| Scenario | Result | Notes |
|----------|--------|-------|
| Event listing page public (no login) | ✅ Pass | `/events` accessible in incognito |
| Event detail page public (no login) | ✅ Pass | `/events/[slug]` accessible in incognito after middleware fix |
| Free guest registration (openToAll) | ✅ Pass | Name + email form submits, confirmed row in DB |
| Guest confirmation cookie set | ✅ Pass | Fixed: moved from RSC to Server Action + client component |
| "You are registered" shown on return visit | ✅ Pass | Cookie read server-side, correct CTA shown |
| Admin events list at `/admin/events` | ✅ Pass | All Sanity events shown with confirmed counts |

## Bugs Found and Fixed During QA

| Bug | Fix |
|-----|-----|
| `/events` redirected unauthenticated users to `/login` | Removed pre-SPEC-28 auth redirect from `app/events/page.tsx` |
| `/events/[slug]` redirected unauthenticated users to `/login` | Removed `pathname.startsWith('/events')` from `middleware.ts` |
| `cookies().set()` in Server Component threw runtime error on success page | Extracted to Server Action + `SetGuestCookie` client component |

## Known Gaps (Accepted, Not Blocking)

- Playwright E2E tests (E2E-01–04) not written — deferred; unit tests cover all API logic
- Admin nav link for `/admin/events` not added — reachable via direct URL
- `prisma db push` to Supabase cloud requires manual SQL script (provided to user)

## Sign-off

SPEC-28 delivered all Must Have requirements (FR-01–FR-15). Spec is closed.
