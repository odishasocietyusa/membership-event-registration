# Phase 2: Design Document

> **Spec:** SPEC-5-awards-module
> **Architect Agent:** Claude Code
> **Date:** 2026-05-14
> **Status:** Ready for Review

---

## 1. Design Overview

### 1.1 Solution Summary
Add an `AwardName` reference table (text-slug PK, seeded with OSA-defined names) and an `Award` table (UUID PK, FK to `AwardName`, optional FK to `Member`, plus `recipientName`, `citation`, `year`, `category`, `photoUrl`). Expose four App-Router routes that mirror SPEC-3 conventions: two public GETs and three admin-guarded writes (POST list, PATCH/DELETE single, POST photo). Photo upload uses `multipart/form-data` and stores the file in the Supabase `award-photos` bucket via the existing `supabaseAdmin` client; the resulting public URL is written back to `awards.photo_url`.

### 1.2 Design Principles Applied
- **Reuse over invention** — mirror `lib/members/member-service.ts` + `app/api/members/[id]/route.ts` patterns.
- **Boundary-faithful** — touch only files this spec owns; the only schema touch on the existing `Member` model is the inverse relation back-reference (called out explicitly below for team-lead approval).
- **Minimum surface** — no pagination, no `GET /api/award-names` endpoint, no storage cleanup. Add when needed.
- **Verifiable first** — every acceptance criterion in spec §3.2 maps 1:1 to a named test case in §7 below.

---

## 2. Codebase Analysis

### 2.1 Existing Patterns Identified

| Pattern                                            | Location                                              | Will Reuse? |
|----------------------------------------------------|-------------------------------------------------------|-------------|
| Service module with named exports + tagged errors  | `apps/web/lib/members/member-service.ts`              | Yes         |
| Zod schema module with grouped exports             | `apps/web/lib/validation/member.schema.ts`            | Yes         |
| Route handler wrapping `withAuth(..., {role})`     | `apps/web/app/api/members/route.ts`                   | Yes         |
| Dynamic-param route with `params: Promise<{id}>`   | `apps/web/app/api/members/[id]/route.ts`              | Yes         |
| `serviceErrorToResponse` mapping NOT_FOUND/CONFLICT/FORBIDDEN | `apps/web/app/api/members/[id]/route.ts`   | Yes         |
| Service unit tests with `jest.mock('@/lib/db/prisma')` | `apps/web/lib/members/member-service.test.ts`     | Yes         |
| Route unit tests with mocked `withAuth`            | `apps/web/app/api/members/me/route.test.ts`           | Yes         |
| Reference table with text-slug PK + seed via upsert | `apps/web/prisma/schema.prisma` (`Chapter`) + `seed.ts` | Yes      |
| Supabase admin client (service-role)               | `apps/web/lib/auth/supabase-admin.ts`                 | Yes (re-import for Storage) |

### 2.2 Related Existing Code

| File                                                  | Relevance                                                                 | Action          |
|-------------------------------------------------------|---------------------------------------------------------------------------|-----------------|
| `apps/web/lib/auth/with-auth.ts`                      | Admin guard for write routes                                              | Import only     |
| `apps/web/lib/db/prisma.ts`                           | Shared Prisma client                                                      | Import only     |
| `apps/web/lib/auth/supabase-admin.ts`                 | Service-role client for Storage uploads                                   | Import only     |
| `apps/web/lib/members/member-service.ts`              | Reference implementation pattern                                          | Reference only  |
| `apps/web/app/api/members/[id]/route.ts`              | Reference for dynamic param + error mapping                               | Reference only  |
| `apps/web/prisma/schema.prisma`                       | Add `Award`, `AwardName`, `AwardCategory` enum; add `awards` back-relation on `Member` | Modify          |
| `apps/web/prisma/seed.ts`                             | Add award-name upsert block                                               | Modify          |

### 2.3 Conventions to Follow
- **Naming:** Service functions `verbAwardX` (e.g. `createAward`, `listAwards`); Zod schemas `<Action>AwardSchema`; route exports `GET`/`POST`/`PATCH`/`DELETE`.
- **File structure:** Service flat in `lib/awards/`, routes mirror URL in `app/api/awards/`.
- **Error handling:** Throw `Error` objects with `code: 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'BAD_REQUEST'`; route maps via shared helper.
- **Testing:** Co-located `*.test.ts`. Service tests mock `@/lib/db/prisma`. Route tests mock `@/lib/auth/with-auth` and `@/lib/awards/award-service`. Use Jest like SPEC-3.

---

## 3. Architecture Design

### 3.1 Component Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                            Next.js App Router                          │
│                                                                        │
│  /api/awards                  /api/awards/[id]        /api/awards/[id]/│
│   GET (public)                  GET (public)              photo        │
│   POST (admin)                  PUT (admin)               POST (admin) │
│                                 DELETE (admin)                         │
└────────┬───────────────────────────┬────────────────────────┬──────────┘
         │                           │                        │
         ▼                           ▼                        ▼
┌──────────────────────────────────────────────────────────────────────┐
│                  lib/awards/award-service.ts                         │
│                                                                      │
│  listAwards · getAwardById · createAward · updateAward               │
│  deleteAward · setAwardPhotoUrl · uploadAwardPhoto (storage)         │
└────────┬──────────────────────────────────────────────┬──────────────┘
         │                                              │
         ▼                                              ▼
┌─────────────────────────┐                ┌─────────────────────────────┐
│  lib/db/prisma  (read)  │                │  lib/auth/supabase-admin    │
│                         │                │  .storage.from('award-      │
│  award · awardName ·    │                │  photos').upload(...)        │
│  member (FK)            │                │                             │
└─────────────────────────┘                └─────────────────────────────┘
```

### 3.2 Data Flow

**Create award (admin):**
```
POST /api/awards (JSON body)
  → withAuth({role:'admin'})
  → Zod CreateAwardSchema parse
  → award-service.createAward()
  → prisma.award.create()
  → 201 JSON { award }
```

**Photo upload (admin):**
```
POST /api/awards/:id/photo (multipart/form-data, field "file")
  → withAuth({role:'admin'})
  → service.getAwardById() (404 if missing)
  → req.formData(), validate file presence + MIME + size
  → service.uploadAwardPhoto(awardId, file)
      → supabaseAdmin.storage.from('award-photos').upload(path, bytes, { contentType })
      → supabaseAdmin.storage.from('award-photos').getPublicUrl(path)
      → service.setAwardPhotoUrl(awardId, publicUrl)
  → 200 JSON { award }
```

**Public list with filters:**
```
GET /api/awards?year=2024&category=competition
  → Zod ListAwardsQuerySchema (coerce year, validate category)
  → service.listAwards({ year, category })
  → prisma.award.findMany({ where, include: { recipientMember:true, awardName:true } })
  → 200 JSON { awards }
```

### 3.3 Key Interfaces/Contracts

```typescript
// lib/awards/award-service.ts

export interface ListAwardsFilter {
  year?: number
  category?: 'nomination' | 'competition'
}

export interface CreateAwardInput {
  awardName: string                  // FK → award_names.id (slug)
  year: number
  category: 'nomination' | 'competition'
  recipientName?: string | null
  recipientMemberId?: string | null  // uuid
  citation?: string | null
}

export type UpdateAwardInput = Partial<CreateAwardInput>

export function listAwards(filter: ListAwardsFilter): Promise<Award[]>
export function getAwardById(id: string): Promise<Award | null>
export function createAward(input: CreateAwardInput): Promise<Award>
export function updateAward(id: string, input: UpdateAwardInput): Promise<Award>
export function deleteAward(id: string): Promise<void>
export function uploadAwardPhoto(
  awardId: string,
  file: { bytes: ArrayBuffer; contentType: string; filename: string }
): Promise<Award>
```

```typescript
// API response shapes
GET  /api/awards         → 200 { awards: Award[] }
GET  /api/awards/:id     → 200 { award: Award } | 404
POST /api/awards         → 201 { award: Award }  (admin) | 400 | 403
PATCH /api/awards/:id     → 200 { award: Award }  (admin) | 400 | 403 | 404
DELETE /api/awards/:id   → 204                   (admin) | 403 | 404
POST /api/awards/:id/photo → 200 { award: Award } (admin) | 400 | 403 | 404
```

---

## 4. File Structure

### 4.1 New Files to Create

| File Path                                                    | Purpose                                                       |
|--------------------------------------------------------------|---------------------------------------------------------------|
| `apps/web/lib/validation/award.schema.ts`                    | Zod schemas: Create/Update/Query                              |
| `apps/web/lib/awards/award-service.ts`                       | CRUD + photo-upload service                                   |
| `apps/web/lib/awards/award-service.test.ts`                  | Unit tests for service (Prisma + Storage mocked)              |
| `apps/web/app/api/awards/route.ts`                           | `GET` public · `POST` admin                                   |
| `apps/web/app/api/awards/route.test.ts`                      | Route handler tests                                           |
| `apps/web/app/api/awards/[id]/route.ts`                      | `GET` public · `PATCH`/`DELETE` admin                           |
| `apps/web/app/api/awards/[id]/route.test.ts`                 | Route handler tests                                           |
| `apps/web/app/api/awards/[id]/photo/route.ts`                | `POST` admin photo upload                                     |
| `apps/web/app/api/awards/[id]/photo/route.test.ts`           | Route handler tests                                           |

### 4.2 Files to Modify

| File Path                            | Changes                                                                                  | Impact |
|--------------------------------------|------------------------------------------------------------------------------------------|--------|
| `apps/web/prisma/schema.prisma`      | Add `AwardCategory` enum, `AwardName` model, `Award` model. Add `awards Award[]` back-relation on `Member`. | Med    |
| `apps/web/prisma/seed.ts`            | Add `awardNames` array + upsert loop                                                     | Low    |

### 4.3 Files NOT to Touch

| File Path                              | Reason                                                                 |
|----------------------------------------|------------------------------------------------------------------------|
| `apps/web/lib/auth/with-auth.ts`       | Spec marks read-only                                                   |
| `apps/web/lib/db/prisma.ts`            | Spec marks read-only                                                   |
| `apps/web/lib/auth/supabase-admin.ts`  | Import only; no edits needed                                           |
| Any other module (members, chapters)   | Outside spec scope, except the inverse-relation line on `Member` flagged above. |

**⚠️ Boundary note for team lead:** Adding `awards Award[] @relation("AwardRecipient")` to `Member` is the minimum schema touch needed for Prisma to accept the FK on `Award.recipientMember`. Alternative: leave it off — Prisma allows one-sided relations, the FK still works, but `member.awards` is unavailable in queries. **Recommendation:** include the inverse line; it is the convention used everywhere else in the schema. Will defer to team lead's direction.

---

## 5. Implementation Plan

### 5.1 Implementation Sequence

```
Step 1 — Schema + seed (no logic yet)
   └── Modify: prisma/schema.prisma (Award, AwardName, AwardCategory, Member inverse)
   └── Modify: prisma/seed.ts (award_names upsert block)
   └── Verify with `prisma format` + `prisma db push` against local DB

Step 2 — Validation schemas
   └── Create: lib/validation/award.schema.ts

Step 3 — Service (TDD)
   └── Create: lib/awards/award-service.test.ts  (RED: each scenario from §7)
   └── Create: lib/awards/award-service.ts        (GREEN)
   └── REFACTOR

Step 4 — Public list/get route (TDD)
   └── Create: app/api/awards/route.test.ts       (RED — GET tests only)
   └── Create: app/api/awards/route.ts            (GREEN — GET only)
   └── Add POST tests and implementation
   └── Create: app/api/awards/[id]/route.test.ts (RED — GET, PATCH, DELETE)
   └── Create: app/api/awards/[id]/route.ts      (GREEN)

Step 5 — Photo upload route (TDD)
   └── Create: app/api/awards/[id]/photo/route.test.ts
   └── Create: app/api/awards/[id]/photo/route.ts

Step 6 — Full test run + lint
```

### 5.2 Prisma Schema Additions

```prisma
enum AwardCategory {
  nomination
  competition

  @@map("award_category")
}

model AwardName {
  id          String   @id                   // slug e.g. "community-service"
  displayName String   @map("display_name")
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz

  awards Award[]

  @@map("award_names")
}

model Award {
  id                String        @id @default(uuid()) @db.Uuid
  awardName         String        @map("award_name")          // FK → award_names.id
  year              Int
  category          AwardCategory
  recipientName     String?       @map("recipient_name")
  recipientMemberId String?       @map("recipient_member_id") @db.Uuid
  citation          String?
  photoUrl          String?       @map("photo_url")
  createdAt         DateTime      @default(now()) @map("created_at") @db.Timestamptz

  awardNameRef    AwardName @relation(fields: [awardName], references: [id])
  recipientMember Member?   @relation("AwardRecipient", fields: [recipientMemberId], references: [id])

  @@index([year])
  @@index([category])
  @@map("awards")
}
```

Single-line addition on `Member`:
```prisma
awards Award[] @relation("AwardRecipient")
```

### 5.3 Seed Additions (prisma/seed.ts)

```typescript
const awardNames = [
  { id: 'community-service',     displayName: 'Community Service Award' },
  { id: 'lifetime-achievement',  displayName: 'Lifetime Achievement Award' },
  { id: 'youth-excellence',      displayName: 'Youth Excellence Award' },
  { id: 'cultural-ambassador',   displayName: 'Cultural Ambassador Award' },
]
// upsert each (idempotent), mirroring the chapter loop
```

### 5.4 Zod Schemas (lib/validation/award.schema.ts)

```typescript
import { z } from 'zod'

export const AwardCategoryEnum = z.enum(['nomination', 'competition'])

export const ListAwardsQuerySchema = z.object({
  year:     z.coerce.number().int().min(1900).max(2100).optional(),
  category: AwardCategoryEnum.optional(),
})

export const CreateAwardSchema = z.object({
  awardName:         z.string().min(1).max(100),
  year:              z.number().int().min(1900).max(2100),
  category:          AwardCategoryEnum,
  recipientName:     z.string().min(1).max(200).optional().nullable(),
  recipientMemberId: z.string().uuid().optional().nullable(),
  citation:          z.string().max(2000).optional().nullable(),
}).refine(
  d => Boolean(d.recipientName) || Boolean(d.recipientMemberId),
  { message: 'Either recipientName or recipientMemberId is required' }
)

export const UpdateAwardSchema = CreateAwardSchema._def.schema.partial()
```

### 5.5 Photo Upload Contract

- **Request:** `Content-Type: multipart/form-data`, single field `file`.
- **Allowed MIME types:** `image/png`, `image/jpeg`, `image/webp`.
- **Max size:** 5 MB.
- **Storage path:** `awards/{awardId}/{Date.now()}-{sanitizedFilename}` in bucket `award-photos`.
- **Public URL:** retrieved via `getPublicUrl`; stored to `awards.photo_url`.

---

## 6. Testing Strategy

### 6.1 Test Levels
- **Service unit tests** (Jest): mock `@/lib/db/prisma` and `@/lib/auth/supabase-admin` (only `storage.from(...)` chain).
- **Route handler unit tests** (Jest): mock `@/lib/auth/with-auth` and `@/lib/awards/award-service`.
- **No new Playwright/E2E tests** in this spec (existing Playwright suite covers admin/member auth flows; the spec doesn't require E2E and the API tests live in NestJS, not the web app).

### 6.2 Run Command
```
pnpm --filter web test
```

---

## 7. Test Cases (1:1 map to spec §3.2)

| ID      | Source (spec §3.2)                  | Layer       | Test                                                                                          |
|---------|-------------------------------------|-------------|-----------------------------------------------------------------------------------------------|
| AWD-01  | Public list                         | route       | `GET /api/awards` with no auth → 200, returns `{ awards: [...] }`                            |
| AWD-02  | Filter by year                      | route       | `GET /api/awards?year=2023` → calls service with `{ year: 2023 }`, returns filtered           |
| AWD-02b | Filter by year (svc)                | service     | `listAwards({ year: 2023 })` passes `{ year: 2023 }` to `prisma.award.findMany` `where`       |
| AWD-02c | Filter by category                  | route+svc   | `?category=competition` → filter applied; invalid value → 400                                  |
| AWD-03  | Admin create                        | route       | `POST /api/awards` with admin + valid body → 201, returns `{ award }` with `id`               |
| AWD-03b | Admin create (svc)                  | service     | `createAward` calls `prisma.award.create` with mapped fields                                   |
| AWD-04  | Admin update                        | route       | `PATCH /api/awards/:id` with admin → 200, returns updated award                                  |
| AWD-04b | Update non-existent                 | service     | `updateAward('missing')` throws `NOT_FOUND` → route returns 404                                |
| AWD-05  | Admin delete                        | route       | `DELETE /api/awards/:id` with admin → 204, no body                                            |
| AWD-05b | Delete non-existent                 | service     | `deleteAward('missing')` throws `NOT_FOUND` → route returns 404                                |
| AWD-06  | Member attempts create              | route       | Non-admin POST → `withAuth` returns 403; service not invoked                                  |
| AWD-06b | Member attempts update/delete       | route       | Non-admin PATCH/DELETE → 403                                                                    |
| AWD-07  | Award with member recipient         | route+svc   | `POST` with valid `recipientMemberId` → FK stored; `GET /:id` includes resolved member        |
| AWD-08  | Award without member                | route+svc   | `POST` with `recipientName` only, no `recipientMemberId` → FK null, `recipientName` stored    |
| AWD-09  | Both recipient fields missing       | route       | `POST` with neither → Zod refinement → 400                                                    |
| AWD-10  | Bad JSON body                       | route       | `POST` with malformed JSON → 400                                                              |
| AWD-11  | Single award read (public)          | route       | `GET /api/awards/:id` no auth → 200; missing id → 404                                          |
| AWD-12  | Invalid award_name FK               | service     | `createAward` with unknown `awardName` → Prisma P2003 → 400 `{error:'Invalid awardName'}`     |
| AWD-13  | Invalid recipient_member_id         | service     | `createAward` with unknown member id → P2003 → 400                                            |
| AWD-14  | Photo upload happy path             | route       | `POST /:id/photo` with admin + valid file → uploads to Storage, writes URL, 200               |
| AWD-15  | Photo upload — missing file         | route       | No `file` field → 400                                                                          |
| AWD-16  | Photo upload — bad MIME             | route       | `text/plain` → 400                                                                             |
| AWD-17  | Photo upload — too large            | route       | >5 MB → 400                                                                                    |
| AWD-18  | Photo upload — non-existent award   | route       | `:id` not found → 404; storage never invoked                                                   |
| AWD-19  | Photo upload — non-admin            | route       | `withAuth({role:'admin'})` rejects → 403; storage never invoked                                |
| AWD-20  | Photo upload — storage error        | service     | Storage upload returns error → service throws; route returns 500                              |

**Map to acceptance criteria (spec §3.1):**

| Spec §3.1 line                                                  | Covered by                          |
|-----------------------------------------------------------------|-------------------------------------|
| `GET /api/awards` returns all awards (no auth)                  | AWD-01                              |
| `GET /api/awards?year=2024` returns filtered                    | AWD-02, AWD-02b                     |
| `GET /api/awards/:id` returns single                            | AWD-11                              |
| `POST /api/awards` (admin) creates                              | AWD-03, AWD-03b                     |
| `PATCH /api/awards/:id` (admin) updates                           | AWD-04, AWD-04b                     |
| `DELETE /api/awards/:id` (admin) deletes; 204                   | AWD-05, AWD-05b                     |
| `POST /api/awards/:id/photo` uploads + saves URL                | AWD-14                              |
| Non-admin `POST /api/awards` returns 403                        | AWD-06, AWD-06b, AWD-19             |
| All tests passing                                               | full suite                          |

---

## 8. Open Items for Team Lead

1. **Member back-relation:** OK to add `awards Award[] @relation("AwardRecipient")` to the `Member` model, given `lib/db/prisma.ts` is read-only but `prisma/schema.prisma` is owned by this spec? (See §4.3 boundary note.)
2. **Seed list of award names:** Spec doesn't enumerate them. Will seed 4 placeholder names (see §5.3). Replace with official list when provided.
3. **Storage bucket provisioning:** Assume `award-photos` bucket exists (public read). If not, an infra step is needed; flag this as a deployment prerequisite, not a code change.

---

## Handoff to Implementer Agent (after approval)

**Order of operations:** schema/seed → Zod → service (TDD) → route (TDD) → photo route (TDD) → full test run. Touch only the files listed in §4.1/§4.2. Every production line must be reachable from one of the test cases in §7.
