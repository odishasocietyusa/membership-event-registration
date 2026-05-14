# SPEC-2 Amendment Implementation Log

> **Phase:** 3 — Implementer
> **Date:** 2026-05-14
> **FRs covered:** FR-08, FR-09, FR-10, FR-11, FR-12, FR-13

---

## Files Created

| File | Purpose |
|------|---------|
| `apps/web/lib/auth/supabase-browser.ts` | `createSupabaseBrowser()` factory — browser-side Supabase client using `createBrowserClient`; replaces inline construction in all client components |
| `apps/web/app/auth/confirm/route.ts` | GET handler for Supabase email-verification redirect; reads `token_hash` + `type`, calls `supabase.auth.verifyOtp()`, redirects to `/dashboard` or `/login?error=email_confirmation_failed` |
| `apps/web/app/auth/forgot-password/page.tsx` | Client component: email input form; calls `supabase.auth.resetPasswordForEmail()` with `redirectTo=/auth/reset-password`; always shows success message (prevents email enumeration) |
| `apps/web/app/auth/reset-password/page.tsx` | Client component: uses `onAuthStateChange(PASSWORD_RECOVERY)` to detect recovery session from URL hash; shows new-password form; calls `supabase.auth.updateUser({ password })`; redirects to `/login` on success; shows "link expired" if no recovery event within 3s |
| `apps/web/app/login/email-login-form.tsx` | Client component: email + password login form with Zod validation; calls `supabase.signInWithPassword()`; maps Supabase error codes to user-friendly messages |

## Files Modified

| File | Change |
|------|--------|
| `apps/web/middleware.ts` | Added `auth/confirm` and `auth/reset-password` to matcher negative-lookahead — prevents middleware from intercepting these callback routes before Supabase processes the session |
| `apps/web/app/login/login-button.tsx` | Renamed default export to `GoogleLoginButton`; switched inline `createBrowserClient` to `createSupabaseBrowser()` |
| `apps/web/app/login/page.tsx` | Added `<EmailLoginForm>` section below a `<hr>` separator; imports `GoogleLoginButton` by new name |
| `apps/web/app/register/page.tsx` | Full replacement of stub: email + password + confirm-password form with Zod validation; calls `supabase.signUp()` with `emailRedirectTo=/auth/confirm`; shows "check your email" confirmation on success |

---

## Key Implementation Decisions

- **`createSupabaseBrowser()` is a factory, not a module-level singleton** — `createBrowserClient` internally memoises by URL+key, so multiple calls are safe.
- **Forgot-password always shows success** — `resetPasswordForEmail()` is called regardless; both paths show the same confirmation text to prevent revealing whether an email is registered.
- **Reset-password uses `onAuthStateChange`** — the `#access_token` hash fragment is processed by Supabase client-side; the `PASSWORD_RECOVERY` event signals the session is ready. A 3-second timeout triggers the "link expired" state if no event fires.
- **No new npm packages** — `@supabase/ssr`, `@supabase/supabase-js`, and `zod` were already installed.

---

## Manual Supabase Configuration Required (operator task)

These steps cannot be done in code and must be performed in the Supabase dashboard:

1. Authentication → Providers → Enable **Email** provider
2. Authentication → URL Configuration → Add to **Redirect URLs**:
   - `http://localhost:3000/auth/confirm`
   - `http://localhost:3000/auth/reset-password`
   - (Production equivalents when deploying)
3. Authentication → Email Templates → Optionally customise verification and reset emails
