# SPEC-11 Phase 2 Design: Migrate NestJS API to Next.js Route Handlers

> **Phase:** 2 — Architect
> **Date:** 2026-05-14
> **Schema decision:** Option A — web app's existing `Member` schema. No new Prisma models added (except one JSON column).

---

## 1. Schema Mapping Table

| NestJS Concept | Web App Mapping | Notes |
|---|---|---|
| `Membership.status = PENDING` | `Member.membershipType IS NOT NULL AND Member.memberStatus IS NULL` | No new enum value; absence of status = pending |
| `Membership.status = ACTIVE` | `Member.memberStatus = 'active'` | |
| `Membership.status = CANCELLED / REJECTED` | `Member.memberStatus = NULL, Member.membershipType = NULL` | Reset both fields |
| `Membership.status = EXPIRED` | `Member.memberStatus = 'expired'` | |
| `Membership.membershipTypeId` | `Member.membershipType` (Prisma enum) | Already inline |
| `MembershipType.price` | `MembershipFee.amountDollars` | `MembershipFee` table already exists |
| `MembershipType.isHonoraryType` | `MembershipFee.isAdminOnly = true` | `honoraryNoVote` fee row has `isAdminOnly=true` |
| `approve()` role promotion GUEST→MEMBER | No-op | Web schema starts all members at `role='member'`; no GUEST role exists |
| `assignHonoraryMembership()` | `membershipType='honoraryNoVote'`, `memberStatus='active'`, `expiryDate=null` | `honoraryNoVote` enum value already exists |
| `Membership.expiresAt` | `Member.expiryDate` | Direct map |
| `Membership.joinDate` | `Member.joinDate` | Direct map |
| `MembershipsService.cancel()` | `memberStatus=null, membershipType=null` | Resets both fields |
| Credit system | **Deferred** | No web schema fields for credits; future spec |
| `Membership.history` | `PaymentRecord[]` for `memberId` | Payment records proxy as membership history |
| `updateExpiredMemberships()` cron | `expireOverdueMemberships()` in new service | Extend existing cron route to call it |
| Admin status override | `Member.memberStatus` direct update | |

---

## 2. Schema Migration Required

One small Prisma migration is needed to store `bio`, `spouseName`, and `children` from the registration form (these fields do not exist on `Member`).

**Add to `apps/web/prisma/schema.prisma`:**
```prisma
model Member {
  // ... existing fields ...
  profileData  Json?  @map("profile_data")
}
```

Migration command: `pnpm prisma migrate dev --name add-member-profile-data` (run from `apps/web/`).

`profileData` stores: `{ bio?: string, spouseName?: string, children?: Array<{name, age, gender}> }`.

`spouseName` also writes a `FamilyMember` row with `relation='spouse'`. `children` writes `FamilyMember` rows with `relation='child'` (append-only for new registrations). `firstName + lastName` concatenates to `Member.fullName`.

---

## 3. File Inventory

### Files to Create

| Priority | Path | Purpose |
|---|---|---|
| P0 | `apps/web/app/api/users/me/profile/route.ts` | POST — profile upsert from registration form (fixes live breakage) |
| P1 | `apps/web/lib/validation/membership.schema.ts` | All membership Zod schemas |
| P1 | `apps/web/lib/memberships/membership-service.ts` | All membership business logic |
| P2 | `apps/web/app/api/memberships/types/route.ts` | GET (public) — list non-admin MembershipFee rows |
| P2 | `apps/web/app/api/memberships/route.ts` | POST (auth) apply; GET (admin) list all |
| P2 | `apps/web/app/api/memberships/me/route.ts` | GET + DELETE (auth) own membership |
| P2 | `apps/web/app/api/memberships/me/history/route.ts` | GET (auth) membership history via PaymentRecord |
| P2 | `apps/web/app/api/memberships/honorary/assign/route.ts` | POST (admin) assign honorary |
| P2 | `apps/web/app/api/memberships/[id]/route.ts` | GET + DELETE (admin) by member ID |
| P2 | `apps/web/app/api/memberships/[id]/approve/route.ts` | POST (admin) approve |
| P2 | `apps/web/app/api/memberships/[id]/reject/route.ts` | POST (admin) reject |
| P2 | `apps/web/app/api/memberships/[id]/status/route.ts` | PUT (admin) override status |
| P3 | `apps/web/app/api/members/[id]/role/route.ts` | PUT (admin) update role |
| P3 | `apps/web/app/api/members/[id]/export/route.ts` | GET (admin) export member data |

### Files to Modify

| Priority | Path | Change |
|---|---|---|
| P0 | `apps/web/app/register/page.tsx` | Lines 182–190: replace `${apiUrl}/users/me/profile` with `/api/users/me/profile` |
| P0 | `apps/web/prisma/schema.prisma` | Add `profileData Json?` to `Member` |
| P1 | `apps/web/lib/validation/member.schema.ts` | Add `CreateProfileSchema` and `ChildInputSchema` |
| P3 | `apps/web/app/api/members/[id]/route.ts` | Add `DELETE` export (admin soft-delete by ID) |
| P3 | `apps/web/app/api/cron/expiry-reminders/route.ts` | Call `expireOverdueMemberships()` before sending emails |
| P4 | `pnpm-workspace.yaml` | Remove `'@nestjs/core': true` from `allowBuilds` |
| P4 | Root `package.json` | Remove `'@nestjs/core'` from `pnpm.onlyBuiltDependencies` |

### Files to Delete (Phase G — last step)

- `apps/api/` — entire NestJS application
- `postman/` — NestJS API collection (documents a deleted API)

---

## 4. Service Function Signatures

File: `apps/web/lib/memberships/membership-service.ts`

```typescript
import { prisma } from '@/lib/db/prisma'
import type { Member, MembershipFee, PaymentRecord, MembershipType, MemberStatus } from '@prisma/client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MembershipStatusView {
  memberId:       string
  membershipType: MembershipType | null
  memberStatus:   MemberStatus | null
  joinDate:       Date | null
  expiryDate:     Date | null
}

export interface MembershipListItem extends MembershipStatusView {
  email:    string
  fullName: string | null
}

export interface PaginatedMembershipList {
  data:  MembershipListItem[]
  total: number
  page:  number
  limit: number
}

// Membership types that never expire
export const NO_EXPIRY_TYPES = new Set<MembershipType>(['life', 'lifeWard', 'honoraryNoVote'])

export const EXPIRY_DAYS: Partial<Record<MembershipType, number>> = {
  annualStudentNoVote: 365,
  annualSingle:        365,
  annualFamily:        365,
  fiveYearFamily:      365 * 5,
  patron:              365,
  benefactor:          365,
}

// ── Public queries ────────────────────────────────────────────────────────────

export async function getPublicMembershipTypes(): Promise<MembershipFee[]>
// Returns MembershipFee rows where isAdminOnly = false, ordered by amountDollars asc

export async function getAllMembershipTypes(): Promise<MembershipFee[]>
// Returns all MembershipFee rows including admin-only

// ── Member self-service ───────────────────────────────────────────────────────

export async function applyForMembership(
  memberId: string,
  membershipType: MembershipType
): Promise<Member>
// Sets Member.membershipType = membershipType (memberStatus stays null = pending)
// Throws CONFLICT if memberStatus='active' (already active)
// Throws CONFLICT if membershipType IS NOT NULL AND memberStatus IS NULL (already pending)
// Throws NOT_FOUND if no MembershipFee row exists for this type
// Throws FORBIDDEN if MembershipFee.isAdminOnly = true

export async function cancelMembership(memberId: string): Promise<Member>
// Resets memberStatus=null, membershipType=null
// Throws CONFLICT if both are already null (nothing to cancel)

export async function getMyMembershipStatus(
  memberId: string
): Promise<MembershipStatusView>
// Returns membership fields from the Member row

export async function getMembershipHistory(
  memberId: string
): Promise<PaymentRecord[]>
// Returns PaymentRecord rows where memberId matches, ordered by createdAt desc

// ── Admin operations ──────────────────────────────────────────────────────────

export async function listAllMemberships(
  page: number,
  limit: number,
  filters?: { memberStatus?: MemberStatus; membershipType?: MembershipType }
): Promise<PaginatedMembershipList>

export async function getMembershipById(memberId: string): Promise<MembershipStatusView>
// Throws NOT_FOUND if member doesn't exist or is soft-deleted

export async function approveMembership(
  memberId: string,
  adminId: string,
  note?: string
): Promise<Member>
// Sets memberStatus='active', joinDate=now(), expiryDate=computed (null for NO_EXPIRY_TYPES)
// Throws NOT_FOUND if member doesn't exist
// Throws CONFLICT if no pending application (membershipType IS NULL)
// Throws CONFLICT if already active

export async function rejectMembership(
  memberId: string,
  adminId: string,
  reason: string
): Promise<Member>
// Resets membershipType=null, memberStatus=null
// Throws NOT_FOUND if member doesn't exist
// Throws CONFLICT if no pending application

export async function overrideMembershipStatus(
  memberId: string,
  status: MemberStatus,
  note?: string
): Promise<Member>
// Direct status override — no state validation
// Throws NOT_FOUND if member doesn't exist

export async function assignHonoraryMembership(
  memberId: string,
  adminId: string,
  note?: string
): Promise<Member>
// Sets membershipType='honoraryNoVote', memberStatus='active', joinDate=now(), expiryDate=null
// Throws NOT_FOUND if member doesn't exist
// Throws CONFLICT if already has active honorary membership

export async function adminCancelMembership(
  memberId: string,
  adminId: string
): Promise<Member>
// Resets memberStatus=null, membershipType=null
// Throws NOT_FOUND if member doesn't exist

// ── Cron helper ───────────────────────────────────────────────────────────────

export async function expireOverdueMemberships(): Promise<number>
// Updates all Members where memberStatus='active' AND expiryDate < now()
// Sets memberStatus='expired'
// Returns count of updated rows
```

---

## 5. Zod Schema Design

File: `apps/web/lib/validation/membership.schema.ts`

```typescript
import { z } from 'zod'

export const MembershipTypeSchema = z.enum([
  'annualStudentNoVote', 'annualSingle', 'annualFamily',
  'fiveYearFamily', 'life', 'lifeWard', 'patron', 'benefactor', 'honoraryNoVote',
])

export const MemberStatusSchema = z.enum(['active', 'expired', 'suspended'])

// POST /api/memberships
export const ApplyMembershipSchema = z.object({
  membershipType: MembershipTypeSchema,
})

// POST /api/memberships/:id/approve
export const ApproveMembershipSchema = z.object({
  note: z.string().max(500).optional(),
})

// POST /api/memberships/:id/reject
export const RejectMembershipSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
})

// PUT /api/memberships/:id/status
export const OverrideStatusSchema = z.object({
  status: MemberStatusSchema,
  note:   z.string().max(500).optional(),
})

// POST /api/memberships/honorary/assign
export const AssignHonorarySchema = z.object({
  memberId: z.string().uuid('memberId must be a valid UUID'),
  note:     z.string().max(500).optional(),
})

// PUT /api/members/:id/role
export const UpdateRoleSchema = z.object({
  role: z.enum(['member', 'admin']),
})

// GET /api/memberships (admin query params)
export const ListMembershipsQuerySchema = z.object({
  page:           z.coerce.number().int().min(1).default(1),
  limit:          z.coerce.number().int().min(1).max(100).default(20),
  memberStatus:   MemberStatusSchema.optional(),
  membershipType: MembershipTypeSchema.optional(),
})
```

**Addition to `apps/web/lib/validation/member.schema.ts`:**

```typescript
export const ChildInputSchema = z.object({
  name:   z.string().min(1).max(200),
  age:    z.number().int().min(0).max(30),
  gender: z.enum(['M', 'F', 'Other']),
})

export const CreateProfileSchema = z.object({
  firstName:  z.string().min(1, 'First name is required').max(100),
  lastName:   z.string().min(1, 'Last name is required').max(100),
  phone:      z.string().max(30).optional(),
  bio:        z.string().max(1000).optional(),
  spouseName: z.string().max(200).optional(),
  children:   z.array(ChildInputSchema).max(10).default([]),
  address: z.object({
    street:  z.string().optional(),
    city:    z.string().optional(),
    state:   z.string().optional(),
    zip:     z.string().optional(),
    country: z.string().optional(),
  }).optional(),
})
export type CreateProfileInput = z.infer<typeof CreateProfileSchema>
```

---

## 6. Profile Endpoint Design

`POST /api/users/me/profile` accepts the registration form's payload and maps it to the `Member` + `FamilyMember` tables.

**Handler logic:**
1. Parse body with `CreateProfileSchema`
2. `fullName = firstName.trim() + ' ' + lastName.trim()`
3. `profileData = { bio, spouseName, children }` (omit undefined keys)
4. Run Prisma transaction:
   - `member.update({ where: { id: user.id }, data: { fullName, phone, address, profileData } })`
   - If `spouseName`: upsert `FamilyMember` with `relation='spouse'`, `primaryMemberId=user.id`
   - For each child: create `FamilyMember` with `relation='child'`, `fullName=child.name`, `primaryMemberId=user.id`, `dateOfBirth = new Date(currentYear - child.age, 0, 1)` (approximate)
5. Return `{ member: updatedMember }`

**`register/page.tsx` fix — change lines 182–190:**
```typescript
// BEFORE:
const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const res = await fetch(`${apiUrl}/users/me/profile`, {

// AFTER — remove apiUrl entirely:
const res = await fetch('/api/users/me/profile', {
```

---

## 7. Route Handler Pattern

All authenticated routes follow this template (identical to existing routes):

```typescript
import { withAuth } from '@/lib/auth/with-auth'
import { someServiceFn } from '@/lib/memberships/membership-service'
import { SomeSchema } from '@/lib/validation/membership.schema'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function serviceErrorToResponse(err: unknown): Response {
  const code = (err as { code?: string }).code
  if (code === 'NOT_FOUND') return jsonResponse(404, { error: 'Not found' })
  if (code === 'CONFLICT')  return jsonResponse(409, { error: 'Conflict' })
  if (code === 'FORBIDDEN') return jsonResponse(403, { error: 'Forbidden' })
  console.error(err)
  return jsonResponse(500, { error: 'Internal server error' })
}

export const POST = withAuth(async (req, { user }) => {
  let body: unknown
  try { body = await req.json() } catch { return jsonResponse(400, { error: 'Invalid JSON body' }) }
  const parsed = SomeSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })
  try {
    const result = await someServiceFn(user.id, parsed.data)
    return jsonResponse(200, { result })
  } catch (err) {
    return serviceErrorToResponse(err)
  }
}, { role: 'admin' })  // omit for member-level routes
```

Dynamic segment routes (`[id]`) receive params as the second argument to `GET(req, { params })`:

```typescript
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return withAuth(async (_req, { user: admin }) => {
    try {
      const result = await getMembershipById(id)
      return jsonResponse(200, { membership: result })
    } catch (err) {
      return serviceErrorToResponse(err)
    }
  }, { role: 'admin' })(req)
}
```

---

## 8. Implementation Sequence

**Phase A — Schema (blocks everything)**
1. Add `profileData Json?` to `Member` in `apps/web/prisma/schema.prisma`
2. Run Prisma migration

**Phase B — Live breakage fix (can ship independently)**
3. Add `CreateProfileSchema` + `ChildInputSchema` to `lib/validation/member.schema.ts`
4. Create `app/api/users/me/profile/route.ts`
5. Modify `app/register/page.tsx` (remove `NEXT_PUBLIC_API_URL`)

**Phase C — Service + validation layer**
6. Create `lib/validation/membership.schema.ts`
7. Create `lib/memberships/membership-service.ts`

**Phase D — Membership routes**
8. `app/api/memberships/types/route.ts`
9. `app/api/memberships/me/route.ts`
10. `app/api/memberships/me/history/route.ts`
11. `app/api/memberships/route.ts`
12. `app/api/memberships/honorary/assign/route.ts`
13. `app/api/memberships/[id]/route.ts`
14. `app/api/memberships/[id]/approve/route.ts`
15. `app/api/memberships/[id]/reject/route.ts`
16. `app/api/memberships/[id]/status/route.ts`

**Phase E — Admin gaps + cron**
17. `app/api/members/[id]/role/route.ts`
18. Add `DELETE` export to `app/api/members/[id]/route.ts`
19. `app/api/members/[id]/export/route.ts`
20. Modify `app/api/cron/expiry-reminders/route.ts`

**Phase F — Delete NestJS**
21. Smoke-test all new endpoints
22. `rm -rf apps/api/ postman/`
23. Update `pnpm-workspace.yaml` (remove `@nestjs/core` allowBuilds)
24. Update root `package.json` (remove `@nestjs/core` onlyBuiltDependencies)
25. `pnpm install` + `pnpm build --filter=web`

---

## 9. Deletion Checklist

### Pre-deletion verification
- [ ] `POST /api/users/me/profile` returns 200 (smoke test with valid session)
- [ ] `register/page.tsx` step 4 no longer calls port 3001
- [ ] `GET /api/memberships/types` returns fee rows without auth
- [ ] All 12 membership routes return expected responses
- [ ] `GET /api/cron/expiry-reminders` still works after modification

### Deletion steps
- [ ] `git rm -r apps/api/`
- [ ] `git rm -r postman/`
- [ ] Remove `@nestjs/core` entry from `pnpm-workspace.yaml` `allowBuilds`
- [ ] Remove `@nestjs/core` from root `package.json` `pnpm.onlyBuiltDependencies`
- [ ] Delete `NEXT_PUBLIC_API_URL` and `API_URL` lines from `apps/web/.env.example`
- [ ] `pnpm install` — verify lockfile clean
- [ ] `pnpm build --filter=web` — must pass zero errors

---

## 10. Assumptions

1. **`honoraryNoVote` fee row exists in seed.** If not, Implementer must add it to `apps/web/prisma/seed.ts` with `amountDollars=0, isAdminOnly=true`.
2. **Credit system deferred.** No attempt to replicate NestJS credit logic.
3. **Role promotion is a no-op.** All members start at `role='member'`; no GUEST→MEMBER promotion needed.
4. **`adminId` logged to console only.** No `AuditLog` model exists; admin actions log to `console.log`.
5. **Children are append-only** on `POST /api/users/me/profile`. No deduplication.
6. **`honoraryNoVote` added to `NO_EXPIRY_TYPES`.** The constant in `membership-service.ts` includes `honoraryNoVote`. The existing `payment-service.ts` constant is not modified in this spec.
