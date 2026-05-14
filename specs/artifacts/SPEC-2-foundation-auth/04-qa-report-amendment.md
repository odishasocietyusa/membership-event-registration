# Phase 4: QA Report — Amendment (Email/Password Auth)

> **Spec:** SPEC-2-foundation-auth (Amendment)
> **Date:** 2026-05-14
> **FRs covered:** FR-08, FR-09, FR-10, FR-11, FR-12, FR-13
> **Overall Result:** PASS

---

## 1. Test Suite Results

```
$ jest app/auth/confirm/route.test.ts
PASS app/auth/confirm/route.test.ts (5 tests)
  ✓ CONFIRM-01: redirects to /dashboard when verifyOtp succeeds
  ✓ CONFIRM-02: redirects to /login?error=email_confirmation_failed when verifyOtp fails
  ✓ CONFIRM-03: redirects to error page when token_hash is missing
  ✓ CONFIRM-04: redirects to error page when type is missing
  ✓ CONFIRM-05: passes type=recovery to verifyOtp when present

Full suite: 216 tests / 34 test suites — all passing.
```

**Note:** Client components (`email-login-form.tsx`, `register/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`) use React hooks and browser APIs (`window.location.origin`, `onAuthStateChange`) that require a live browser environment. These are covered by the acceptance criteria review below rather than unit tests. The server-side route (`auth/confirm/route.ts`) is fully unit-tested above.

---

## 2. Acceptance Criteria Review

| Criterion | Status | Evidence |
|-----------|--------|---------|
| Email/password registration form creates account and triggers verification email | PASS | `register/page.tsx` calls `supabase.auth.signUp({ email, password, options: { emailRedirectTo: origin + '/auth/confirm' } })`. Supabase sends verification email automatically when `enable_confirmations = true` (set in `supabase/config.toml`). On success shows "Check your email" confirmation. |
| Unverified user cannot log in (Supabase enforced) | PASS | `email-login-form.tsx` calls `signInWithPassword()`. Supabase rejects unverified users server-side. The `ERROR_MESSAGES` map translates `'Email not confirmed'` → `'Please verify your email before signing in.'` |
| Verified user can log in with email + password and reach dashboard | PASS | `email-login-form.tsx` calls `signInWithPassword()` → on success calls `router.push('/dashboard')`. Supabase sets session cookies via `@supabase/ssr`, which `middleware.ts` reads on subsequent requests. |
| "Forgot password" flow sends reset email and allows setting new password | PASS | `forgot-password/page.tsx` calls `resetPasswordForEmail(email, { redirectTo: origin + '/auth/reset-password' })`. `reset-password/page.tsx` listens for `PASSWORD_RECOVERY` auth event then calls `supabase.auth.updateUser({ password })`. |
| Login page shows both Google and email/password options | PASS | `login/page.tsx` renders `<GoogleLoginButton>` and `<EmailLoginForm>` separated by `<hr>`. |
| All tests passing | PASS | 216/216 tests green. |

---

## 3. Functional Requirements Coverage

| ID | Requirement | Status | Evidence / Notes |
|----|-------------|--------|-----------------|
| FR-08 | User can register with email + password | PASS | `register/page.tsx` → `supabase.auth.signUp()` |
| FR-09 | User can log in with email + password | PASS | `email-login-form.tsx` → `supabase.auth.signInWithPassword()` |
| FR-10 | New email registrations require verification before login | PASS | Supabase-enforced. `signUp()` with `enable_confirmations = true` prevents JWT issuance until verified. Error message surfaced in UI. |
| FR-11 | User can request a password reset email | PASS | `forgot-password/page.tsx` → `supabase.auth.resetPasswordForEmail()` |
| FR-12 | User can set a new password via the reset link | PASS | `reset-password/page.tsx` → `supabase.auth.updateUser({ password })`. `PASSWORD_RECOVERY` event detection gates the form. |
| FR-13 | Login page offers both Google OAuth and email/password options | PASS | `login/page.tsx` renders both `<GoogleLoginButton>` and `<EmailLoginForm>` |

---

## 4. Code Review Findings

### Finding 1 — Email enumeration prevention is correct (PASS)

`forgot-password/page.tsx` always calls `resetPasswordForEmail()` regardless of whether the email exists, then always shows the same "check your email" message. This matches the design intent and prevents leaking whether an email is registered.

### Finding 2 — 3-second timeout on reset-password may race in slow environments (MINOR / ACCEPTED)

`reset-password/page.tsx` sets a 3-second `setTimeout` to transition to the "link expired" state if no `PASSWORD_RECOVERY` event fires. On slow devices or cold page loads, Supabase's client-side `#access_token` hash processing could take longer than 3 seconds, briefly showing "link expired" before the event fires.

The `useEffect` at lines 52–55 immediately clears `expired` when `ready` becomes true, so this is self-correcting — the user will see "Verifying…" → brief "Link expired" flicker → form if the event fires just after 3s. Unlikely in practice.

**Recommendation:** Acceptable for MVP. If this becomes a UX issue, increase the timeout to 5–6 seconds or use a different signal (e.g., checking the URL hash directly).

### Finding 3 — `router.refresh()` not called after `updateUser` (MINOR / ACCEPTED)

After `supabase.auth.updateUser({ password })` succeeds, `reset-password/page.tsx` shows a success message and `router.push('/login')` after 2 seconds. It does not call `router.refresh()` to invalidate the server-side session cache. Since the next navigation is to `/login` (not a protected page), this is benign — the session state is irrelevant at that redirect target.

### Finding 4 — Zod `form` errors from refinements handled correctly (PASS)

Both `register/page.tsx` and `reset-password/page.tsx` use cross-field Zod refinements (password confirmation). The `formErrors` are correctly extracted via `result.error.flatten().formErrors[0]` and rendered in `{errors.form}`. The path override `path: ['confirmPassword']` correctly routes the mismatch error to the `confirmPassword` field rather than the form level.

---

## 5. Manual Testing Checklist

These scenarios require a live Supabase environment and cannot be automated with Jest:

| Scenario | Steps | Expected |
|----------|-------|----------|
| Registration flow | Visit `/register`, submit email + password ≥ 8 chars | "Check your email" shown; verification email arrives in Mailpit (`http://127.0.0.1:54324`) |
| Unverified login | Register but do not verify; visit `/login`, submit credentials | "Please verify your email before signing in." error shown |
| Verified login | Click verification link in Mailpit; visit `/login`, submit credentials | Redirected to `/dashboard` |
| Forgot password | Visit `/auth/forgot-password`, submit registered email | "If that email is registered…" message shown; reset email in Mailpit |
| Password reset | Click reset link from Mailpit | "Set a new password" form shows; submit new password ≥ 8 chars; redirected to `/login` after 2s |
| Login with new password | Submit new credentials on `/login` | Redirected to `/dashboard` |

**Supabase local setup:**
- Email provider: enabled via `supabase/config.toml` (`enable_signup = true`, `enable_confirmations = true`) — **no dashboard changes needed**
- Redirect URLs: already added to `additional_redirect_urls` in `supabase/config.toml`
- Restart Supabase after config changes: `supabase stop && supabase start`
- View emails: Mailpit at `http://127.0.0.1:54324`

---

## 6. Verdict

**APPROVED**

All 216 automated tests pass (including 5 new CONFIRM-0x tests for the email verification route). All 6 amendment FRs (FR-08 through FR-13) and all Definition of Done items are satisfied. Two minor findings (timeout race, missing `router.refresh()`) are accepted for MVP. Manual testing checklist above covers live-environment scenarios.

SPEC-2 amendment is complete. SPEC-10 (multi-step registration) may now replace the `/register` stub.
