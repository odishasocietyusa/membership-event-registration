# SPEC-11 Phase 3 Implementation Log

> **Phase:** 3 — Implementer
> **Date:** 2026-05-14
> **Result:** COMPLETE — 245/245 tests passing, NestJS deleted

---

## Files Created

| File | Purpose |
|---|---|
| `apps/web/app/api/users/me/profile/route.ts` | POST — profile upsert from registration form |
| `apps/web/lib/validation/membership.schema.ts` | Zod schemas for all membership endpoints |
| `apps/web/lib/memberships/membership-service.ts` | All membership business logic |
| `apps/web/app/api/memberships/types/route.ts` | GET (public) — list non-admin membership fees |
| `apps/web/app/api/memberships/route.ts` | POST (auth) apply + GET (admin) list all |
| `apps/web/app/api/memberships/me/route.ts` | GET + DELETE (auth) own membership |
| `apps/web/app/api/memberships/me/history/route.ts` | GET (auth) membership history |
| `apps/web/app/api/memberships/honorary/assign/route.ts` | POST (admin) assign honorary |
| `apps/web/app/api/memberships/[id]/route.ts` | GET + DELETE (admin) by member ID |
| `apps/web/app/api/memberships/[id]/approve/route.ts` | POST (admin) approve |
| `apps/web/app/api/memberships/[id]/reject/route.ts` | POST (admin) reject |
| `apps/web/app/api/memberships/[id]/status/route.ts` | PUT (admin) override status |
| `apps/web/app/api/members/[id]/role/route.ts` | PUT (admin) update role |
| `apps/web/app/api/members/[id]/export/route.ts` | GET (admin) export member data |

## Files Modified

| File | Change |
|---|---|
| `apps/web/prisma/schema.prisma` | Added `profileData Json?` to `Member` model |
| `apps/web/lib/validation/member.schema.ts` | Added `CreateProfileSchema` + `ChildInputSchema` |
| `apps/web/app/register/page.tsx` | Replaced `${apiUrl}/users/me/profile` → `/api/users/me/profile` |
| `apps/web/app/api/members/[id]/route.ts` | Added `DELETE` export (admin soft-delete by ID) |
| `apps/web/app/api/cron/expiry-reminders/route.ts` | Calls `expireOverdueMemberships()` before sending emails |
| `apps/web/app/api/cron/expiry-reminders/route.test.ts` | Added `updateMany` to prisma mock |
| `apps/web/.env.example` | Removed `NEXT_PUBLIC_API_URL` and `API_URL` commented lines |
| All 8 test files with Member mocks | Added `profileData: null` to fixture objects |
| `pnpm-workspace.yaml` | Set `@nestjs/core: false` |
| `package.json` | Removed `@nestjs/core` from `onlyBuiltDependencies` |

## Files Deleted

- `apps/api/` — entire NestJS application
- `postman/` — NestJS API Postman collection

## Schema Change

```sql
ALTER TABLE members ADD COLUMN profile_data JSONB;
```

Applied via `prisma db push` (local dev). Production requires a migration.

## Test Results

245/245 passing after all changes.

## Pre-existing Build Issue (Not Caused By This Migration)

`pnpm build` fails due to `@typescript-eslint/no-explicit-any` ESLint rule not installed in `lib/payments/payment-service.ts`. This was failing before this migration began. Tracked separately.
