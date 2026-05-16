# Admin Deployment Troubleshooting Guide

A reference of real production issues encountered during deployment, their root causes, and fixes. Add new entries as issues are resolved.

---

## Table of Contents

1. [Build Failures](#build-failures)
2. [Authentication Issues](#authentication-issues)
3. [Payment & Stripe Issues](#payment--stripe-issues)
4. [Environment Variables](#environment-variables)

---

## Build Failures

### Vulnerable package detected by Vercel scanner
**Symptom:** Build fails with `Vulnerable version of <package> detected (x.x.x). Please update to version y.y.y or later.`

**Root cause:** Vercel's proprietary pre-build vulnerability scanner detects stale package artifacts in its cached `node_modules` even after the lockfile has been updated. `pnpm install --force`, `pnpm dedupe`, and `VERCEL_FORCE_NO_BUILD_CACHE=1` do not reliably clear this. The "Purge Build Cache" option is Pro-only and not available on the Hobby plan.

**Fix:** Remove the flagged package entirely and replace it with an alternative. In this project, `next-mdx-remote` was replaced with `@next/mdx` (the official Next.js MDX integration) which compiles `.mdx` files as React components at build time.

Also remove any leftover `pnpm.overrides` entries for the removed package from `package.json` — the scanner parses that field and will continue to flag it.

---

### `@next/mdx` version mismatch causes `createContext is not a function`
**Symptom:** Build succeeds but pages using MDX fail at runtime with `TypeError: createContext is not a function`.

**Root cause:** `@next/mdx` must match the major version of Next.js. Installing `@next/mdx@16` with `next@15` causes the compiled MDX output to reference React APIs incompatible with how Next.js 15 bundles them for the server.

**Fix:** Pin `@next/mdx` to the same major version as Next.js (e.g., `^15.x.x` for Next.js 15). Also remove `@mdx-js/react` if you are not passing custom components to MDX — it is not needed for plain markdown content files.

---

### TypeScript build error: implicit `any` on callback parameter
**Symptom:** Build fails with `Parameter 'x' implicitly has an 'any' type.`

**Root cause:** When simplifying callback signatures (e.g., removing spread type annotations), TypeScript strict mode rejects inferred `any`.

**Fix:** Always keep explicit type annotations on all callback parameters. For `@supabase/ssr` cookie handlers:
```typescript
setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) { ... }
```

---

## Authentication Issues

### Google login redirects back to `/login` in a loop
**Symptom:** User clicks "Sign in with Google", OAuth completes successfully, but browser ends up back on `/login` instead of `/dashboard` or `/register`.

**Root cause (primary):** `@supabase/ssr` v0.5+ splits large JWT tokens across multiple cookies named `sb-<ref>-auth-token.0`, `sb-<ref>-auth-token.1`, etc. The middleware was checking `name.endsWith('-auth-token')` which misses these chunked cookies, causing every authenticated request to appear unauthenticated.

**Fix:** Change the middleware session check to use `includes` instead of `endsWith`:
```typescript
// Before (broken for chunked cookies)
name.startsWith('sb-') && name.endsWith('-auth-token')

// After (handles both single and chunked)
name.startsWith('sb-') && name.includes('-auth-token')
```

---

### Session cookies not received by browser after OAuth callback
**Symptom:** Auth callback exchanges the code successfully and redirects to `/dashboard`, but the browser has no session cookie so middleware redirects back to login.

**Root cause:** The auth callback route used `cookieStore.set()` from `next/headers` to write session cookies, then returned `NextResponse.redirect()`. The redirect creates a new `Response` object that does not carry cookies written to the incoming request's cookie store.

**Fix:** Collect the cookies Supabase wants to set in a local array, then apply them directly to the `NextResponse.redirect()` object:
```typescript
const pendingCookies: { name: string; value: string; options: CookieOptions }[] = []

const supabase = createServerClient(url, key, {
  cookies: {
    getAll: () => cookieStore.getAll(),
    setAll: (cookies) => pendingCookies.push(...cookies),  // collect, don't write
  },
})

const { data: { session } } = await supabase.auth.exchangeCodeForSession(code)
const response = NextResponse.redirect(`${baseUrl}/dashboard`)
pendingCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
return response
```

---

### Registered user sent back to `/register` after login
**Symptom:** A user who completed registration and paid is redirected to `/register` instead of `/dashboard` after logging in.

**Root cause:** The post-login redirect logic checked both `address != null` (registered) AND `memberStatus === 'active'` before allowing dashboard access. If the Stripe webhook was delayed or misconfigured, `memberStatus` stays `pending` even after payment — so a paid, registered user was incorrectly sent back to the registration flow.

**Fix:** Only gate on whether the user has completed registration (has an address on file). Membership status is shown and managed within the dashboard itself:
```typescript
const isRegistered = member?.address != null
if (!isRegistered) return '/register'
return '/dashboard'
```

---

## Payment & Stripe Issues

### Stripe webhook returns 500: Supabase URL and Key required
**Symptom:** Stripe webhook POST to `/api/webhooks/stripe` fails with `Error: Your project's URL and Key are required to create a Supabase client!`

**Root cause:** The Stripe webhook endpoint URL in the Stripe dashboard was set to a specific older Vercel deployment URL (e.g., `...-llfdzj4ec-....vercel.app`). That deployment was built before `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` were added to Vercel's environment variables, so those values were `undefined` in that build.

**Fix:**
1. Update the Stripe webhook endpoint URL to the stable Vercel domain (not a deployment-hash URL). Find your stable URL under **Vercel → Project → Settings → Domains**.
2. Ensure all required environment variables are set in Vercel under **Settings → Environment Variables** with scope covering Production and Preview.

---

### Stripe success page returns 404 after payment
**Symptom:** After completing a Stripe payment, the browser is redirected to a 404 page at `/membership/success`.

**Root cause:** The `success_url` passed to Stripe when creating the checkout session was built from `NEXT_PUBLIC_SITE_URL`, which was pinned to an older deployment URL. By the time of payment, that deployment no longer served the `/membership/success` route.

**Fix:** Use Vercel's automatically-injected `VERCEL_URL` environment variable as a fallback so the success/cancel URLs always point back to the same deployment that created the session:
```typescript
const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
```
`NEXT_PUBLIC_SITE_URL` should only be set in Vercel if you have a stable custom domain.

---

### Stripe secret key misconfigured
**Symptom:** Checkout session creation returns 500.

**Root cause:** The `STRIPE_SECRET_KEY` environment variable in Vercel was accidentally set to a Supabase service role key value.

**Fix:** Verify the value starts with `sk_test_` (test mode) or `sk_live_` (production). Retrieve the correct key from the [Stripe Dashboard → Developers → API Keys](https://dashboard.stripe.com/apikeys).

---

## Environment Variables

### Required variables for production deployment

| Variable | Where to find it | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project → Settings → API | Required at build time and runtime |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project → Settings → API | Required at build time and runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project → Settings → API | Server-side only, never expose to browser |
| `DATABASE_URL` | Supabase → Project → Settings → Database | Prisma connection string (use connection pooler URL) |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API Keys | Must start with `sk_test_` or `sk_live_` |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → endpoint | Starts with `whsec_` |
| `NEXT_PUBLIC_SITE_URL` | Set manually | Only needed if you have a stable custom domain; omit otherwise |

### Tips
- **Scope matters:** Set all variables for both Production and Preview environments in Vercel, not just Production.
- **Rebuild after adding vars:** `NEXT_PUBLIC_*` variables are embedded at build time. If you add or change them, you must trigger a new deployment for them to take effect.
- **Never reuse keys across services:** Each `NEXT_PUBLIC_*` and secret variable should hold exactly the value its name describes. A past incident set `STRIPE_SECRET_KEY` to a Supabase key — double-check values after initial setup.
