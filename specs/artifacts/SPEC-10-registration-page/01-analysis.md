# Phase 1: Analysis — SPEC-10 Member Registration Page

> **Phase:** 1 — Analyst
> **Date:** 2026-05-14
> **Spec:** SPEC-10-registration-page

---

## 1. Requirements Parsed

### Functional Requirements

| ID | Requirement | Status |
|----|-------------|--------|
| FR-01 | Step 1 — Account: email + password, skip if already logged in | Clear |
| FR-02 | Step 2 — Personal info: firstName (req), lastName (req), phone (opt), bio (opt) | Clear |
| FR-03 | Step 3 — Family info: spouseName (opt), dynamic children list (name, age, gender) | Clear |
| FR-04 | Step 4 — Address: street, city, state, zip, country (all req, country defaults "USA") | Clear |
| FR-05 | Per-step Zod validation before advancing | Clear |
| FR-06 | Back navigation preserves entered data | Clear |
| FR-07 | Final submit: call API with full profile payload, include JWT | Clear |
| FR-08 | On API success: redirect to `/membership` | Clear |
| FR-09 | Already-logged-in + complete profile → redirect to `/dashboard` | Clear |
| FR-10 | Children: dynamic add/remove, max 10 | Clear |
| FR-11 | Step indicator (e.g., "Step 2 of 4") | Clear |
| FR-12 | Form state preserved across Back navigation | Clear |

---

## 2. Codebase Findings

### 2.1 Correct API Endpoint

**The spec says `PATCH /api/users/me` — this endpoint does not exist.**

The NestJS users controller (`apps/api/src/modules/users/users.controller.ts`) exposes:
- `POST /api/users/me/profile` — creates or updates profile (idempotent upsert via `createOrUpdateProfile`)
- `PUT /api/users/me/profile` — updates only (requires profile to exist first)

**Conclusion:** Use `POST /api/users/me/profile`. It is the correct upsert endpoint.

### 2.2 CreateProfileDto Shape

From `apps/api/src/modules/users/dto/create-profile.dto.ts`:

```typescript
{
  firstName: string           // required, max 100
  lastName: string            // required, max 100
  spouseName?: string
  address?: {                 // preferred nested format
    street: string
    city: string
    state: string
    zip: string               // length 5-10
    country?: string
  }
  phone?: string              // must match /^\+?[1-9]\d{1,14}$/ (E.164)
  bio?: string                // max 500
  children?: Array<{
    name: string              // required
    age?: number
    gender?: string           // any string, backend is permissive
  }>
}
```

Spec-defined payload shape matches, with two corrections:
1. Address is a **nested object** (`address: {...}`), not flat fields
2. Phone must match E.164 format regex — the spec doesn't mention this constraint

### 2.3 Existing Zod Schemas (packages/validation)

`packages/validation/src/user.schema.ts` has only `firstName`, `lastName`, `phone`, `bio`. It lacks `spouseName`, `children`, `address`. The spec calls for a new `registration.schema.ts` file — this is the right approach rather than extending the existing schema.

The phone regex in `user.schema.ts` is `/^\+?[1-9]\d{1,14}$/` — must match this in the new Zod schema.

### 2.4 Session and JWT Access

- `apps/web/lib/auth/supabase-browser.ts` already exists (`createSupabaseBrowser()` factory)
- To get JWT for API call: `(await supabase.auth.getSession()).data.session?.access_token`
- API URL: `process.env.NEXT_PUBLIC_API_URL` is already set in `.env.local` (`http://localhost:3001`)
- No existing fetch utility in the web app — a simple inline `fetch` call is sufficient

### 2.5 Profile-exists Check

`GET /api/users/me` returns the user with an included `profile` field. If `profile` is not null, the profile is complete enough to skip registration. The frontend should:
1. On mount: call `supabase.auth.getSession()` (fast, local)
2. If session exists: call `GET /api/users/me` with Bearer token
3. If `user.profile` exists → redirect to `/dashboard`
4. If `user.profile` is null → skip Step 1 (already authenticated), start at Step 2
5. No session → start at Step 1

### 2.6 files/state NOT to conflict with

- `apps/web/app/register/page.tsx` — currently has the SPEC-2 minimal account form (stub). SPEC-10 replaces it entirely.
- `apps/web/app/login/` — not touched
- `apps/api/` — not touched; backend is complete

---

## 3. Resolved Open Questions

| Question | Resolution |
|----------|------------|
| Skip Step 1 if already authenticated? | **Yes.** Check session on mount. If session + no profile → start at Step 2. |
| Is bio needed in initial registration? | **Yes, optional.** Keep in Step 2 as an optional textarea. Users can leave it blank. |
| Supabase signUp error for duplicate email? | Supabase returns `"User already registered"` for duplicate email signUp. Frontend should handle this message. |
| Single page vs separate routes? | **Single page** (per spec preference). `step` state variable controls which step is shown. |

---

## 4. Edge Cases and Risks

| # | Edge Case | Handling |
|---|-----------|---------|
| E1 | User arrives at `/register` already logged in with complete profile | Redirect to `/dashboard` (FR-09) |
| E2 | User arrives already logged in but no profile yet | Skip Step 1, show Step 2 |
| E3 | User completes Step 1 (account creation) but Supabase signUp requires email verification | Show "check your email" message; form cannot proceed until verified (Supabase blocks login) |
| E4 | API call to `POST /api/users/me/profile` returns 401 | Show inline error — session likely expired; prompt to sign in again |
| E5 | API call returns 400 (validation error) | Show backend error message inline on final step |
| E6 | User adds a child, then clicks Back | Child data is preserved in top-level state |
| E7 | User removes a child incorrectly (off-by-one on index) | Use `filter((_, i) => i !== idx)` pattern — safe with React key |
| E8 | Phone field left empty | Phone is optional — send `null` or omit; do NOT send empty string (backend validates format) |
| E9 | Country left blank on Step 4 | Default to `'USA'` — pre-fill the input, included in Zod `default()` |

---

## 5. Files to Create / Modify

| File | Action |
|------|--------|
| `packages/validation/src/registration.schema.ts` | Create — Zod schemas: AccountSchema, PersonalInfoSchema, FamilyInfoSchema, AddressSchema, ChildSchema, RegistrationPayloadSchema |
| `packages/validation/src/index.ts` | Modify — add `export * from './registration.schema'` |
| `apps/web/app/register/page.tsx` | Replace — full multi-step client component |

No other files need to change.

---

## 6. Questions for the Author

None — all open questions resolved via codebase inspection.
