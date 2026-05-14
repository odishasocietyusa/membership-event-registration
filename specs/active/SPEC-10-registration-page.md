# Feature Specification: Member Registration Page

> **Spec ID:** SPEC-10-registration-page
> **Status:** Draft
> **Author:** Utkal Nayak
> **Created:** 2026-05-14

---

## 1. Overview

### 1.1 Summary

Implement the `/register` page as a multi-step member onboarding form. New users who arrive at this page (either after account creation or as a fresh visitor) complete a guided flow that collects their Supabase Auth credentials, personal profile details, family information, and mailing address. On submission the frontend calls the existing NestJS API to create/update the user's `Profile` record, then redirects to `/membership` to select a membership tier.

### 1.2 Goals

- [ ] Collect all fields required by the `users` and `profiles` database tables
- [ ] Collect family information (`spouseName`, and a dynamic list of children with name/age/gender)
- [ ] Multi-step form UI with clear step indicators (no CSS until Figma is delivered — structure only)
- [ ] Client-side Zod validation before each step advance
- [ ] On completion, POST profile data to `PATCH /api/users/me` (NestJS backend)
- [ ] Redirect to `/membership` after successful profile save

### 1.3 Non-Goals (Out of Scope)

- Payment processing (covered in SPEC-4 / `/membership` page)
- OAuth Google signup (SPEC-2 already covers auth; `/login` handles it)
- Avatar upload (no file upload until storage spec is written)
- Admin-facing member management
- Email verification flow (Supabase Auth handles this internally)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Step 1 — Account: collect email + password (if not already logged in via Google) | Must Have | Skip if user already has a Supabase session |
| FR-02 | Step 2 — Personal info: firstName (required), lastName (required), phone (optional), bio (optional) | Must Have | Maps to `profiles` table |
| FR-03 | Step 3 — Family info: spouseName (optional); dynamic list of children each with name, age, gender | Must Have | Maps to `profiles.spouseName` and `profiles.children` JSON |
| FR-04 | Step 4 — Address: street (required), city (required), state (required), zip (required), country (required, default "USA") | Must Have | Maps to `profiles.address` JSON |
| FR-05 | Each step validates its own fields with Zod before advancing | Must Have | Show inline field-level errors |
| FR-06 | "Back" navigation between steps without losing entered data | Must Have | State held in React state or form library |
| FR-07 | On final step submit: call `PATCH /api/users/me` with full profile payload | Must Have | Uses Supabase session JWT as Bearer token |
| FR-08 | On API success: redirect to `/membership` | Must Have | |
| FR-09 | If user is already logged in and already has a complete profile: redirect to `/dashboard` | Should Have | Avoid re-registering |
| FR-10 | Children can be dynamically added (up to 10) and removed | Must Have | Add/Remove buttons per child row |
| FR-11 | Step indicator showing current step number and total | Must Have | Unstyled — e.g., "Step 2 of 4" text |
| FR-12 | Form state is preserved if the user navigates Back between steps | Must Have | |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | No CSS / styling | Zero styling | Per project constraint — Figma not yet delivered |
| NFR-02 | TypeScript strict mode | No `any` types | Use shared Zod schemas from `packages/validation` |
| NFR-03 | Server-side error surfaced to user | Display API error message | e.g., "Email already in use" |
| NFR-04 | Accessible form markup | Use `<label>`, `<fieldset>`, `<legend>` | Required even without styling |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done

- [x] All 4 steps render with correct fields
- [x] Zod validation prevents step advance when required fields are empty or invalid
- [x] Inline error messages shown per field
- [x] Children add/remove works correctly (minimum 0, maximum 10)
- [x] Successful submission calls `POST /api/users/me/profile` with correct payload shape
- [x] Redirect to `/membership` on success
- [x] No CSS/styling added (plain HTML elements only)
- [x] TypeScript builds without errors

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Happy path (new user) | User not logged in | Fills all steps correctly and submits | Profile created, redirected to `/membership` |
| Already logged in + profile exists | User has active session + complete profile | Lands on `/register` | Redirected to `/dashboard` |
| Step advance blocked | Step 2 — firstName left empty | User clicks Next | Error shown under firstName, step does not advance |
| Invalid email | Step 1 — malformed email entered | User clicks Next | Zod error shown, step does not advance |
| Add/remove child | Step 3 | User clicks "Add child" then fills name/age/gender, then "Remove" | Child row added; removal deletes that row only |
| API error | Backend returns 409 (email in use) | User submits Step 1 | Error displayed to user inline |
| Back navigation | User is on Step 3 | Clicks Back | Returns to Step 2 with Step 2 data still populated |
| Country defaults to USA | Step 4 renders | No user interaction | Country field pre-filled with "USA" |

---

## 4. Technical Constraints

### 4.1 Technologies

- **Must Use:** Next.js 15 App Router, React 19, TypeScript, Zod (from `packages/validation`)
- **Must Use:** Supabase client (`@supabase/ssr`) for session access + JWT retrieval
- **Must Avoid:** Any CSS, Tailwind classes, or inline styles
- **Must Avoid:** External form libraries (React Hook Form, Formik) — plain React state is sufficient for this form
- **Must Avoid:** Any `any` TypeScript types

### 4.2 API Contract

The registration page calls the existing NestJS API. The relevant endpoint is:

```
PATCH /api/users/me
Authorization: Bearer <supabase-jwt>
Content-Type: application/json

{
  "firstName": "string",        // required
  "lastName": "string",         // required
  "phone": "string | null",     // optional
  "bio": "string | null",       // optional
  "spouseName": "string | null", // optional
  "children": [                  // optional, can be empty array
    { "name": "string", "age": number, "gender": "M" | "F" | "Other" }
  ],
  "address": {                   // required
    "street": "string",
    "city": "string",
    "state": "string",
    "zip": "string",
    "country": "string"
  }
}
```

For Step 1 (account creation), use Supabase Auth:
```typescript
supabase.auth.signUp({ email, password })
```

### 4.3 Zod Schema (to add to `packages/validation`)

```typescript
// packages/validation/src/registration.schema.ts

export const ChildSchema = z.object({
  name: z.string().min(1),
  age: z.number().int().min(0).max(25),
  gender: z.enum(['M', 'F', 'Other']),
})

export const AddressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
  country: z.string().min(1).default('USA'),
})

export const PersonalInfoSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional().nullable(),
  bio: z.string().optional().nullable(),
})

export const FamilyInfoSchema = z.object({
  spouseName: z.string().optional().nullable(),
  children: z.array(ChildSchema).max(10).default([]),
})
```

### 4.4 Files to Create/Modify

| File | Action | Notes |
|------|--------|-------|
| `apps/web/app/register/page.tsx` | Modify | Replace stub with multi-step form |
| `apps/web/lib/supabase/client.ts` | Create (if not exists) | Browser Supabase client singleton |
| `packages/validation/src/registration.schema.ts` | Create | Zod schemas for all 4 steps |
| `packages/validation/src/index.ts` | Modify | Re-export new schemas |

### 4.5 Files NOT to Modify

- `apps/api/` — backend is already implemented; no changes needed
- `apps/web/app/demo/page.tsx` — already updated
- `apps/web/app/login/` — auth is handled separately

---

## 5. Dependencies

### 5.1 Upstream Dependencies

- SPEC-2 (foundation-auth): Supabase client setup and session handling must exist. Check `apps/web/lib/supabase/` for existing client utilities before creating new ones.
- NestJS `PATCH /api/users/me` endpoint must be running locally (port 3001)

### 5.2 Downstream Impact

- `/membership` page (SPEC-4 frontend, not yet written): expects user to have a complete profile and active session before landing there
- `/dashboard` page: once profile exists, users should not be re-directed through `/register`

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should Step 1 (account creation) be skipped entirely if user is already authenticated via Google? | Open | |
| Is `bio` field needed in the initial registration or can it be edited later in profile settings? | Open | |
| What is the exact Supabase `signUp` error message for "email already in use"? | Open | To be discovered during implementation |
| Should the form use a single page with hidden steps or true separate routes (e.g., `/register/step-1`)? | Open | Single page preferred (simpler state management) |

---

## 7. References

- `apps/api/prisma/schema.prisma` — `Profile` model (lines 94–111): defines all fields
- `apps/api/src/modules/users/` — NestJS users module with `PATCH /me` endpoint
- `specs/active/SPEC-2-foundation-auth.md` — Supabase Auth setup and session handling
- `specs/active/SPEC-3-member-module.md` — Member data layer spec (backend)
- `apps/web/app/demo/page.tsx` — Developer demo page (already updated to `available: true`)
- [Prisma Profile model](../../../apps/api/prisma/schema.prisma)

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation

### Phase 1: Analysis
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-10-registration-page/01-analysis.md`

### Phase 2: Design
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-10-registration-page/02-design.md`

### Phase 3: Implementation
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-10-registration-page/03-implementation.md`
- **Note:** Endpoint corrected from `PATCH /api/users/me` → `POST /api/users/me/profile`

### Phase 4: QA & Testing
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-10-registration-page/04-qa-report.md`
- **Tests:** 245/245 passing (29 new REG-xx schema tests added)
