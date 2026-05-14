# Phase 3: Implementation Log — SPEC-10 Member Registration Page

> **Phase:** 3 — Implementer
> **Date:** 2026-05-14
> **FRs covered:** FR-01 through FR-12

---

## Files Created

| File | Purpose |
|------|---------|
| `packages/validation/src/registration.schema.ts` | Zod schemas: AccountSchema, PersonalInfoSchema, ChildSchema, FamilyInfoSchema, AddressSchema + inferred types |

## Files Modified

| File | Change |
|------|--------|
| `packages/validation/src/index.ts` | Added `export * from './registration.schema'` |
| `apps/web/app/register/page.tsx` | Full replacement: single `'use client'` multi-step form (Steps 1–4) |
| `apps/web/package.json` | Added `@osa/validation: workspace:*` dependency |

---

## Key Implementation Decisions

- **Spec correction applied:** Endpoint is `POST /api/users/me/profile`, not `PATCH /api/users/me` as written in the spec.
- **`@osa/validation` added as workspace dep** — package existed but wasn't wired to the web app. Added via `workspace:*` and ran `pnpm install`.
- **Single `page.tsx` file** — all 4 steps in one client component. Step controlled by `step: 1|2|3|4|null` state (null = loading/bootstrapping).
- **`age` stored as string** — controlled `<input type="number">` works best with string state; parsed to `parseInt()` only in the submission payload.
- **Phone accepts empty string** — `z.string().regex(...).or(z.literal(''))` passes validation for blank phone, then `|| undefined` in the payload omits it.
- **Step 1 email-verified gate** — after `signUp()` success, `accountCreated` flag is set. The form shows "check your email" and does not advance to Step 2. The user must verify, then sign in from `/login`, then return to `/register` (which skips to Step 2 since they now have a session).
- **Per-child validation errors** deferred to `validateChild()` inline for display, with Zod array errors surfaced at the fieldset level for form-submit attempts.
- **`router.replace('/dashboard')` for existing-profile users** — prevents Back-button loop back into `/register`.

---

## Zod Schema Notes

`PersonalInfoSchema` phone field:
```typescript
phone: z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Enter a valid phone number (e.g. +12125551234)')
  .or(z.literal(''))
  .optional()
```
This matches the NestJS backend's `@Matches(/^\+?[1-9]\d{1,14}$/)` validator. Empty string passes (treated as "not provided").

`ChildSchema` age field:
```typescript
age: z
  .string()
  .regex(/^\d+$/, 'Age must be a number')
  .refine((v) => parseInt(v, 10) <= 25, 'Age must be 25 or under')
```
Stored as string in state; cast to `number` at submission.
