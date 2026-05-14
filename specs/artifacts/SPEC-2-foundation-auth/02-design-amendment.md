# SPEC-2 Amendment Design — Email/Password Auth

> **Phase:** 2 — Architect
> **Date:** 2026-05-14

---

## 1. Browser Client Singleton

**File:** `lib/auth/supabase-browser.ts`

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

Exported as a factory (not a singleton constant) because `createBrowserClient` internally memoises by URL+key — calling it multiple times returns the same instance. No module-level singleton needed.

---

## 2. Middleware Patch

**File:** `middleware.ts`

Add `auth` to the negative-lookahead in the matcher so `/auth/confirm` and `/auth/reset-password` are never intercepted:

```
'/((?!_next/static|_next/image|favicon.ico|api/auth/callback|auth/confirm|auth/reset-password|studio).*)'
```

---

## 3. Login Page

**File:** `app/login/page.tsx` (server component)  
**File:** `app/login/login-button.tsx` → renamed export to `GoogleLoginButton` (client component, existing logic unchanged)  
**New file:** `app/login/email-login-form.tsx` (client component)

Login page renders two sections vertically:
1. `<GoogleLoginButton>` — existing OAuth flow
2. `<EmailLoginForm>` — new email/password form

`EmailLoginForm`:
- Fields: `email` (type=email), `password` (type=password)
- Zod schema: `email` valid email, `password` min 8 chars
- On submit: `supabase.signInWithPassword()` → on success `router.push('/dashboard')`
- Error display: inline under the form (maps Supabase error codes to readable messages)
- Links: "Don't have an account? Register" → `/register`; "Forgot password?" → `/auth/forgot-password`

---

## 4. Register Page

**File:** `app/register/page.tsx` (client component — full replacement of stub)

Fields: `email`, `password`, `confirmPassword`  
Zod schema: email valid, password min 8, passwords match  
On submit: `supabase.signUp({ email, password, options: { emailRedirectTo: origin + '/auth/confirm' } })`  
On success: show inline "Check your email to verify your account." message (no redirect — user must verify first)  
On error: show inline error message  
Link: "Already have an account? Sign in" → `/login`

---

## 5. Email Verification Callback

**File:** `app/auth/confirm/route.ts` (server-side route handler)

Reads `token_hash` and `type` from search params.  
Creates a server-side Supabase client (cookie-based, same pattern as `app/api/auth/callback/route.ts`).  
Calls `supabase.auth.verifyOtp({ token_hash, type })`.  
On success: redirect to `/dashboard`.  
On failure: redirect to `/login?error=email_confirmation_failed`.

---

## 6. Forgot Password Page

**File:** `app/auth/forgot-password/page.tsx` (client component)

Field: `email`  
Zod schema: valid email  
On submit: `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/auth/reset-password' })`  
On success: show "If that email is registered, you'll receive a reset link shortly." (no redirect)  
On error: same success message (prevents email enumeration)  
Link: "Back to sign in" → `/login`

---

## 7. Reset Password Page

**File:** `app/auth/reset-password/page.tsx` (client component)

Must detect the password-recovery session from the URL hash (Supabase sends `#access_token=...&type=recovery`).  
Use `supabase.auth.onAuthStateChange` — on `PASSWORD_RECOVERY` event, enable the form.  
If no recovery event within mount, show "This link has expired. Request a new one." with link to `/auth/forgot-password`.

Fields: `password`, `confirmPassword`  
Zod schema: min 8, passwords match  
On submit: `supabase.auth.updateUser({ password })`  
On success: show success message + redirect to `/login` after 2s  
On error: show inline error

---

## 8. Implementation Sequence

1. `lib/auth/supabase-browser.ts` — needed by all client forms
2. `middleware.ts` — fix matcher before testing any auth routes
3. `app/login/login-button.tsx` — refactor export name
4. `app/login/email-login-form.tsx` + `app/login/page.tsx` — login update
5. `app/register/page.tsx` — registration form
6. `app/auth/confirm/route.ts` — verification callback
7. `app/auth/forgot-password/page.tsx` — forgot password
8. `app/auth/reset-password/page.tsx` — reset password
