# Feature Specification: Member Module

> **Spec ID:** SPEC-3-member-module
> **Status:** Draft
> **Author:** Utkal Nayak

---

## 1. Overview

### 1.1 Summary
Implement the core member data layer: the `members`, `family_members`, and `chapters` tables, their API routes, RLS policies, and the admin account-linking flow. This is the primary data module — payments, awards, and messages all reference member records.

### 1.2 Goals
- [ ] Member CRUD API routes with role-based access
- [ ] Family members managed under a primary member
- [ ] Chapters seeded and publicly readable
- [ ] Admin can link a Google auth account to an existing member record
- [ ] Member controls their own profile visibility settings
- [ ] Profile data exportable (GDPR)
- [ ] Soft-delete (never hard-delete a member row)

### 1.3 Non-Goals (Out of Scope)
- Payment and membership-type logic (covered in SPEC-4)
- Member-to-member messaging (covered in SPEC-6)
- Awards (covered in SPEC-5)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Member can view and update their own profile | Must Have | name, phone, address, souvenir preference |
| FR-02 | Member can set profile visibility (show_phone, show_email, show_chapter) | Must Have | stored as jsonb |
| FR-03 | Member can add/edit/remove family members | Must Have | spouse, child, other |
| FR-04 | Admin can list all members with pagination | Must Have | |
| FR-05 | Admin can view any member's full profile | Must Have | |
| FR-06 | Admin can link a `user_id` to an existing member record | Must Have | Account linking flow |
| FR-07 | Admin can suspend or reactivate a member | Must Have | `member_status` field |
| FR-08 | Member can export all their data as JSON (GDPR) | Must Have | Aggregates all related records |
| FR-09 | Member account soft-delete sets `deleted_at`; row is never removed | Must Have | |
| FR-10 | Chapters are publicly readable without authentication | Must Have | Seeded reference data |
| FR-11 | Admin can manage chapters (create, update) | Should Have | |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | RLS enforced at DB layer | All policies active | Not just application-level checks |
| NFR-02 | No member email exposed to other members | Enforced server-side | Message relay in SPEC-6 |
| NFR-03 | Soft-delete filtering | All queries exclude `deleted_at IS NOT NULL` by default | |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] `GET /api/members/me` returns authenticated member's own record
- [ ] `PUT /api/members/me` updates profile fields
- [ ] `GET /api/members/me/export` returns full JSON data dump
- [ ] `DELETE /api/members/me` sets `deleted_at`, subsequent login returns 401
- [ ] `GET /api/members/me/family` returns family members list
- [ ] `POST /api/members/me/family` adds a family member
- [ ] `DELETE /api/members/me/family/:id` removes a family member
- [ ] `GET /api/members` (admin) returns paginated list
- [ ] `POST /api/admin/link-member` links `user_id` to member by email
- [ ] `GET /api/chapters` returns all chapters (public, no auth)
- [ ] RLS: member cannot read another member's row via direct DB query
- [ ] All tests passing

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| View own profile | Authenticated member | `GET /api/members/me` | Returns own record, not another member's |
| Update own profile | Authenticated member | `PUT /api/members/me` with valid body | Record updated, returns updated member |
| Update another member | Member-role user | `PUT /api/members/:other-id` | Returns 403 |
| Add family member | Authenticated member | `POST /api/members/me/family` | Family member created, linked to primary |
| GDPR export | Authenticated member | `GET /api/members/me/export` | Returns JSON with member + family + payments + messages |
| Soft delete | Authenticated member | `DELETE /api/members/me` | `deleted_at` set; login attempt returns 401 |
| Admin list members | Admin user | `GET /api/members` | Returns paginated member list |
| Admin link account | Admin user | `POST /api/admin/link-member` with email + user_id | `user_id` written to matching member row |
| Link non-existent member | Admin user | `POST /api/admin/link-member` with unknown email | Returns 404 |
| Public chapters | No auth | `GET /api/chapters` | Returns all chapters |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Prisma, Zod for request validation, `withAuth()` from SPEC-2
- **Must Avoid:** Exposing member email in any public or member-to-member API response

### 4.2 Patterns to Follow
- Soft-delete pattern: `where: { deletedAt: null }` on all member queries
- `withAuth(handler, 'admin')` for admin-only routes
- Port business logic from `apps/api/src/modules/users/users.service.ts`

### 4.3 Files/Modules to Create
- `prisma/schema.prisma` — add `members`, `family_members`, `chapters` models
- `lib/members/member-service.ts` — CRUD logic ported from `users.service.ts`
- `app/api/members/me/route.ts`
- `app/api/members/me/family/route.ts`
- `app/api/members/me/family/[id]/route.ts`
- `app/api/members/me/export/route.ts`
- `app/api/members/[id]/route.ts` — admin only
- `app/api/admin/link-member/route.ts`
- `app/api/chapters/route.ts`
- `lib/validation/member.schema.ts` — Zod schemas

### 4.4 Files NOT to Modify
- `lib/auth/with-auth.ts` — auth layer from SPEC-2

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- SPEC-2 (foundation-auth) must be complete — `withAuth()` and Prisma singleton required

### 5.2 Downstream Impact
- SPEC-4 (payments): `payments.member_id` FK references `members.id`
- SPEC-5 (awards): `awards.recipient_member_id` FK references `members.id`
- SPEC-6 (messages): `messages.sender_member_id` and `recipient_member_id` reference `members.id`

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should chapter president be editable via API or only via Supabase Studio? | Resolved | Supabase Studio only. No API endpoint needed — president changes are rare (annual). |
| What fields are included in the GDPR export — just DB records or also Sanity content? | Resolved | DB records only: member profile, family members, payments, and messages. Sanity content is public and not personal data. |

---

## 7. References

- [`docs/osa-architecture.md`](../../docs/osa-architecture.md) — `members`, `family_members`, `chapters` schema and RLS policies
- [`apps/api/src/modules/users/users.service.ts`](../../apps/api/src/modules/users/users.service.ts) — business logic to port

---

## Agent Workflow Tracking

### Phase 1: Analysis
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-3-member-module/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-3-member-module/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-3-member-module/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-3-member-module/04-qa-report.md`
