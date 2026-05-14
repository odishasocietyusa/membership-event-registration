# Phase 2: Design Document

> **Spec:** SPEC-3-member-module
> **Architect Agent:** architect-s3
> **Date:** 2026-05-14
> **Status:** COMPLETE

---

## 1. Prisma Schema Changes

Full replacement of `apps/web/prisma/schema.prisma`. All changes from the approved decisions are applied:

- `Chapter` model added with text slug PK
- `FamilyMember` model added with `deletedAt` and `FamilyRelation` enum
- `Member` model: `familyId`, `familyRole`, `parentFamilyId` removed; `chapterId` changed from `@db.Uuid` to plain `String?`; `Chapter` relation added; `familyMembers` backlink added
- `FamilyRole` enum removed (replaced by `FamilyRelation`)
- All existing models (`PaymentRecord`) preserved

```prisma
// OSA Website — Prisma Schema
// apps/web/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
  output   = "../node_modules/.prisma/client"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

enum Role {
  member
  admin

  @@map("role")
}

enum MembershipType {
  annualStudentNoVote @map("annual-student-no-vote")
  annualSingle        @map("annual-single")
  annualFamily        @map("annual-family")
  fiveYearFamily      @map("five-year-family")
  life
  lifeWard            @map("life-ward")
  patron
  benefactor
  honoraryNoVote      @map("honorary-no-vote")

  @@map("membership_type")
}

enum MemberStatus {
  active
  expired
  suspended

  @@map("member_status")
}

enum SouvenirPreference {
  electronic
  print

  @@map("souvenir_preference")
}

// Replaces the old FamilyRole enum; used by FamilyMember.relation
enum FamilyRelation {
  spouse
  child
  other

  @@map("family_relation")
}

// ─────────────────────────────────────────────────────────────────────────────
// CHAPTERS
// ─────────────────────────────────────────────────────────────────────────────

model Chapter {
  id                String   @id  // text slug e.g. "seattle", "florida"
  displayName       String   @map("display_name")
  states            String[] // geographic coverage array
  presidentMemberId String?  @map("president_member_id") @db.Uuid
  createdAt         DateTime @default(now()) @map("created_at") @db.Timestamptz

  // Relations
  president Member?  @relation("ChapterPresident", fields: [presidentMemberId], references: [id])
  members   Member[] @relation("MemberChapter")

  @@map("chapters")
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMBERS
// ─────────────────────────────────────────────────────────────────────────────

model Member {
  id                 String              @id @default(uuid()) @db.Uuid
  userId             String?             @unique @map("user_id") @db.Uuid
  stripeCustomerId   String?             @map("stripe_customer_id")
  email              String              @unique
  fullName           String?             @map("full_name")
  phone              String?
  address            Json?
  // chapterId is now a text slug FK (not UUID) — see OQ-2
  chapterId          String?             @map("chapter_id")
  membershipType     MembershipType?     @map("membership_type")
  memberStatus       MemberStatus?       @map("member_status")
  joinDate           DateTime?           @map("join_date") @db.Date
  expiryDate         DateTime?           @map("expiry_date") @db.Date
  profileVisibility  Json?               @map("profile_visibility")
  role               Role                @default(member)
  souvenirPreference SouvenirPreference? @map("souvenir_preference")
  createdAt          DateTime            @default(now()) @map("created_at") @db.Timestamptz
  deletedAt          DateTime?           @map("deleted_at") @db.Timestamptz

  // Relations
  chapter        Chapter?       @relation("MemberChapter", fields: [chapterId], references: [id])
  presidentOf    Chapter[]      @relation("ChapterPresident")
  familyMembers  FamilyMember[] @relation("PrimaryMember")
  paymentRecords PaymentRecord[]

  @@map("members")
}

// ─────────────────────────────────────────────────────────────────────────────
// FAMILY MEMBERS
// ─────────────────────────────────────────────────────────────────────────────

model FamilyMember {
  id                      String         @id @default(uuid()) @db.Uuid
  primaryMemberId         String         @map("primary_member_id") @db.Uuid
  fullName                String         @map("full_name")
  relation                FamilyRelation
  dateOfBirth             DateTime?      @map("date_of_birth") @db.Date
  highSchoolGraduationYear Int?          @map("high_school_graduation_year")
  createdAt               DateTime       @default(now()) @map("created_at") @db.Timestamptz
  // Soft-delete — required by FR-09 (not in architecture doc, added per OQ-6)
  deletedAt               DateTime?      @map("deleted_at") @db.Timestamptz

  // Relations
  primaryMember Member @relation("PrimaryMember", fields: [primaryMemberId], references: [id])

  @@map("family_members")
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT RECORDS
// ─────────────────────────────────────────────────────────────────────────────

model PaymentRecord {
  id            String    @id @default(uuid()) @db.Uuid
  memberId      String    @map("member_id") @db.Uuid
  transactionId String?   @map("transaction_id")
  paymentDate   DateTime? @map("payment_date") @db.Timestamptz
  amount        Decimal?  @db.Decimal(10, 2)
  notes         String?
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz

  member Member @relation(fields: [memberId], references: [id])

  @@map("payment_records")
}
```

---

## 2. Migration Plan

Prisma's `prisma migrate dev` will auto-generate most DDL. The following statements are **manual additions** required in the migration SQL file (or applied via Supabase Studio SQL editor), since Prisma cannot safely handle them automatically.

### 2.1 Schema Mutations (Prisma cannot auto-generate safely)

```sql
-- ── Step 1: Drop the in-row family linkage columns from members ─────────────
-- These were added in SPEC-2 under a different design decision (OQ-1 resolved).
ALTER TABLE members DROP COLUMN IF EXISTS family_id;
ALTER TABLE members DROP COLUMN IF EXISTS family_role;
ALTER TABLE members DROP COLUMN IF EXISTS parent_family_id;

-- ── Step 2: Drop the old family_role enum (replaced by family_relation) ─────
DROP TYPE IF EXISTS family_role;

-- ── Step 3: Change chapter_id column type from uuid to text ─────────────────
-- Required because chapters.id is now a text slug PK (OQ-2 resolved).
-- The column was nullable and had no FK constraint in SPEC-2, so this is safe.
ALTER TABLE members ALTER COLUMN chapter_id TYPE text USING chapter_id::text;
-- If a UUID FK constraint existed, drop it first:
-- ALTER TABLE members DROP CONSTRAINT IF EXISTS members_chapter_id_fkey;
```

### 2.2 New Tables (auto-generated by Prisma, shown for reference)

```sql
-- chapters table
CREATE TABLE chapters (
  id                   text PRIMARY KEY,
  display_name         text NOT NULL,
  states               text[] NOT NULL DEFAULT '{}',
  president_member_id  uuid REFERENCES members(id),
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- family_members table
CREATE TABLE family_members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_member_id uuid NOT NULL REFERENCES members(id),
  full_name         text NOT NULL,
  relation          family_relation NOT NULL,
  date_of_birth     date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);

-- family_relation enum
CREATE TYPE family_relation AS ENUM ('spouse', 'child', 'other');
```

### 2.3 RLS Enablement

```sql
-- Enable RLS on all three tables owned by this spec
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;
```

### 2.4 Chapter Seed Data

The following SQL seeds the 18 active OSA chapters from official OSA Chapter Details (updated 5-SEP-2025). Two inactive chapters are included as comments for historical reference. This should also be reflected in `apps/web/prisma/seed.ts`.

```sql
INSERT INTO chapters (id, display_name, states) VALUES
  -- Active chapters (18)
  ('canada',          'Canada Chapter',         ARRAY['Canada']),
  ('carolinas',       'Carolinas Chapter',       ARRAY['NC', 'SC']),
  ('california',      'California Chapter',      ARRAY['CA']),
  ('chicago',         'Chicago Chapter',         ARRAY['IL']),
  ('florida',         'Florida Chapter',         ARRAY['FL']),
  ('georgia',         'Georgia Chapter',         ARRAY['GA']),
  ('michigan',        'Michigan Chapter',        ARRAY['MI']),
  ('minnesota',       'Minnesota Chapter',       ARRAY['MN']),
  ('mt-hood',         'Mt Hood Chapter',         ARRAY['OR']),
  ('new-england',     'New England Chapter',     ARRAY['MA', 'CT', 'RI', 'ME', 'NH', 'VT']),
  ('ny-nj-pa',        'NY-NJ-PA Chapter',        ARRAY['NY', 'NJ', 'PA']),
  ('ohio',            'Ohio Chapter',            ARRAY['OH']),
  ('ozark',           'Ozark Chapter',           ARRAY['KS', 'KY', 'IA', 'MO']),
  ('rocky-mountain',  'Rocky Mountain Chapter',  ARRAY['CO', 'MT', 'WY', 'ND', 'SD']),
  ('seattle',         'Seattle Chapter',         ARRAY['WA']),
  ('southern',        'Southern Chapter',        ARRAY['TN', 'LA', 'MS', 'AL', 'KY']),
  ('southwest',       'Southwest Chapter',       ARRAY['TX', 'AR', 'NM', 'OK']),
  ('washington-dc',   'Washington DC Chapter',   ARRAY['MD', 'DC', 'VA', 'WV', 'DE'])
  -- Inactive chapters (not inserted; retained as reference):
  -- ('grand-canyon',    'OSA Grand Canyon Chapter',    ARRAY['AZ', 'UT', 'NM']),   -- INACTIVE, founded 2009
  -- ('maryland-virginia','OSA Maryland-Virginia Chapter', ARRAY['MD', 'VA'])         -- INACTIVE, founded 1995
ON CONFLICT (id) DO NOTHING;
```

### 2.5 RLS Policies

See Section 7 for the complete SQL.

---

## 3. API Route File Structure

```
apps/web/
├── lib/
│   ├── members/
│   │   └── member-service.ts          NEW — all member/family/chapter business logic
│   └── validation/
│       └── member.schema.ts           NEW — all Zod schemas for this module
├── app/api/
│   ├── members/
│   │   ├── route.ts                   NEW — admin: GET paginated list
│   │   ├── me/
│   │   │   ├── route.ts               NEW — GET own profile · PUT update · DELETE soft-delete
│   │   │   ├── export/
│   │   │   │   └── route.ts           NEW — GET GDPR data export
│   │   │   └── family/
│   │   │       ├── route.ts           NEW — GET list · POST create family member
│   │   │       └── [id]/
│   │   │           └── route.ts       NEW — DELETE soft-delete family member
│   │   └── [id]/
│   │       └── route.ts               NEW — admin: GET full profile · PUT update member
│   ├── admin/
│   │   └── link-member/
│   │       └── route.ts               NEW — POST link userId to member by email
│   └── chapters/
│       ├── route.ts                   NEW — GET public list · POST admin create
│       └── [id]/
│           └── route.ts               NEW — PUT admin update chapter
├── prisma/
│   └── schema.prisma                  MODIFY — as shown in Section 1
└── prisma/seed.ts                     MODIFY — add chapter seed data
```

**File count:** 9 new route files, 1 new service file, 1 new validation file, 2 modified files.

---

## 4. Service Function Signatures

All functions live in `apps/web/lib/members/member-service.ts` and import `prisma` from `@/lib/db/prisma`.

```typescript
import { prisma } from '@/lib/db/prisma'
import type { Member, FamilyMember, Chapter } from '@prisma/client'

// ── Shared result types ───────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface MemberExport {
  exportDate: string          // ISO timestamp
  member: Member
  familyMembers: FamilyMember[]
  paymentRecords: PaymentRecord[]
  _note: string               // "messages will be included after SPEC-6"
}

// ── Input types (mirrors Zod schemas in member.schema.ts) ────────────────────

export interface UpdateMemberInput {
  fullName?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  }
  profileVisibility?: {
    show_phone: boolean
    show_email: boolean
    show_chapter: boolean
  }
  souvenirPreference?: 'electronic' | 'print'
  chapterId?: string | null
}

export interface AdminUpdateMemberInput extends UpdateMemberInput {
  memberStatus?: 'active' | 'suspended'
  role?: 'member' | 'admin'
}

export interface CreateFamilyMemberInput {
  fullName: string
  relation: 'spouse' | 'child' | 'other'
  dateOfBirth?: string              // ISO date string YYYY-MM-DD, optional
  highSchoolGraduationYear?: number // 4-digit year, optional
}

export interface CreateChapterInput {
  id: string            // text slug e.g. "seattle"
  displayName: string
  states: string[]
}

// ── Member functions ──────────────────────────────────────────────────────────

/**
 * Fetch a single member by internal UUID.
 * Returns null if not found or (by default) if soft-deleted.
 * Pass { includeDeleted: true } only for admin use cases.
 */
export async function getMemberById(
  id: string,
  opts?: { includeDeleted?: boolean }
): Promise<Member | null>

/**
 * Apply a partial update to a member row.
 * For member-self updates, caller passes UpdateMemberInput.
 * For admin updates, caller may additionally pass memberStatus/role fields.
 * Throws 404 (via thrown Error with code 'NOT_FOUND') if member does not exist.
 */
export async function updateMember(
  id: string,
  data: Partial<AdminUpdateMemberInput>
): Promise<Member>

/**
 * Soft-delete a member account.
 * Sets deletedAt on the member row AND on all their family_member rows.
 * Does NOT hard-delete any rows. Subsequent withAuth() calls return 401.
 * Throws 404 if member not found.
 */
export async function softDeleteMember(id: string): Promise<void>

/**
 * Build a GDPR-compliant export bundle for the member.
 * Includes: member row, family_member rows, payment_record rows.
 * Messages are deferred to SPEC-6; a _note field documents this.
 * Throws 404 if member not found.
 */
export async function exportMemberData(id: string): Promise<MemberExport>

/**
 * Paginated list of members for admin use.
 * Default: excludes soft-deleted rows unless includeDeleted = true.
 * limit is capped at 100 by Zod validation upstream, but enforced here too.
 */
export async function listMembers(
  page: number,
  limit: number,
  includeDeleted?: boolean
): Promise<PaginatedResult<Member>>

/**
 * Link a Supabase Auth userId to an existing member row identified by email.
 * - Returns 404 (thrown Error 'NOT_FOUND') if no member with that email exists.
 * - Returns 200 (idempotent) if the same userId is already set on the member.
 * - Throws Error with code 'CONFLICT' if a DIFFERENT userId is already linked
 *   (possible account takeover attempt — admin must investigate).
 */
export async function linkMemberAccount(
  email: string,
  userId: string
): Promise<Member>

// ── Family member functions ───────────────────────────────────────────────────

/**
 * Add a family member record linked to the given primaryMemberId.
 * Throws 404 if primary member does not exist (or is soft-deleted).
 */
export async function addFamilyMember(
  primaryMemberId: string,
  data: CreateFamilyMemberInput
): Promise<FamilyMember>

/**
 * List active (non-soft-deleted) family members for a primary member.
 * Returns empty array if primary member has no family members.
 */
export async function listFamilyMembers(
  primaryMemberId: string
): Promise<FamilyMember[]>

/**
 * Soft-delete a single family member by its UUID.
 * Verifies that familyMember.primaryMemberId === requestingMemberId before deleting.
 * Throws Error with code 'FORBIDDEN' (→ 403) if ownership check fails.
 * Throws Error with code 'NOT_FOUND' (→ 404) if family member not found.
 */
export async function softDeleteFamilyMember(
  id: string,
  requestingMemberId: string
): Promise<void>

// ── Chapter functions ─────────────────────────────────────────────────────────

/**
 * Create a new chapter. The id field is a caller-supplied text slug.
 * Throws Error with code 'CONFLICT' if a chapter with that id already exists.
 */
export async function createChapter(
  data: CreateChapterInput
): Promise<Chapter>

/**
 * Update an existing chapter's displayName and/or states array.
 * presidentMemberId is intentionally NOT writable via API (Supabase Studio only).
 * Throws Error with code 'NOT_FOUND' if chapter id does not exist.
 */
export async function updateChapter(
  id: string,
  data: Partial<Omit<CreateChapterInput, 'id'>>
): Promise<Chapter>

/**
 * Return all chapters ordered by id (alphabetical).
 * No auth required — this is called directly from the public route handler.
 */
export async function listChapters(): Promise<Chapter[]>
```

### 4.1 Error Code Convention

Service functions throw plain `Error` objects with a `code` property for handler-level mapping:

| `error.code` | HTTP Status | When thrown |
|---|---|---|
| `'NOT_FOUND'` | 404 | Row does not exist or is soft-deleted |
| `'CONFLICT'` | 409 | Unique constraint violation (e.g. different userId already linked) |
| `'FORBIDDEN'` | 403 | Ownership check failed (e.g. deleting another member's family row) |

Route handlers catch these and return the appropriate status codes.

---

## 5. Zod Schema Definitions

File: `apps/web/lib/validation/member.schema.ts`

```typescript
import { z } from 'zod'

// ── Shared sub-schemas ────────────────────────────────────────────────────────

const AddressSchema = z.object({
  street:  z.string().optional(),
  city:    z.string().optional(),
  state:   z.string().optional(),
  zip:     z.string().optional(),
  country: z.string().optional(),
})

const ProfileVisibilitySchema = z.object({
  show_phone:   z.boolean(),
  show_email:   z.boolean(),
  show_chapter: z.boolean(),
})

// ── Member update (member-self PUT /api/members/me) ───────────────────────────

export const UpdateMemberSchema = z.object({
  fullName:          z.string().min(1).max(200).optional(),
  phone:             z.string().max(30).optional(),
  address:           AddressSchema.optional(),
  profileVisibility: ProfileVisibilitySchema.optional(),
  souvenirPreference: z.enum(['electronic', 'print']).optional(),
  chapterId:         z.string().nullable().optional(), // null clears the chapter
})
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>

// ── Admin member update (PUT /api/members/:id) ────────────────────────────────
// Extends the member-self schema with admin-only fields

export const AdminUpdateMemberSchema = UpdateMemberSchema.extend({
  memberStatus: z.enum(['active', 'suspended']).optional(),
  role:         z.enum(['member', 'admin']).optional(),
})
export type AdminUpdateMemberInput = z.infer<typeof AdminUpdateMemberSchema>

// ── Family member create (POST /api/members/me/family) ────────────────────────

export const CreateFamilyMemberSchema = z.object({
  fullName:                 z.string().min(1).max(200),
  relation:                 z.enum(['spouse', 'child', 'other']),
  dateOfBirth:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
  highSchoolGraduationYear: z.number().int().min(1900).max(new Date().getFullYear() + 6).optional(),
})
export type CreateFamilyMemberInput = z.infer<typeof CreateFamilyMemberSchema>

// ── Admin link-member (POST /api/admin/link-member) ───────────────────────────

export const LinkMemberSchema = z.object({
  email:  z.string().email(),
  userId: z.string().uuid(),
})
export type LinkMemberInput = z.infer<typeof LinkMemberSchema>

// ── Chapter create (POST /api/chapters) ──────────────────────────────────────

export const CreateChapterSchema = z.object({
  id:          z.string().min(2).max(50).regex(/^[a-z0-9-]+$/), // slug format only
  displayName: z.string().min(2).max(200),
  states:      z.array(z.string().length(2)).min(1),             // 2-letter state codes
})
export type CreateChapterSchemaInput = z.infer<typeof CreateChapterSchema>

// ── Chapter update (PUT /api/chapters/:id) ────────────────────────────────────

export const UpdateChapterSchema = CreateChapterSchema
  .omit({ id: true })
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided' }
  )

// ── Admin list members query params (GET /api/members) ────────────────────────

export const ListMembersQuerySchema = z.object({
  page:          z.coerce.number().int().min(1).default(1),
  limit:         z.coerce.number().int().min(1).max(100).default(20),
  includeDeleted: z.coerce.boolean().default(false),
})
export type ListMembersQuery = z.infer<typeof ListMembersQuerySchema>
```

---

## 6. Route Handler Pseudocode

All handlers follow the pattern established in `app/api/auth/me/route.ts`. The `jsonResponse()` helper is imported from `withAuth` or re-declared locally.

Helper used throughout:
```
function jsonResponse(status, body) → Response
function parseBody(req) → JSON | throws 400
function parseQuery(url, schema) → parsed | throws 400
function serviceErrorToResponse(error) → Response (maps NOT_FOUND→404, CONFLICT→409, FORBIDDEN→403)
```

---

### GET /api/members/me

```
export GET = withAuth(async (req, { user }) => {
  // user is already the full member row from withAuth
  // Strip email before returning (NFR-02: never expose email to client in general
  // member context — but this IS the member's own data, so email is fine here)
  return jsonResponse(200, { member: user })
})
```

---

### PUT /api/members/me

```
export PUT = withAuth(async (req, { user }) => {
  body = await parseBody(req)                          // throws 400 on parse fail
  parsed = UpdateMemberSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  updated = await updateMember(user.id, parsed.data)
  return jsonResponse(200, { member: updated })
})
```

---

### DELETE /api/members/me

```
export DELETE = withAuth(async (req, { user }) => {
  await softDeleteMember(user.id)
  return jsonResponse(200, { message: 'Account deactivated' })
})
```

---

### GET /api/members/me/export

```
export GET = withAuth(async (req, { user }) => {
  exportData = await exportMemberData(user.id)
  return jsonResponse(200, exportData)
})
```

---

### GET /api/members/me/family

```
export GET = withAuth(async (req, { user }) => {
  members = await listFamilyMembers(user.id)
  return jsonResponse(200, { familyMembers: members })
})
```

---

### POST /api/members/me/family

```
export POST = withAuth(async (req, { user }) => {
  body = await parseBody(req)
  parsed = CreateFamilyMemberSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  try {
    created = await addFamilyMember(user.id, parsed.data)
    return jsonResponse(201, { familyMember: created })
  } catch (err) {
    return serviceErrorToResponse(err)  // handles NOT_FOUND → 404
  }
})
```

---

### DELETE /api/members/me/family/[id]

```
// params.id is the family member UUID from the URL segment
export DELETE = withAuth(async (req, { user }, { params }) => {
  try {
    await softDeleteFamilyMember(params.id, user.id)
    return jsonResponse(200, { message: 'Family member removed' })
  } catch (err) {
    return serviceErrorToResponse(err)  // NOT_FOUND → 404, FORBIDDEN → 403
  }
})
```

---

### GET /api/members  (admin)

```
export GET = withAuth(async (req) => {
  url = new URL(req.url)
  parsed = ListMembersQuerySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  result = await listMembers(parsed.data.page, parsed.data.limit, parsed.data.includeDeleted)
  return jsonResponse(200, result)
}, { role: 'admin' })
```

---

### GET /api/members/[id]  (admin)

```
export GET = withAuth(async (req, _ctx, { params }) => {
  member = await getMemberById(params.id, { includeDeleted: true })
  if (!member) return jsonResponse(404, { error: 'Member not found' })

  // Include family members in admin full-profile view
  familyMembers = await listFamilyMembers(params.id)
  return jsonResponse(200, { member, familyMembers })
}, { role: 'admin' })
```

---

### PUT /api/members/[id]  (admin)

```
export PUT = withAuth(async (req, _ctx, { params }) => {
  body = await parseBody(req)
  parsed = AdminUpdateMemberSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  try {
    updated = await updateMember(params.id, parsed.data)
    return jsonResponse(200, { member: updated })
  } catch (err) {
    return serviceErrorToResponse(err)  // NOT_FOUND → 404
  }
}, { role: 'admin' })
```

---

### POST /api/admin/link-member  (admin)

```
export POST = withAuth(async (req) => {
  body = await parseBody(req)
  parsed = LinkMemberSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  try {
    member = await linkMemberAccount(parsed.data.email, parsed.data.userId)
    return jsonResponse(200, { member })
  } catch (err) {
    return serviceErrorToResponse(err)  // NOT_FOUND → 404, CONFLICT → 409
  }
}, { role: 'admin' })
```

---

### GET /api/chapters  (public — no withAuth)

```
export async function GET(req: Request): Promise<Response> {
  // No withAuth — FR-10 requires public access
  chapters = await listChapters()
  return jsonResponse(200, { chapters })
}
```

---

### POST /api/chapters  (admin)

```
export POST = withAuth(async (req) => {
  body = await parseBody(req)
  parsed = CreateChapterSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  try {
    chapter = await createChapter(parsed.data)
    return jsonResponse(201, { chapter })
  } catch (err) {
    return serviceErrorToResponse(err)  // CONFLICT → 409
  }
}, { role: 'admin' })
```

---

### PUT /api/chapters/[id]  (admin)

```
export PUT = withAuth(async (req, _ctx, { params }) => {
  body = await parseBody(req)
  parsed = UpdateChapterSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  try {
    chapter = await updateChapter(params.id, parsed.data)
    return jsonResponse(200, { chapter })
  } catch (err) {
    return serviceErrorToResponse(err)  // NOT_FOUND → 404
  }
}, { role: 'admin' })
```

---

## 7. RLS Policies (Complete SQL)

> **Architecture note (OQ-3):** The Prisma singleton uses `DATABASE_URL` which connects with the service-role key and bypasses RLS. Application-level checks via `withAuth()` are the primary security mechanism. These RLS policies serve as defence-in-depth against direct DB access via Supabase Studio, psql, or any future query interface. This design decision must be documented in `CLAUDE.md`.

### 7.1 `members` table

```sql
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE members FORCE ROW LEVEL SECURITY;

-- Admin subquery (reused across tables)
-- We define it once here for documentation; inline it in each policy.

-- SELECT: member reads only their own row
CREATE POLICY members_select_own ON members
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- SELECT: admin reads all rows (including soft-deleted)
CREATE POLICY members_select_admin ON members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.deleted_at IS NULL
    )
  );

-- UPDATE: member updates their own row
CREATE POLICY members_update_own ON members
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: admin updates any row
CREATE POLICY members_update_admin ON members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.deleted_at IS NULL
    )
  );

-- INSERT: JIT sync — new user inserts their own row (or service role)
CREATE POLICY members_insert_jit ON members
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
```

### 7.2 `family_members` table

```sql
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members FORCE ROW LEVEL SECURITY;

-- SELECT: primary member reads their own family rows
CREATE POLICY family_select_own ON family_members
  FOR SELECT
  TO authenticated
  USING (
    primary_member_id IN (
      SELECT id FROM members
      WHERE user_id = auth.uid()
        AND deleted_at IS NULL
    )
  );

-- SELECT: admin reads all rows
CREATE POLICY family_select_admin ON family_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.deleted_at IS NULL
    )
  );

-- INSERT: member creates family rows under their own member id
CREATE POLICY family_insert_own ON family_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    primary_member_id IN (
      SELECT id FROM members
      WHERE user_id = auth.uid()
        AND deleted_at IS NULL
    )
  );

-- UPDATE: member updates (including soft-deletes) their own family rows
CREATE POLICY family_update_own ON family_members
  FOR UPDATE
  TO authenticated
  USING (
    primary_member_id IN (
      SELECT id FROM members
      WHERE user_id = auth.uid()
        AND deleted_at IS NULL
    )
  )
  WITH CHECK (
    primary_member_id IN (
      SELECT id FROM members
      WHERE user_id = auth.uid()
        AND deleted_at IS NULL
    )
  );

-- UPDATE: admin full access
CREATE POLICY family_update_admin ON family_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.deleted_at IS NULL
    )
  );
```

### 7.3 `chapters` table

```sql
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters FORCE ROW LEVEL SECURITY;

-- SELECT: public — no auth needed
CREATE POLICY chapters_select_public ON chapters
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- INSERT: admin only
CREATE POLICY chapters_insert_admin ON chapters
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.deleted_at IS NULL
    )
  );

-- UPDATE: admin only
CREATE POLICY chapters_update_admin ON chapters
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.deleted_at IS NULL
    )
  );
```

### 7.4 `payment_records` table (SPEC-3 owned — OQ-5)

```sql
ALTER TABLE payment_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_records FORCE ROW LEVEL SECURITY;

-- SELECT: member reads their own payment records
-- Required for correct GDPR export behaviour (FR-08)
CREATE POLICY payments_select_own ON payment_records
  FOR SELECT
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM members
      WHERE user_id = auth.uid()
        AND deleted_at IS NULL
    )
  );

-- SELECT: admin reads all payment records
CREATE POLICY payments_select_admin ON payment_records
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.deleted_at IS NULL
    )
  );
```

---

## 8. Testing Strategy

All tests live in `apps/web/__tests__/api/members/` and use `vitest` (or Jest) with Prisma mock via `jest-mock-extended` or `vitest-mock-extended`. Route handlers are tested by constructing `Request` objects directly (no HTTP server needed).

### 8.1 Test Fixtures Required

- `__tests__/fixtures/member.factory.ts` — creates mock `Member` rows
- `__tests__/fixtures/family-member.factory.ts` — creates mock `FamilyMember` rows
- `__tests__/fixtures/chapter.factory.ts` — creates mock `Chapter` rows
- `__tests__/mocks/prisma.mock.ts` — mock PrismaClient (reuse from SPEC-2 if present)
- `__tests__/mocks/with-auth.mock.ts` — mock `withAuth()` to inject a test user

### 8.2 Test Cases

#### GET /api/members/me

| ID | Scenario | Expected |
|----|----------|----------|
| MEM-01 | Valid token → authenticated member | 200, returns member row |
| MEM-02 | No Authorization header | 401 (from withAuth) |
| MEM-03 | Soft-deleted member token | 401 (from withAuth deletedAt check) |

#### PUT /api/members/me

| ID | Scenario | Expected |
|----|----------|----------|
| MEM-04 | Valid partial body (fullName only) | 200, updated member |
| MEM-05 | Valid body with profileVisibility | 200, visibility updated |
| MEM-06 | Invalid body (fullName empty string) | 400, Zod error detail |
| MEM-07 | Valid body with chapterId = null (clear chapter) | 200, chapterId set to null |
| MEM-08 | Valid body with valid chapterId slug | 200, chapter relation updated |

#### DELETE /api/members/me

| ID | Scenario | Expected |
|----|----------|----------|
| MEM-09 | Authenticated member calls delete | 200, deletedAt set on member and all family rows |
| MEM-10 | Subsequent call with same token | 401 (withAuth rejects soft-deleted) |

#### GET /api/members/me/export

| ID | Scenario | Expected |
|----|----------|----------|
| MEM-11 | Authenticated member | 200, JSON with member + familyMembers + paymentRecords + _note |
| MEM-12 | Member with no family or payments | 200, empty arrays for those fields |

#### GET /api/members/me/family

| ID | Scenario | Expected |
|----|----------|----------|
| MEM-13 | Member with 2 active family members | 200, array of 2 |
| MEM-14 | Member with soft-deleted family member | 200, soft-deleted row excluded |
| MEM-15 | Member with no family members | 200, empty array |

#### POST /api/members/me/family

| ID | Scenario | Expected |
|----|----------|----------|
| MEM-16 | Valid body (spouse, no DOB) | 201, new family member returned |
| MEM-17 | Valid body with dateOfBirth | 201, DOB stored correctly |
| MEM-18 | Missing required fullName | 400 |
| MEM-19 | Invalid relation value | 400 |
| MEM-20 | Invalid dateOfBirth format | 400 |

#### DELETE /api/members/me/family/[id]

| ID | Scenario | Expected |
|----|----------|----------|
| MEM-21 | Valid id belonging to requesting member | 200, deletedAt set |
| MEM-22 | id belonging to a different member | 403 |
| MEM-23 | id that does not exist | 404 |
| MEM-24 | id already soft-deleted | 404 |

#### GET /api/members  (admin)

| ID | Scenario | Expected |
|----|----------|----------|
| MEM-25 | Admin, no query params (defaults) | 200, page 1, limit 20 |
| MEM-26 | Admin, page=2&limit=5 | 200, correct slice |
| MEM-27 | Admin, includeDeleted=true | 200, includes soft-deleted rows |
| MEM-28 | Admin, limit=200 (above max) | 400, Zod error |
| MEM-29 | Member-role user | 403 |
| MEM-30 | Unauthenticated | 401 |

#### GET /api/members/[id]  (admin)

| ID | Scenario | Expected |
|----|----------|----------|
| MEM-31 | Admin, valid member id | 200, member + familyMembers |
| MEM-32 | Admin, id of soft-deleted member | 200, member returned (includeDeleted=true) |
| MEM-33 | Admin, non-existent id | 404 |
| MEM-34 | Member-role user | 403 |

#### PUT /api/members/[id]  (admin)

| ID | Scenario | Expected |
|----|----------|----------|
| MEM-35 | Admin suspends active member | 200, memberStatus=suspended |
| MEM-36 | Admin reactivates suspended member | 200, memberStatus=active |
| MEM-37 | Admin promotes member to admin role | 200, role=admin |
| MEM-38 | Admin updates fullName | 200, updated |
| MEM-39 | Invalid memberStatus value | 400 |
| MEM-40 | Member-role user | 403 |

#### POST /api/admin/link-member

| ID | Scenario | Expected |
|----|----------|----------|
| MEM-41 | Admin, valid email + userId, userId currently null | 200, userId written |
| MEM-42 | Admin, valid email + same userId already set (idempotent) | 200, no change |
| MEM-43 | Admin, valid email, different userId already set | 409 |
| MEM-44 | Admin, email not in members table | 404 |
| MEM-45 | Invalid email format | 400 |
| MEM-46 | Invalid userId (not UUID) | 400 |
| MEM-47 | Member-role user | 403 |

#### GET /api/chapters  (public)

| ID | Scenario | Expected |
|----|----------|----------|
| MEM-48 | No auth header | 200, list of 18 chapters |
| MEM-49 | With valid auth header (incidental) | 200, same list |
| MEM-50 | Empty chapters table | 200, empty array |

#### POST /api/chapters  (admin)

| ID | Scenario | Expected |
|----|----------|----------|
| MEM-51 | Admin, valid new chapter body | 201, new chapter |
| MEM-52 | Admin, duplicate id (slug already exists) | 409 |
| MEM-53 | Admin, invalid slug (uppercase) | 400 |
| MEM-54 | Admin, states array empty | 400 |
| MEM-55 | Member-role user | 403 |

#### PUT /api/chapters/[id]  (admin)

| ID | Scenario | Expected |
|----|----------|----------|
| MEM-56 | Admin, update displayName | 200, updated chapter |
| MEM-57 | Admin, non-existent chapter id | 404 |
| MEM-58 | Admin, empty body | 400 (Zod refine: at least one field) |
| MEM-59 | Member-role user | 403 |

### 8.3 Service Unit Tests (member-service.ts)

| ID | Function | Scenario |
|----|----------|----------|
| SVC-01 | `softDeleteMember` | Also soft-deletes all family rows |
| SVC-02 | `linkMemberAccount` | Same userId → idempotent 200 |
| SVC-03 | `linkMemberAccount` | Different userId → throws CONFLICT |
| SVC-04 | `linkMemberAccount` | Email not found → throws NOT_FOUND |
| SVC-05 | `softDeleteFamilyMember` | Wrong owner → throws FORBIDDEN |
| SVC-06 | `exportMemberData` | _note field present in output |
| SVC-07 | `listMembers` | Default excludes soft-deleted |
| SVC-08 | `listMembers` | includeDeleted=true includes soft-deleted |

### 8.4 Mock Requirements

| Test Area | Mock Strategy |
|-----------|---------------|
| `withAuth()` | Mock the module: inject `{ user: mockMember }` via `vi.mock('@/lib/auth/with-auth')` |
| Prisma | Use `jest-mock-extended` to mock `PrismaClient`; assert correct `where` clauses |
| Public `GET /api/chapters` | No mock for auth needed; mock `prisma.chapter.findMany` only |

---

## Summary of Key Design Decisions

1. **Schema migration is destructive but isolated.** Dropping `familyId`, `familyRole`, `parentFamilyId` from `Member` requires explicit `ALTER TABLE DROP COLUMN` SQL. The `FamilyRole` enum is also dropped. The `chapterId` type change requires `ALTER COLUMN TYPE`. These are manual steps the Implementer must add to the Prisma migration file.

2. **Text slug PK for chapters.** `chapters.id` is a plain `String` (no `@db.Uuid`). `Member.chapterId` loses the `@db.Uuid` annotation. Chapter slugs are enforced as lowercase alphanumeric+hyphen by the Zod `CreateChapterSchema`.

3. **Service-role Prisma + application checks.** The Prisma singleton bypasses RLS. `withAuth()` is the primary security gate. RLS policies are written and applied as defence-in-depth for direct DB access. This is documented explicitly in this design and must be noted in `CLAUDE.md`.

4. **Link-member idempotency.** Same `userId` already set → 200 (idempotent). Different `userId` already set → 409. This distinction is important for admin workflows and must be tested explicitly (MEM-42 vs MEM-43).

5. **GDPR export includes a `_note` field.** Since SPEC-6 (messages) is not yet implemented, the export includes a `_note: "messages will be included after SPEC-6 is implemented"` field to prevent silently incomplete exports.

6. **`presidentMemberId` is NOT writable via API.** Chapter president changes are annual and rare; they must be made via Supabase Studio only. `updateChapter()` explicitly omits `presidentMemberId` from its updatable fields.

7. **18 chapters seeded.** Real OSA chapter names used where publicly known, with US state arrays for geographic coverage. Seeds are applied via both SQL (migration) and `prisma/seed.ts` (idempotent with `ON CONFLICT DO NOTHING`).
