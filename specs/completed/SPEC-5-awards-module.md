# Feature Specification: Awards Module

> **Spec ID:** SPEC-5-awards-module
> **Status:** Draft
> **Author:** Utkal Nayak

---

## 1. Overview

### 1.1 Summary
Implement the awards data layer and API for OSA's annual recognition programme. Awards are publicly visible (no login required), but only admins can create, update, or delete records. Recipients may or may not be OSA members. Award photos are referenced by externally hosted URLs.

### 1.2 Goals
- [ ] Public can browse all awards without authentication
- [ ] Admin can create, update, and delete award records
- [ ] Optional photo reference via externally hosted URL (`photoUrl` in database)
- [ ] Awards can reference a member record (optional) or store a standalone recipient name

### 1.3 Non-Goals (Out of Scope)
- Award nomination submission by members (deferred)
- Voting or judging workflows (deferred)
- Awards display UI pages (covered in a frontend spec)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Public can list all awards, filterable by year and category | Must Have | No auth required |
| FR-02 | Public can view a single award record | Must Have | |
| FR-03 | Admin can create an award record | Must Have | |
| FR-04 | Admin can update an award record | Must Have | |
| FR-05 | Admin can delete an award record | Must Have | |
| FR-06 | Optional photo URL stored as text in DB | Should Have | |
| FR-07 | `recipient_member_id` optionally links to a member record | Should Have | Nullable FK |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Public read requires no auth | RLS: `SELECT` public on `awards` | |
| NFR-02 | Write operations restricted to admin | RLS + `withAuth()` guard | |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] `GET /api/awards` returns all awards (public, no auth needed)
- [ ] `GET /api/awards?year=2024` returns filtered results
- [ ] `GET /api/awards/:id` returns a single award
- [ ] `POST /api/awards` (admin) creates an award record
- [ ] `PATCH /api/awards/:id` (admin) updates an award record
- [ ] `DELETE /api/awards/:id` (admin) deletes an award record
- [ ] Non-admin `POST /api/awards` returns 403
- [ ] All tests passing

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Public list | No auth | `GET /api/awards` | Returns awards array |
| Filter by year | No auth | `GET /api/awards?year=2023` | Returns only 2023 awards |
| Admin create | Admin user | `POST /api/awards` with valid body | Award created, returned with id |
| Admin update | Admin user | `PATCH /api/awards/:id` | Award updated |
| Admin delete | Admin user | `DELETE /api/awards/:id` | Award removed, returns 204 |
| Member attempts create | Member-role user | `POST /api/awards` | Returns 403 |
| Award with member recipient | Admin user | `POST /api/awards` with valid `recipient_member_id` | FK stored, resolves on read |
| Award without member | Admin user | `POST /api/awards` with no `recipient_member_id` | `recipient_name` used, FK null |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Prisma, Zod, `withAuth(handler, 'admin')` for write routes, Supabase Storage SDK for photo uploads
- **Must Avoid:** Storing photos as base64 in the DB

### 4.2 Patterns to Follow
- Public routes: no `withAuth()` wrapper needed
- Admin routes: `withAuth(handler, 'admin')`
- Photo upload: upload to Supabase Storage bucket `award-photos`, store public URL in `photo_url`

### 4.3 Files/Modules to Create
- `prisma/schema.prisma` — add `awards` and `award_names` (reference table) models
- `lib/awards/award-service.ts` — CRUD logic
- `app/api/awards/route.ts` — GET (public), POST (admin)
- `app/api/awards/[id]/route.ts` — GET (public), PATCH/DELETE (admin)
- `lib/validation/award.schema.ts` — Zod schemas

### 4.4 Files NOT to Modify
- `lib/auth/with-auth.ts`
- `lib/db/prisma.ts`

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- SPEC-2 (foundation-auth) — `withAuth()` for admin routes
- SPEC-3 (member-module) — `members` table must exist for optional `recipient_member_id` FK

### 5.2 Downstream Impact
- Awards list page (future frontend spec) reads from this module

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should the awards list on the public website come from this API or from Sanity CMS? | Resolved | From this API (Supabase DB). Awards are structured member data, not editorial content. |
| Is there a fixed list of valid `award_name` values, or free-form text? | Resolved | Fixed list. Award names are seeded as a reference table. Admin selects from the list when creating a record. |

---

## 7. References

- [`docs/osa-architecture.md`](../../docs/osa-architecture.md) — `awards` schema and RLS policies

---

## Agent Workflow Tracking

### Phase 1: Analysis
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-5-awards-module/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-5-awards-module/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-5-awards-module/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-5-awards-module/04-qa-report.md`
