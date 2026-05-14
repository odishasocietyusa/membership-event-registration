# Phase 3: Implementation Log

> **Spec:** SPEC-3-member-module
> **Implementer Agent:** implementer-backend-s3
> **Date:** 2026-05-14
> **Status:** COMPLETE

---

## Files Created

### Validation

- **`apps/web/lib/validation/member.schema.ts`** — NEW
  All Zod schemas from design §5:
  - `UpdateMemberSchema`
  - `AdminUpdateMemberSchema`
  - `CreateFamilyMemberSchema` (includes `highSchoolGraduationYear` with year range validation)
  - `LinkMemberSchema`
  - `CreateChapterSchema` (slug validated as `/^[a-z0-9-]+$/`)
  - `UpdateChapterSchema` (at least one field required via `.refine()`)
  - `ListMembersQuerySchema` (coerced pagination params)

### Service

- **`apps/web/lib/members/member-service.ts`** — NEW
  Implements all 12 functions from design §4:
  - `getMemberById(id, opts?)` — where clause respects `includeDeleted` option
  - `updateMember(id, data)` — throws NOT_FOUND if missing
  - `softDeleteMember(id)` — sets `deletedAt` on member AND all family members via `updateMany`
  - `exportMemberData(id)` — returns full bundle with `_note` field
  - `listMembers(page, limit, includeDeleted?)` — skip/take pagination with count
  - `linkMemberAccount(email, userId)` — idempotent if same userId, CONFLICT if different userId
  - `addFamilyMember(primaryMemberId, data)` — NOT_FOUND if primary missing/deleted
  - `listFamilyMembers(primaryMemberId)` — excludes soft-deleted
  - `softDeleteFamilyMember(id, requestingMemberId)` — FORBIDDEN if ownership mismatch
  - `createChapter(data)` — catches Prisma P2002 → CONFLICT
  - `updateChapter(id, data)` — NOT_FOUND if missing; presidentMemberId excluded from updates
  - `listChapters()` — ordered by id asc

### Route Handlers

- **`apps/web/app/api/members/route.ts`** — NEW
  `GET` — admin only, paginated list

- **`apps/web/app/api/members/me/route.ts`** — NEW
  `GET` — returns ctx.user
  `PUT` — validates with UpdateMemberSchema, calls updateMember
  `DELETE` — calls softDeleteMember

- **`apps/web/app/api/members/me/export/route.ts`** — NEW
  `GET` — calls exportMemberData

- **`apps/web/app/api/members/me/family/route.ts`** — NEW
  `GET` — calls listFamilyMembers
  `POST` — validates with CreateFamilyMemberSchema, calls addFamilyMember

- **`apps/web/app/api/members/me/family/[id]/route.ts`** — NEW
  `DELETE` — awaits params, calls softDeleteFamilyMember

- **`apps/web/app/api/members/[id]/route.ts`** — NEW
  `GET` — admin only, awaits params, calls getMemberById + listFamilyMembers
  `PUT` — admin only, awaits params, validates with AdminUpdateMemberSchema

- **`apps/web/app/api/admin/link-member/route.ts`** — NEW
  `POST` — admin only, validates with LinkMemberSchema, calls linkMemberAccount

- **`apps/web/app/api/chapters/route.ts`** — NEW
  `GET` — PUBLIC (no withAuth), calls listChapters
  `POST` — admin only, validates with CreateChapterSchema, calls createChapter

- **`apps/web/app/api/chapters/[id]/route.ts`** — NEW
  `PUT` — admin only, awaits params, validates with UpdateChapterSchema, calls updateChapter

### Seed

- **`apps/web/prisma/seed.ts`** — NEW
  Seeds 18 chapters using `prisma.chapter.upsert` (idempotent).
  Includes all active OSA chapters as specified in design §2.4.

## Files Modified

- **`apps/web/lib/auth/with-auth.test.ts`** — removed stale `familyId`, `familyRole`, `parentFamilyId` fields from `baseMember` fixture (those columns were removed from the Member model in this spec)

- **`apps/web/app/api/auth/me/route.test.ts`** — same fix: removed stale `familyId`, `familyRole`, `parentFamilyId` from `baseMember` fixture

## Prisma Generate

`pnpm prisma generate` must be run before TypeScript compilation:

```bash
cd apps/web && pnpm prisma generate
```

The Prisma client was already generated in `node_modules/.prisma/client` from a prior run, so existing tests passed without re-running it. After any schema change, re-run generate before building.

## Test Results

```
Test Suites: 7 passed, 7 total
Tests:       32 passed, 32 total
Snapshots:   0 total
Time:        0.489 s
```

All 32 pre-existing tests pass with zero regressions.

## Deviations from Design

1. **`withAuth` dynamic route pattern** — The design §6 pseudocode shows `withAuth` receiving params as a third argument (`(req, ctx, { params })`). However, the actual `withAuth` signature is `(handler, options?)` where handler receives `(req, ctx)` only — no params arg. The implementation uses the closure pattern documented in the task instructions:
   ```typescript
   export async function DELETE(req, { params }) {
     const { id } = await params
     return withAuth(async (_req, ctx) => {
       // id captured from closure
     })(req)
   }
   ```

2. **`states` array validation** — The design §5 `CreateChapterSchema` shows `z.array(z.string().length(2)).min(1)` (2-char state codes only). However, the Canada chapter uses `'Canada'` (6 chars) in the seed data. The implementation uses `z.array(z.string()).min(1)` without length restriction to accommodate multi-word or non-US entries. This is consistent with the seed data provided in the same design doc.

## RLS SQL — Manual Application Required

The RLS policies in design §7 must be applied manually via **Supabase Studio SQL editor** or `psql`. They are not run by Prisma migrations.

Tables requiring RLS enablement and policies:
- `members` — §7.1
- `family_members` — §7.2
- `chapters` — §7.3
- `payment_records` — §7.4

The Prisma singleton uses `DATABASE_URL` (service-role key) and bypasses RLS. Application-level `withAuth()` guards are the primary security mechanism. RLS serves as defence-in-depth for direct DB access.
