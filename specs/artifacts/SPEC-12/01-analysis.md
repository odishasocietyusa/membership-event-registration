# SPEC-12 Analysis: Member Onboarding & Dashboard

## Scope (Revised after requirements clarification)

This spec covers the full post-login journey:
1. Post-login redirect logic (callback route)
2. Registration page (revised for social login)
3. Dashboard page

---

## Existing Code Assessment

### `/register/page.tsx`
- Currently a 4-step Client Component: Account → Personal → Family → Address
- **Step 1 (Account)** uses `supabase.auth.signUp()` — irrelevant for social login users
- When user is already authenticated, it currently shows "you're already signed in" message
- After address step, pushes to `/membership` (stub)
- **Required change**: detect authenticated users, skip step 1, add membership type selection as final step, replace "Complete registration" with "Proceed to Payment" + "Cancel"

### `/membership/page.tsx`
- Currently a stub with "Not yet implemented"
- **Not needed as a UI page** — payment is triggered directly from `/register` via `POST /api/payments/checkout-session`
- Can remain as a stub or be repurposed later

### `app/api/auth/callback/route.ts`
- Currently just exchanges code for session and redirects to `/dashboard`
- **Required change**: after exchangeCodeForSession, check member profile completeness and redirect accordingly

### `lib/auth/with-auth.ts`
- JIT-creates a Member row on first login (email, userId, fullName from OAuth metadata)
- `fullName` may be populated from Google metadata at first login
- **Implication**: `fullName` alone is not a reliable "registration complete" signal — need to check if address/profile data is saved

### Member model — "Registration Complete" Definition
A member is considered registered when:
- `fullName` is not null (personal info saved via `/api/users/me/profile`)
- `address` JSON field is not null (address saved)

A member is considered a paying member when:
- `memberStatus` = ACTIVE

### Post-login Redirect Decision Tree
```
session established?
  └─ NO  → /login
  └─ YES → fetch member record
       └─ address is null? → /register  (incomplete profile)
       └─ memberStatus != ACTIVE? → /register  (no active membership)
       └─ memberStatus = ACTIVE → /dashboard
```

### `GET /api/memberships/types`
Returns available membership fee tiers. Need to verify response shape and filter out honorary types (price = $0 or type not in public list).

### `POST /api/payments/checkout-session`
Creates a Stripe Checkout session. Returns `{ url }`. The `/register` page will redirect to this URL after user selects membership type and clicks "Proceed to Payment".

---

## Files to Create

### `lib/auth/supabase-server.ts`
Server-side Supabase client using `createServerClient` from `@supabase/ssr` with `cookies()` from `next/headers`. Used by dashboard and callback route to get session on server.

### `app/dashboard/sign-out-button.tsx`
Client Component. Calls `createSupabaseBrowser().auth.signOut()` then `router.push('/login')`.

---

## Key Risks

1. **`fullName` from Google OAuth**: `withAuth` already captures `fullName` from `user_metadata.full_name` on first login. If Google provides a name, `fullName` will be set even before the user fills in the registration form. Use `address` field as the registration completion signal instead.

2. **Membership type selection**: Need to verify `GET /api/memberships/types` returns price info and which types to show/hide for regular users.

3. **Stripe redirect after payment**: The checkout-session success URL should point to `/dashboard`. Need to verify what the current success URL is set to in `POST /api/payments/checkout-session`.

4. **Cancel flow**: Cancelling registration sends user to `/`. The home page needs a lightweight auth check to show the "Complete registration" prompt — this must be done client-side to avoid slowing down the static home page render.
