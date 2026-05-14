# Phase 1: Analysis Report

> **Spec:** SPEC-3-member-module
> **Analyst Agent:** analyst-s3
> **Date:** 2026-05-14
> **Status:** COMPLETE

---

## 1. Requirements Interpretation

### 1.1 Functional Requirements

| ID | Spec Requirement | Technical Interpretation |
|----|-----------------|--------------------------|
| FR-01 | Member can view and update their own profile | `GET /api/members/me` returns the authenticated member's own `Member` row (all non-sensitive fields). `PUT /api/members/me` accepts a partial body validated by Zod and runs `prisma.member.update()`. Protected by `withAuth()` (member role). |
| FR-02 | Member can set profile visibility (show_phone, show_email, show_chapter) | `profileVisibility` is a `Json?` column already present in the web schema. The PUT handler must accept and write a validated `{ show_phone: bool, show_email: bool, show_chapter: bool }` object. Other members do not get a listing endpoint in this spec, so enforcement is mainly future-facing (FR: email must never be exposed regardless). |
| FR-03 | Member can add/edit/remove family members | Three route handlers on `me/family`: `GET` (list), `POST` (create), and `DELETE /me/family/:id` (soft-delete). Each family member row must carry `primaryMemberId` pointing to the authenticated member. Delete sets `deletedAt`; no hard remove. |
| FR-04 | Admin can list all members with pagination | `GET /api/members` protected by `withAuth(handler, { role: 'admin' })`. Accepts query params `page` (default 1) and `limit` (default 20, max 100). Returns `{ data: Member[], total: number, page: number, limit: number }`. Excludes `deletedAt IS NOT NULL` unless `includeDeleted=true` query param is supplied. |
| FR-05 | Admin can view any member's full profile | `GET /api/members/:id` protected by `withAuth(handler, { role: 'admin' })`. Returns full member row including family members. |
| FR-06 | Admin can link a `user_id` to an existing member record | `POST /api/admin/link-member` body `{ email: string, userId: string }`. Looks up member by email; if found and `userId` is currently null, sets it. Returns 404 if member not found, 409 if `userId` is already set. Protected by `withAuth(handler, { role: 'admin' })`. |
| FR-07 | Admin can suspend or reactivate a member | Covered by `PUT /api/members/:id` (admin only) accepting `{ memberStatus: 'active' | 'suspended' }`. Uses the `MemberStatus` enum already in the web schema. |
| FR-08 | Member can export all their data as JSON (GDPR) | `GET /api/members/me/export`. Queries the `Member` row plus all related `FamilyMember` rows, all `PaymentRecord` rows linked to that member, and (in a future spec) messages. Returns a single JSON object. Protected by `withAuth()` (member role). |
| FR-09 | Soft-delete sets `deleted_at`; row never removed | `DELETE /api/members/me` sets `deletedAt = new Date()`. `withAuth()` already checks `member.deletedAt !== null` and returns 401 on subsequent requests — this behaviour is already implemented in SPEC-2 and requires no change. |
| FR-10 | Chapters publicly readable without auth | `GET /api/chapters` is an unprotected Next.js route handler (no `withAuth()` wrapper). Reads all `Chapter` rows, ordered by `id`. |
| FR-11 | Admin can manage chapters (create, update) | `POST /api/chapters` and `PUT /api/chapters/:id` protected by `withAuth(handler, { role: 'admin' })`. No delete endpoint per spec (chapters are reference data; deletion is out of scope). |

### 1.2 Non-Functional Requirements

| ID | Requirement | Technical Interpretation |
|----|-------------|--------------------------|
| NFR-01 | RLS enforced at DB layer | Supabase RLS policies must be written for `members`, `family_members`, and `chapters`. Application-level checks in route handlers are a defence-in-depth layer, not a substitute. The Prisma singleton connects via `DATABASE_URL` (pooled connection) — for RLS to fire per-request the service role key must be used only for admin operations; member operations must run under the user's JWT. **Conflict:** the web app currently uses a single Prisma singleton with service-role credentials, which bypasses RLS entirely. This is an architectural tension the architect must resolve (see Open Questions). |
| NFR-02 | No member email exposed to other members | The GDPR export returns the requesting member's own email. The admin listing must return email. No public member listing endpoint exists in this spec. The `member-service.ts` helper must strip or omit email whenever building responses intended for non-admin callers. |
| NFR-03 | Soft-delete filtering | Every `prisma.member.findMany()` and `prisma.member.findUnique()` call in member-service.ts must include `where: { deletedAt: null }` unless the query is explicitly for soft-deleted records (admin use). Same rule applies to `family_members`. |

---

## 2. Schema Gap Analysis

The web schema (`apps/web/prisma/schema.prisma`) currently defines only the `Member` model and a `PaymentRecord` model. Two new models are required: `FamilyMember` and `Chapter`. Additionally, the existing `Member` model needs a relation backlink to `FamilyMember`.

### 2.1 Model-by-Model Comparison

| Model | Web Schema (current) | Architecture Target (`docs/osa-architecture.md`) | Action Required |
|-------|---------------------|--------------------------------------------------|-----------------|
| `Member` | Present. Has `chapterId: String? @db.Uuid` but no FK relation to a `Chapter` model. Has `familyId` / `familyRole` / `parentFamilyId` fields that implement a different family-linkage approach than the architecture doc. | Has `chapter: text FK → chapters` (text PK). Lists straightforward fields; no `familyId` grouping pattern — family linkage is handled by `family_members.primary_member_id`. | Decide whether to keep the `familyId`/`familyRole`/`parentFamilyId` pattern (in-row family grouping) or adopt the architecture's `family_members` table pattern. Also add `Chapter` relation and update `chapterId` type to `String?` text FK once `Chapter` is created with text PK. |
| `FamilyMember` | Absent | `family_members(id, primary_member_id, full_name, relation, date_of_birth, created_at)` | **Create.** Add to web schema with `deletedAt` field for soft-delete (architecture doc omits it but spec FR-09 requires soft-delete everywhere). |
| `Chapter` | Absent | `chapters(id text PK, display_name, states text[], president_member_id FK→members, created_at)` | **Create.** Text primary key (e.g. `"seattle"`). `presidentMemberId` is an optional FK back to `Member`. |
| `PaymentRecord` | Present (minimal: `id, memberId, transactionId, paymentDate, amount, notes, createdAt`) | `payments(id, member_id, stripe_payment_id, stripe_event_id, type, amount_cents, currency, status, refund_reason, approved_by, created_at)` | Out of scope for SPEC-3 per spec §1.3. Included in GDPR export as-is. |

### 2.2 Enum Gaps

| Enum | Web Schema | Target | Action |
|------|-----------|--------|--------|
| `FamilyRelation` | Not present (web schema has `FamilyRole` with values `primary/partner/minor`) | `relation: enum(spouse · child · other)` | **Create** `FamilyRelation` enum with values `spouse`, `child`, `other`. The existing `FamilyRole` enum belongs to the in-row family linkage pattern — keep it if that pattern is retained, or remove it if switching to the `family_members` table. |
| `MemberStatus` | Present (`active`, `expired`, `suspended`) | Same | No action needed. |
| `MembershipType` | Present (expanded list: `annualStudentNoVote`, `annualSingle`, etc.) | `annual · life · patron · benefactor` | No conflict; web schema is a superset. No action needed. |

### 2.3 `chapterId` Type Discrepancy

The web schema declares `chapterId String? @map("chapter_id") @db.Uuid` — a UUID FK — but the architecture document defines `chapters.id` as a text PK (e.g. `"seattle"`). These are incompatible. The architect must pick one:

- **Option A:** Keep `Chapter.id` as UUID (auto-generated). `chapterId` stays `@db.Uuid`. Chapter slugs stored in a separate `slug` field.
- **Option B:** Change `Chapter.id` to `String` (text PK), change `Member.chapterId` to `String?` (no `@db.Uuid`).

---

## 3. Logic to Port from NestJS

The NestJS `UsersService` (`apps/api/src/modules/users/users.service.ts`) is built around a `User` + separate `Profile` model. The web app collapses these into a single flat `Member` model. The porting table below maps NestJS methods to their Next.js equivalents.

| NestJS Method | Purpose | Next.js Route Handler Target | Translation Notes |
|---------------|---------|------------------------------|-------------------|
| `findById(id, includeDeleted?)` | Fetch user + profile + active membership | Used internally by `member-service.ts` helpers | Simplifies to `prisma.member.findUnique({ where: { id, deletedAt: null } })`. No separate profile join needed. |
| `findByEmail(email)` | Lookup by email (excludes soft-deleted) | Internal helper | Direct translation: `prisma.member.findUnique({ where: { email, deletedAt: null } })`. |
| `create(data)` | JIT sync / admin create | Already handled in `withAuth()` (SPEC-2) | Not needed in member-service.ts — `withAuth()` already does JIT creation. |
| `createOrUpdateProfile(userId, dto)` | Upsert profile fields | `PUT /api/members/me` | Simplifies — no separate profile table. Translate flat address DTO fields into `address` JSON column directly. |
| `updateProfile(userId, dto)` | Update profile fields | `PUT /api/members/me` (merged with above) | Same handler; Zod schema validates partial updates. |
| `updateRole(userId, role)` | Admin role change | `PUT /api/members/:id` (admin) | `member.role` accepts `'member' | 'admin'` (web Role enum). |
| `exportUserData(userId)` | GDPR full export | `GET /api/members/me/export` | Scope for web: member row + family members + payment records + (messages in SPEC-6). NestJS version includes event registrations, waitlist, authored articles etc. — these models don't exist in the web schema yet, so omit until their specs add them. |
| `softDeleteUser(userId)` | GDPR soft delete | `DELETE /api/members/me` | Direct translation: `prisma.member.update({ where: { id }, data: { deletedAt: new Date() } })`. Should also soft-delete family members (set their `deletedAt`). |
| `findAll(params)` | Admin paginated list | `GET /api/members` (admin) | Translate skip/take to page/limit. No separate profile join needed. Return `{ data, total, page, limit }`. |
| _(not in NestJS)_ | Admin link account | `POST /api/admin/link-member` | New logic. Lookup by email, check `userId` null, update. |
| _(not in NestJS)_ | Family member CRUD | `GET/POST /api/members/me/family`, `DELETE /api/members/me/family/:id` | New logic. No equivalent in NestJS service. |
| _(not in NestJS)_ | Chapter read/write | `GET /api/chapters`, `POST /api/chapters`, `PUT /api/chapters/:id` | New logic. No equivalent in NestJS service. |

### 3.1 NestJS Patterns That Do Not Translate

| NestJS Pattern | Web App Equivalent |
|---------------|-------------------|
| `@Injectable()` class with constructor DI | Plain async functions in `lib/members/member-service.ts` importing `prisma` singleton directly. |
| `NotFoundException` → HTTP 404 | `return new Response(JSON.stringify({ error: '...' }), { status: 404 })` or a shared `jsonResponse()` helper. |
| `ConflictException` → HTTP 409 | Same pattern with status 409. |
| `BadRequestException` → HTTP 400 | Same pattern with status 400. |
| `@Roles()` + `RolesGuard` | `withAuth(handler, { role: 'admin' })` options argument. |
| `@CurrentUser()` decorator | `ctx.user` parameter passed by `withAuth()`. |
| DTO classes with `class-validator` | Zod schemas in `lib/validation/member.schema.ts`. |

---

## 4. RLS Policy Design

The following policies are needed in Supabase SQL (to be applied via migration or the Supabase Studio SQL editor). All assume `auth.uid()` is the Supabase Auth UUID stored in `members.user_id`.

### 4.1 `members` table

| Policy Name | Command | Using / With Check | Notes |
|-------------|---------|-------------------|-------|
| `members_select_own` | SELECT | `auth.uid() = user_id` | Member reads own row only |
| `members_select_admin` | SELECT | `EXISTS (SELECT 1 FROM members WHERE user_id = auth.uid() AND role = 'admin')` | Admin reads all rows |
| `members_update_own` | UPDATE | `auth.uid() = user_id` | Member updates own row |
| `members_update_admin` | UPDATE | `(subquery admin check as above)` | Admin updates any row |
| `members_insert_jit` | INSERT | `auth.uid() = user_id` | JIT sync from `withAuth()` (or service role) |
| _(no DELETE policy)_ | — | — | Hard deletes are forbidden; soft-delete is an UPDATE |

**Note:** Public (unauthenticated) access is explicitly denied — no SELECT policy for `anon` role.

### 4.2 `family_members` table

| Policy Name | Command | Using / With Check | Notes |
|-------------|---------|-------------------|-------|
| `family_select_own` | SELECT | `primary_member_id IN (SELECT id FROM members WHERE user_id = auth.uid())` | Primary member reads their family rows |
| `family_select_admin` | SELECT | `(admin subquery)` | Admin reads all family rows |
| `family_insert_own` | INSERT | `primary_member_id IN (SELECT id FROM members WHERE user_id = auth.uid())` | Member inserts their own family members |
| `family_update_own` | UPDATE | `primary_member_id IN (SELECT id FROM members WHERE user_id = auth.uid())` | Member edits their own family rows (incl. soft-delete) |
| `family_update_admin` | UPDATE | `(admin subquery)` | Admin full access |

### 4.3 `chapters` table

| Policy Name | Command | Using / With Check | Notes |
|-------------|---------|-------------------|-------|
| `chapters_select_public` | SELECT | `true` | Publicly readable — no auth required |
| `chapters_insert_admin` | INSERT | `(admin subquery)` | Admin only |
| `chapters_update_admin` | UPDATE | `(admin subquery)` | Admin only |
| _(no DELETE policy)_ | — | — | Deletion out of scope; Studio only if ever needed |

### 4.4 `payment_records` table (existing, for completeness)

The `payment_records` table was created in SPEC-2 but has no RLS policies yet. SPEC-3 does not own payment logic, but the GDPR export reads it. The architect should note this table needs:

| Policy | Command | Using |
|--------|---------|-------|
| `payments_select_own` | SELECT | `member_id IN (SELECT id FROM members WHERE user_id = auth.uid())` |
| `payments_select_admin` | SELECT | `(admin subquery)` |

Adding these policies should be included in SPEC-3's migration, or explicitly deferred to SPEC-4 with a note.

---

## 5. Edge Cases & Risks

### 5.1 Concurrent JIT Member Creation (Already Mitigated)
`withAuth()` uses a try/catch race-safe pattern (read-first, write with catch, re-read on conflict). This is already implemented in SPEC-2. No additional work needed.

### 5.2 Soft-Delete Bypass via Direct DB Query
If RLS policies are not active (e.g., during development with service role or Prisma Studio), the `deletedAt IS NOT NULL` filter is purely application-level. The `withAuth()` check (`member.deletedAt !== null → 401`) protects the API surface, but a direct DB query would still see the row. Mitigation: ensure RLS is enabled on all tables (`ALTER TABLE members ENABLE ROW LEVEL SECURITY`), and use service role only for admin operations that explicitly need it.

### 5.3 `withAuth()` and Public Routes
`withAuth()` always requires a valid Bearer token. For `GET /api/chapters` (FR-10: public, no auth), the route handler must NOT be wrapped with `withAuth()`. The implementation must call `prisma.chapter.findMany()` directly. Risk: accidental wrapping of this handler would break the public chapters endpoint.

### 5.4 RLS vs. Prisma Service-Role Connection
The Prisma singleton in `apps/web/lib/db/prisma.ts` connects using `DATABASE_URL`, which in the Supabase setup is the pooled connection string with the **service role** key. Service role bypasses RLS entirely. This means:
- The RLS policies described in §4 will not fire for any Prisma queries made through this singleton.
- Application-level role checks in route handlers (via `withAuth()`) become the sole security layer.
- **This is acceptable only if the web app never exposes a raw query interface.** The architect should document this explicitly and consider whether to use a per-user connection (more complex) or accept service-role + application checks.

### 5.5 `chapterId` Type Mismatch
The web schema stores `chapterId` as a UUID, but the architecture doc uses a text slug PK for `chapters`. If the architect chooses text PK (Option B from §2.3), a schema migration will be needed that changes the column type — this is destructive and cannot be auto-generated safely by Prisma. A manual `ALTER TABLE` migration will be required.

### 5.6 Family Member Soft-Delete Cascade
When a member soft-deletes their account (`DELETE /api/members/me`), their family members should also be soft-deleted to prevent orphaned records that could be accessed by future RLS queries. The `softDeleteMember` service function must include a `prisma.familyMember.updateMany({ where: { primaryMemberId: id }, data: { deletedAt: new Date() } })` call.

### 5.7 GDPR Export Completeness
The architecture doc says the GDPR export covers "member profile, family members, payments, and messages." Messages (SPEC-6) do not exist yet. The export handler for SPEC-3 should return all available data now (`member`, `familyMembers`, `paymentRecords`) and include a `_note` field: `"messages will be included after SPEC-6 is implemented"`. This avoids silently incomplete exports.

### 5.8 Admin Link-Member Idempotency
If an admin calls `POST /api/admin/link-member` and the member already has the same `userId` set, the endpoint should return 200 (idempotent) rather than 409. A 409 should only fire when a *different* `userId` is already linked, which might indicate an error or account takeover attempt.

### 5.9 `DELETE /api/members/me/family/:id` — Ownership Verification
The route receives `params.id` (family member UUID). Before soft-deleting, the handler must verify that the family member's `primaryMemberId` matches the authenticated user's `member.id`. Skipping this check would allow any authenticated member to delete any other member's family rows.

### 5.10 Pagination Defaults and Abuse
`GET /api/members` (admin) must cap `limit` at a reasonable maximum (e.g., 100) to prevent a single request from loading thousands of rows. Zod validation on query params should enforce `limit.max(100)`.

---

## 6. Open Questions for Architect

| # | Question | Context | Recommendation |
|---|----------|---------|----------------|
| OQ-1 | **Family linkage pattern:** Keep the existing `familyId`/`familyRole`/`parentFamilyId` in-row grouping on `Member`, or adopt the architecture doc's separate `family_members` table? | The web schema already has the in-row pattern from SPEC-2. The architecture doc and spec §4.3 explicitly list `family_members` as a separate table. They cannot coexist without confusion. | Adopt the `family_members` table pattern as specified and remove `familyId`, `familyRole`, `parentFamilyId` from `Member`. These fields are vestigial from an earlier design. This requires a migration to drop those columns. |
| OQ-2 | **`chapters.id` type:** UUID (current `chapterId @db.Uuid` in Member) vs. text slug (architecture doc)? | See §2.3 and §5.5. | Prefer text slug PK (`"seattle"`, `"florida"`) as it matches the architecture doc and makes URLs/seeds more readable. Accept the one-time migration cost. |
| OQ-3 | **RLS enforcement model:** Service-role Prisma bypasses RLS. Should the web app use anon/user-role connections for member queries, or accept service-role + application checks? | See §5.4. The simplest approach for a small team is service-role + application checks, documented explicitly. | Accept service-role + application checks for now. Document in `CLAUDE.md` that RLS is a defence-in-depth layer, not the primary enforcement mechanism. Revisit if the app ever exposes a query interface. |
| OQ-4 | **`PUT /api/members/:id` scope:** Should this single admin endpoint handle both profile edits and status changes, or should they be separate endpoints? | Combining them keeps the route surface small. | Single endpoint with a Zod schema that accepts a partial `Member` update body. Status changes (suspend/reactivate) are just another field update. |
| OQ-5 | **`payment_records` RLS policies:** Should SPEC-3 own the `payment_records` RLS migration, or defer to SPEC-4? | SPEC-3's GDPR export reads `payment_records`. Without RLS, any authenticated user could query another's payments. | SPEC-3 should include `payment_records` RLS policies in its migration since SPEC-3 introduces the export endpoint that reads them. |
| OQ-6 | **`FamilyMember.deletedAt`:** The architecture doc schema for `family_members` does not include `deleted_at`. The spec FR-09 says "soft-delete" applies everywhere. | FR-03 says "Member can remove family members" and FR-09 mandates soft-delete. | Add `deletedAt DateTime?` to `FamilyMember` model. This is required by the spec even though the architecture doc omits it. |
| OQ-7 | **Admin `GET /api/members/:id` vs. `GET /api/members/me`:** Route ordering conflict?** | In Next.js App Router, `me` is a literal segment. The file `app/api/members/me/route.ts` and `app/api/members/[id]/route.ts` can coexist without conflict because `me` is a static segment and takes priority over `[id]`. | No action needed — Next.js handles this correctly. Documenting for implementer awareness. |

---

## 7. Dependency Verification

### 7.1 SPEC-2 Artifact Completeness

| Artifact | Expected Path | Status |
|----------|--------------|--------|
| Analysis | `specs/artifacts/SPEC-2-foundation-auth/01-analysis.md` | Present |
| Design | `specs/artifacts/SPEC-2-foundation-auth/02-design.md` | Present |
| Implementation | `specs/artifacts/SPEC-2-foundation-auth/03-implementation.md` | Present |
| QA Report | `specs/artifacts/SPEC-2-foundation-auth/04-qa-report.md` | Present — **PASS WITH NOTES** (30/30 tests passing) |

SPEC-2 is fully complete.

### 7.2 `withAuth()` API Compatibility

The `withAuth()` signature from `apps/web/lib/auth/with-auth.ts`:

```typescript
export function withAuth(
  handler: AuthHandler,
  options?: { role?: Role }
): (req: Request) => Promise<Response>
```

- **Role options available:** `'member'` (level 1) and `'admin'` (level 2) per `lib/auth/roles.ts`
- **SPEC-3 usage:**
  - `withAuth(handler)` — member-level routes (me, family, export, soft-delete)
  - `withAuth(handler, { role: 'admin' })` — admin routes (list members, view member, link-member, chapter management)
  - No `withAuth()` wrapping — public routes (`GET /api/chapters`)
- **`ctx.user` type:** `MemberRow` (alias for Prisma `Member`) — includes `id`, `email`, `role`, `deletedAt`, all profile fields
- **Soft-delete gate:** Already enforced inside `withAuth()` — if `member.deletedAt !== null`, returns 401 before calling the handler

### 7.3 Prisma Singleton

`apps/web/lib/db/prisma.ts` exports `prisma` as a `PrismaClient` singleton. All new service functions in `lib/members/member-service.ts` must import from this path. No new Prisma client instances should be created.

### 7.4 Missing SPEC-3 Models

At analysis time, `prisma.familyMember` and `prisma.chapter` do not exist in the web schema. The Implementer must run `pnpm prisma generate` (from `apps/web/`) after schema changes before any route handlers can reference these models without TypeScript errors.
