# SPEC-2 Amendment Analysis — Email/Password Auth

> **Phase:** 1 — Analyst
> **Scope:** FR-08 through FR-13 (amendment only; original FR-01–FR-07 are complete)
> **Date:** 2026-05-14

---

## 1. What Is Already Complete

The original SPEC-2 implementation is fully in place:
- `lib/auth/supabase-admin.ts` — service-role singleton ✅
- `lib/auth/with-auth.ts` — JWT guard + JIT sync + role check ✅
- `lib/auth/roles.ts` — `ROLE_HIERARCHY` constant ✅
- `lib/db/prisma.ts` — Prisma singleton ✅
- `app/api/auth/callback/route.ts` — OAuth exchange handler ✅
- `app/api/auth/me/route.ts` — health-check endpoint ✅
- `middleware.ts` — session refresh + protected-route redirect ✅
- `app/login/page.tsx` — exists with Google-only `LoginButton` client component ✅

---

## 2. What Needs to Be Built (Amendment)

### Files to Create (new)

| File | FR | Purpose |
|------|----|---------|
| `lib/auth/supabase-browser.ts` | FR-08/09/11/12 | Browser-side Supabase client singleton (`createBrowserClient`) for use in all client components — replaces inline construction in `login-button.tsx` |
| `app/auth/confirm/route.ts` | FR-10 | Route handler for Supabase email-verification redirect (`?token_hash=&type=email`). Calls `supabase.auth.verifyOtp()`, then redirects to `/dashboard` or `/login?error=...` |
| `app/auth/reset-password/page.tsx` | FR-12 | Client component: new-password form. User lands here from the reset email link (contains `#access_token` in hash). Calls `supabase.auth.updateUser({ password })`, then redirects to `/login` |
| `app/auth/forgot-password/page.tsx` | FR-11 | Client component: email input form. Calls `supabase.auth.resetPasswordForEmail()`, shows "check your email" confirmation. No redirect needed. |

### Files to Modify (existing)

| File | Change |
|------|--------|
| `app/login/page.tsx` | Replace Google-only content with: (1) Google OAuth section, (2) email/password login form, (3) links to `/register` and `/auth/forgot-password` |
| `app/login/login-button.tsx` | Refactor: rename to `login-google-button.tsx` or extend to export `GoogleLoginButton`; keep existing OAuth logic |
| `app/register/page.tsx` | Replace stub with email/password registration form. On success: show "check your email" message (not redirect — user must verify first) |

---

## 3. Requirements Mapping (Amendment FRs)

| FR | Requirement | Implementation |
|----|-------------|----------------|
| FR-08 | Register with email + password | `app/register/page.tsx` calls `supabase.signUp()` |
| FR-09 | Log in with email + password | Login page form calls `supabase.signInWithPassword()`, then `router.push('/dashboard')` |
| FR-10 | Verification required before login | Supabase enforces this natively; `app/auth/confirm/route.ts` handles the redirect |
| FR-11 | Request password reset email | `app/auth/forgot-password/page.tsx` calls `resetPasswordForEmail()` |
| FR-12 | Set new password via reset link | `app/auth/reset-password/page.tsx` calls `supabase.auth.updateUser({ password })` |
| FR-13 | Login page has both auth options | Login page updated with two sections: Google button + email/password form |

---

## 4. Risks and Edge Cases

| Risk | Mitigation |
|------|-----------|
| Reset link contains `#access_token` (hash fragment) — not accessible server-side | `reset-password` page must be a client component; use `supabase.auth.onAuthStateChange` or check session on mount |
| `supabase.signInWithPassword()` returns generic error message | Show user-friendly messages: "Invalid credentials" for wrong password, "Email not confirmed" for unverified |
| `register` page and `login` page both need browser Supabase client | Use `lib/auth/supabase-browser.ts` singleton — prevents multiple client instances |
| Middleware currently only refreshes session for cookie-auth; email login also sets cookie | No change needed — `middleware.ts` already handles session refresh for all Supabase sessions |
| `app/auth/confirm` must be excluded from middleware matcher | Already excluded: matcher pattern `(?!...api/auth/callback...)` doesn't cover `/auth/confirm`. Need to add `/auth/confirm` to the matcher exclusion. |
| Forgot-password redirect URL must match Supabase config | `resetPasswordForEmail()` must pass `redirectTo: {origin}/auth/reset-password`; Supabase dashboard must whitelist this URL |

---

## 5. Scope Boundary with SPEC-10

SPEC-10's Step 1 also collects email + password. SPEC-2's `app/register/page.tsx` handles only **account creation** (Supabase `signUp`). Once SPEC-10 is implemented, the `/register` route will be replaced by the full 4-step flow — this is expected and SPEC-2's register page is intentionally minimal.

---

## 6. Dependencies

- No new npm packages required (`@supabase/ssr` and `zod` already installed)
- Supabase dashboard manual config required before testing (enable Email provider, set redirect URLs) — documented in spec §4.5
- Middleware matcher exclusion for `/auth/confirm` (code change, minor)
