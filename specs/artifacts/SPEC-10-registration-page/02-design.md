# Phase 2: Design — SPEC-10 Member Registration Page

> **Phase:** 2 — Architect
> **Date:** 2026-05-14
> **Spec:** SPEC-10-registration-page

---

## 1. Architecture

### 1.1 Single-file multi-step client component

The entire registration flow lives in `apps/web/app/register/page.tsx` as a single `'use client'` component. A `step` state variable (1–4) controls which section renders.

Form data is accumulated in a single top-level state object (`formData`) across all steps. This prevents data loss on Back navigation (FR-06, FR-12).

```
page.tsx
  ├── useEffect: session check → redirect or set startStep
  ├── formData state: { account, personal, family, address }
  ├── step: 1 | 2 | 3 | 4
  ├── StepIndicator (inline, "Step N of 4")
  ├── step === 1 → <AccountStep>    (or skipped if already authenticated)
  ├── step === 2 → <PersonalStep>
  ├── step === 3 → <FamilyStep>     (children add/remove)
  └── step === 4 → <AddressStep>    (submit → POST /api/users/me/profile)
```

### 1.2 State shape

```typescript
type Child = { name: string; age: string; gender: string }

type FormData = {
  account: { email: string; password: string; confirmPassword: string }
  personal: { firstName: string; lastName: string; phone: string; bio: string }
  family: { spouseName: string; children: Child[] }
  address: { street: string; city: string; state: string; zip: string; country: string }
}
```

Note: `age` is stored as `string` in form state for controlled input compatibility, cast to `number` (via `parseInt`) only in the submission payload.

---

## 2. Component Design

### 2.1 Session bootstrap (useEffect)

```typescript
useEffect(() => {
  async function checkSession() {
    const supabase = createSupabaseBrowser()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setStartStep(1); return }

    // Already authenticated — check for existing profile
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const user = await res.json()
      if (user.profile) {
        router.replace('/dashboard')  // profile complete — skip registration
        return
      }
    }
    setStep(2)  // authenticated but no profile — skip account step
  }
  checkSession()
}, [])
```

### 2.2 Step 1 — Account

Fields: email, password (min 8), confirmPassword
Zod schema: `AccountSchema`
Action on Next: `supabase.auth.signUp({ email, password, options: { emailRedirectTo: origin + '/auth/confirm' } })`

Special cases:
- Supabase returns `"User already registered"` for duplicate email → show as field error
- On success: Supabase may require email verification before JWT is valid. Show "Check your email to verify your account" and stop (do not advance to Step 2 until user verifies).

### 2.3 Step 2 — Personal Info

Fields: firstName (required), lastName (required), phone (optional), bio (optional)
Zod schema: `PersonalInfoSchema`
Action on Next: validate → advance to Step 3

### 2.4 Step 3 — Family Info

Fields: spouseName (optional text input), children (dynamic list)
Each child row: name (text), age (number input, min 0 max 25), gender (select: M / F / Other)
Buttons: "Add child" (disabled when children.length >= 10), "Remove" per row
Zod schema: `FamilyInfoSchema`
Action on Next: validate → advance to Step 4

### 2.5 Step 4 — Address + Submit

Fields: street (req), city (req), state (req), zip (req), country (req, pre-filled "USA")
Zod schema: `AddressSchema`
Action on Submit:
1. Validate address fields
2. Get session JWT: `(await supabase.auth.getSession()).data.session?.access_token`
3. Build payload and POST to `/api/users/me/profile`
4. On success: `router.push('/membership')`
5. On error: display API error message

---

## 3. Zod Schemas (`packages/validation/src/registration.schema.ts`)

```typescript
export const AccountSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export const PersonalInfoSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Enter a valid phone number (e.g. +12125551234)').optional().or(z.literal('')),
  bio: z.string().max(500, 'Bio must be 500 characters or fewer').optional().or(z.literal('')),
})

export const ChildSchema = z.object({
  name: z.string().min(1, 'Child name is required'),
  age: z.string().regex(/^\d+$/, 'Age must be a number').refine((v) => parseInt(v) <= 25, 'Age must be 25 or under'),
  gender: z.enum(['M', 'F', 'Other'], { errorMap: () => ({ message: 'Select a gender' }) }),
})

export const FamilyInfoSchema = z.object({
  spouseName: z.string().optional().or(z.literal('')),
  children: z.array(ChildSchema).max(10),
})

export const AddressSchema = z.object({
  street: z.string().min(1, 'Street is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(1, 'State is required'),
  zip: z.string().min(5, 'ZIP code is required').max(10),
  country: z.string().min(1, 'Country is required'),
})
```

**Note on phone:** Both `z.string().regex(...)` and `z.literal('')` are accepted — an empty string means the user left it blank (treated as omitted in the payload). The regex only fires for non-empty values.

---

## 4. API Payload Construction

```typescript
const payload = {
  firstName: formData.personal.firstName,
  lastName: formData.personal.lastName,
  phone: formData.personal.phone || undefined,
  bio: formData.personal.bio || undefined,
  spouseName: formData.family.spouseName || undefined,
  children: formData.family.children.map((c) => ({
    name: c.name,
    age: parseInt(c.age, 10),
    gender: c.gender,
  })),
  address: {
    street: formData.address.street,
    city: formData.address.city,
    state: formData.address.state,
    zip: formData.address.zip,
    country: formData.address.country,
  },
}
```

---

## 5. Step Indicator

Simple inline text, no styling:

```tsx
<p>Step {step} of 4</p>
```

When Step 1 is skipped (user already authenticated), step indicator shows Step 2–4 as "Step 2 of 4" through "Step 4 of 4". The total always reads 4 regardless of whether Step 1 was skipped — keeps the display consistent.

---

## 6. Implementation Sequence

1. Add `registration.schema.ts` to `packages/validation/src/`
2. Export from `packages/validation/src/index.ts`
3. Replace `apps/web/app/register/page.tsx` with multi-step form
4. Test TypeScript build (`npx tsc --noEmit` in `apps/web/`)
5. Write unit tests for route/logic

---

## 7. Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single `page.tsx` file, no sub-component files | Spec allows this and the form is self-contained. Four step blocks in one file is readable. |
| `age` stored as string in form state | Controlled inputs work best with strings; parse to int only at submission. |
| Phone accepts empty string (or undefined) | Optional field — sending `undefined` omits it from the payload cleanly. |
| Show "check email" after signUp and stop flow | Supabase blocks login until email is verified; advancing would fail at Step 4 API call anyway. |
| `router.replace('/dashboard')` for existing profile | Replace (not push) prevents Back-button returning to `/register` after redirect. |
| Keep `totalSteps = 4` even when Step 1 skipped | Avoids confusing "Step 1 of 3" display for returning users. |
