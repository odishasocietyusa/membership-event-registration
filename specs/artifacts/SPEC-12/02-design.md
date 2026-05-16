# SPEC-12 Design: Member Onboarding & Dashboard

## Component Map

```
/login                  → GoogleLoginButton (existing, unchanged)
  ↓ OAuth callback
/api/auth/callback      → redirect logic (update)
  ├── address null      → /register
  ├── status != ACTIVE  → /register
  └── status ACTIVE     → /dashboard

/register               → RegisterPage (Client Component, rework)
  Steps 1–3: personal / family / address (existing logic, keep)
  Step 4 (new): MembershipTypeStep — fetches GET /api/memberships/types
    └── "Proceed to Payment" → POST /api/payments/checkout-session → Stripe URL
    └── "Cancel" → /

/membership/success     → SuccessPage (new, Server Component)
  Shows confirmation message + link to /dashboard

/dashboard              → DashboardPage (Server Component, full implementation)
  └── SignOutButton (Client Component, new)
```

---

## 1. `app/api/auth/callback/route.ts` — Changes

After `exchangeCodeForSession` succeeds, look up the member record and redirect:

```typescript
// Fetch member using supabase admin to get the user id, then check DB
const { data: { user: authUser } } = await getSupabaseAdmin().auth.getUser(session.access_token)
const member = await prisma.member.findUnique({ where: { userId: authUser.id } })

const isRegistered = member?.address !== null
const isActive = member?.memberStatus === 'active'

if (!isRegistered || !isActive) {
  return NextResponse.redirect(`https://${forwardedHost ?? origin}/register`)
}
return NextResponse.redirect(`https://${forwardedHost ?? origin}/dashboard`)
```

Note: import `prisma` directly in the callback route (it runs in Node.js runtime, not Edge).

---

## 2. `lib/auth/supabase-server.ts` — New File

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createSupabaseServer() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )
}
```

---

## 3. `app/dashboard/page.tsx` — Server Component

```
1. createSupabaseServer() → supabase.auth.getSession()
2. No session → redirect('/login')
3. Use session.access_token to call:
   - GET /api/auth/me   → { user }
   - GET /api/memberships/me → { membership } (or null on 404)
4. Render: name, email, membership status, dates, SignOutButton
```

Expiry display logic:
- `membership.expiryDate` is null → "Never Expires"
- Otherwise → format as locale date string

---

## 4. `app/dashboard/sign-out-button.tsx` — Client Component

```
'use client'
onClick: createSupabaseBrowser().auth.signOut() → router.push('/login')
```

---

## 5. `app/register/page.tsx` — Rework

### Boot logic (useEffect on mount)
```
getSession()
  └── no session → setStep(1)  [email/password path — unchanged]
  └── session exists →
        fetch GET /api/members/me (with Bearer token)
        if address is null → setStep(2), pre-fill name/phone from member data
        if address exists  → setStep(4)  [go straight to membership selection]
```

### Step 4 — Membership Type Selection (new)
```
useEffect: fetch GET /api/memberships/types → store in state
Render: radio buttons or list of types with name + price
  - Filter: only show non-admin types (API already does this)
  - Display price as "$X / year" or "Lifetime" for non-expiring types
Buttons:
  - "Proceed to Payment" (disabled if no type selected)
      → POST /api/payments/checkout-session { membershipType }
      → on success: window.location.href = data.url
  - "Cancel" → router.push('/')
Note text: "You will be redirected to Stripe, our secure payment partner,
            and returned to this site after payment."
```

### Pre-fill logic
When returning user (has session, address not null, no active membership):
- Pre-populate `formData.personal` from `member.fullName` split into first/last
- Pre-populate `formData.address` from `member.address` JSON
- Pre-populate `formData.family.spouseName` from `member.profileData` if available

---

## 6. `app/membership/success/page.tsx` — New Page

Simple server component. No auth check needed.

```
<main>
  <h1>Payment Successful</h1>
  <p>Thank you! Your membership is being activated. 
     This usually takes a few seconds.</p>
  <a href="/dashboard">Go to your dashboard</a>
</main>
```

---

## 7. `lib/payments/stripe.ts` — URL Updates

Change success and cancel URLs:
```typescript
success_url: `${BASE_URL}/membership/success`,  // remove session_id param
cancel_url:  `${BASE_URL}/register`,             // back to registration
```

---

## 8. `app/page.tsx` — Cancel State Prompt

Add a client-side check using `createSupabaseBrowser()`:
- If user has session but `memberStatus` != ACTIVE → show prompt:
  > "Complete your registration to become a member. [Register →]"
- This is a Client Component island inside the otherwise-static page.

---

---

## 9. `app/login/email-login-form.tsx` — Post-login Redirect

Currently does `router.push('/dashboard')` unconditionally. Change to check profile completeness:

```typescript
const { data: { session } } = await supabase.auth.getSession()
const res = await fetch('/api/members/me', {
  headers: { Authorization: `Bearer ${session!.access_token}` },
})
const { member } = await res.json()

const isRegistered = member?.address !== null
const isActive = member?.memberStatus === 'active'

router.push(!isRegistered || !isActive ? '/register' : '/dashboard')
```

This gives email/password users the exact same post-login routing as Google OAuth users.

---

## Implementation Order

1. `lib/auth/supabase-server.ts` (dependency for dashboard)
2. `app/dashboard/sign-out-button.tsx`
3. `app/dashboard/page.tsx`
4. `lib/payments/stripe.ts` (update URLs)
5. `app/membership/success/page.tsx`
6. `app/api/auth/callback/route.ts` (update redirect logic — OAuth users)
7. `app/login/email-login-form.tsx` (update redirect logic — email/password users)
8. `app/register/page.tsx` (largest change — step 4 + boot logic + pre-fill)
9. `app/page.tsx` (cancel state prompt)
