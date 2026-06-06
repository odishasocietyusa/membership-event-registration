# Phase 1: Requirement Analysis

> **Spec:** SPEC-5-awards-module
> **Analyst Agent:** Claude Code
> **Date:** 2026-05-14
> **Status:** Complete

---

## 1. Spec Understanding

### 1.1 Feature Summary
Build the awards data layer + REST API for OSA's annual recognition programme.
- Public (no auth) can list/filter and read individual award records.
- Admins can create, update, and delete award records.
- The award photo is handled as an externally hosted URL string (`awards.photo_url`) supplied in the JSON payload (e.g. from Google Drive or another external hosting provider).
- Award names are constrained to a fixed seeded list (reference table) — not free-form text.
- A recipient may optionally link to an existing `members` row via `recipient_member_id`; otherwise the human-readable `recipient_name` is used.

### 1.2 Key Objectives
1. Persist award records in Supabase Postgres via Prisma with optional FK to `members`.
2. Provide public read endpoints and admin-only write endpoints, reusing the existing `withAuth(..., { role: 'admin' })` guard.
3. Accept an optional, externally hosted `photoUrl` link in create/update operations.

---

## 2. Requirements Breakdown

### 2.1 Extracted Requirements

| ID    | Requirement                                                                  | Type          | Complexity | Dependencies        |
|-------|------------------------------------------------------------------------------|---------------|------------|---------------------|
| REQ-01 | Public `GET /api/awards` lists awards; filterable by `year` and `category`  | Functional    | Low        | DB schema           |
| REQ-02 | Public `GET /api/awards/:id` returns single award                           | Functional    | Low        | DB schema           |
| REQ-03 | Admin `POST /api/awards` creates an award record (including `photoUrl` text)  | Functional    | Low        | `withAuth(admin)`, `award_names` seed |
| REQ-04 | Admin `PUT /api/awards/:id` updates an award record                         | Functional    | Low        | REQ-03              |
| REQ-05 | Admin `DELETE /api/awards/:id` deletes an award record; returns 204         | Functional    | Low        | REQ-03              |
| REQ-07 | `recipient_member_id` is nullable FK → `members.id`                         | Functional    | Low        | SPEC-3 `members`    |
| REQ-08 | Award names constrained to a fixed seeded list (`award_names` reference)    | Functional    | Low        | seed.ts             |
| REQ-09 | Non-admin write attempts return 403                                         | NonFunctional | Low        | `withAuth(admin)`   |

### 2.2 Implicit Requirements
- [x] Zod validation for create/update payloads (including URL format check for optional `photoUrl`) and the `year`/`category` query params.
- [x] `award_name` value supplied by the admin must exist in `award_names` reference table (FK enforces this; service should surface a 400 on invalid name).
- [x] `recipient_member_id`, when supplied, must reference an existing member (FK enforces; surface 400 on bad id).
- [x] `category` is an enum `nomination | competition` (per `docs/osa-architecture.md`).
- [x] At least one of `recipient_name` or `recipient_member_id` must be present (otherwise the award has no recipient).
- [x] Response shape mirrors SPEC-3: JSON via plain `new Response(...)`, with `serviceErrorToResponse` mapping NOT_FOUND→404, CONFLICT→409, FORBIDDEN→403.
- [x] Tests for service + each route, mirroring `lib/members/member-service.test.ts` and `app/api/members/me/route.test.ts` patterns.

### 2.3 Edge Cases Identified
1. **Unknown `award_name`** on create/update → 400 (FK violation P2003 surfaced).
2. **Unknown `recipient_member_id`** → 400.
3. **Neither recipient_name nor recipient_member_id** provided → 400 (Zod refinement).
4. **Filter `year=abc`** → 400 (Zod coerce).
5. **DELETE on non-existent id** → 404.
6. **`recipient_member_id` references soft-deleted member** → allow (historical award shouldn't disappear because member was deactivated).

---

## 3. Scope Validation

### 3.1 In Scope (Confirmed)
- Prisma models `awards` and `award_names`.
- CRUD service in `lib/awards/award-service.ts`.
- Routes: `app/api/awards/route.ts`, `app/api/awards/[id]/route.ts`.
- Zod schemas in `lib/validation/award.schema.ts`.
- Seed entry in `prisma/seed.ts` for the fixed award-name list.
- Unit tests for service + route handlers.

### 3.2 Out of Scope (Confirmed)
- Direct photo upload endpoint (`POST /api/awards/:id/photo`) and Supabase Storage integration.
- Award nomination submission workflow.
- Voting / judging workflows.
- Public UI for displaying awards (separate frontend spec).
- A `GET /api/award-names` endpoint to fetch the reference list (not required by acceptance criteria).
- RLS policy authoring (the API uses the service-role key via `supabaseAdmin`; RLS is documented in the architecture doc but not part of this code change).

### 3.3 Ambiguous (Needs Clarification)
None blocking. Assumptions made and documented below; flag at design review if any are wrong.

**Assumptions (proceed unless team lead corrects):**
- A1. **Fixed seed list of award names** — the seed list itself wasn't included in the spec. Will seed a small placeholder list (e.g. `Community Service Award`, `Lifetime Achievement Award`, `Youth Excellence Award`, `Cultural Ambassador Award`). Team lead can extend later.
- A2. **`award_names` shape** — `id: text PK` (slug, mirrors `chapters`) + `displayName: text`. `awards.award_name` stores the slug FK. Matches the `chapters` precedent.
- A3. **`category` enum values** — `nomination` and `competition`, per architecture doc.
- A4. **Photo URL format** — Validated via Zod's `.url()` check as an optional text string.
- A5. **Award `id`** — `uuid` (`@default(uuid())`), matching `Member` precedent.
- A6. **Filter query params** — `year` (int) and `category` (enum); both optional; combinable. No pagination required by spec (left as a future enhancement).
- A7. **At least one recipient identifier required** — enforced in Zod, not at the DB level.

---

## 4. Risk Assessment

| Risk                                                          | Likelihood | Impact | Mitigation                                                                 |
|---------------------------------------------------------------|------------|--------|----------------------------------------------------------------------------|
| Public endpoint accidentally guarded by `withAuth`             | Low        | High   | Tests explicitly call public routes with no Authorization header.          |
| FK violation messages leak Prisma internals                    | Low        | Low    | Map P2003 → 400 with stable message in `serviceErrorToResponse`.           |
| `recipient_member_id` FK to soft-deleted member confuses callers | Low      | Low    | Service returns the member relation as-is; caller decides display. Documented. |

---

## 5. Questions for User

None blocking. Assumptions A1–A7 above proceed by default; team lead can amend at design review.

---

## 6. Recommendations

### 6.1 Suggested Additions
- None at this phase; keep scope tight.

### 6.2 Suggested Simplifications
- Skip pagination on `GET /api/awards` — annual award counts are small (tens, not thousands).
- Skip a public `GET /api/award-names` endpoint until the frontend spec actually needs it.

### 6.3 Technical Concerns
- The existing service uses `supabaseAdmin` (service-role) for auth user lookup; the same client can be reused for Storage uploads. No new client needed.
- `prisma.member` is now generated; FK from `awards.recipient_member_id` will surface as a relation on the `Member` model. Add it as the inverse side for type completeness (small touch to a "read-only" model boundary — flagged for team lead review; alternative is `@relation` without back-reference which Prisma also supports).

---

## 7. Analysis Summary

### Ready for Design Phase?
- [x] All requirements understood
- [x] No blocking questions remain
- [x] Scope is clearly defined
- [x] Risks are acceptable

**Recommendation:** ✅ Proceed to Design

---

## Handoff to Design Agent

**Key Context for Designer:**
1. Mirror the SPEC-3 (member-module) patterns exactly: service in `lib/awards/`, routes in `app/api/awards/`, Zod schemas in `lib/validation/award.schema.ts`, errors mapped via a `serviceErrorToResponse` helper.
2. Award names are a fixed seeded list — model as a separate `AwardName` reference table with text-slug PK (matches `Chapter`). `awards.award_name` is a FK to `award_names.id`.
3. Public routes (`GET`s) must NOT use `withAuth`. Admin routes use `withAuth(handler, { role: 'admin' })`.
4. Photo URL is an optional field (`photoUrl: z.string().url().optional()`) in create/update JSON bodies.
5. Adding `awards` relation to the `Member` model touches what's nominally a read-only file boundary — call this out for team-lead approval. Alternative: declare the FK without back-relation (Prisma allows this).
