# Feature Specification: Member Onboarding & Dashboard (Phase 3 Core Flow)

> **Spec ID:** SPEC-12
> **Status:** In Analysis
> **Created:** 2026-05-16

---

## 1. Overview

### 1.1 Summary
Implement the end-to-end member journey from first Google login through profile registration,
membership selection, Stripe payment, and the post-payment dashboard. This covers three
pages and the routing logic that connects them.

### 1.2 User Stories

**Happy Path (new user):**
1. User clicks "Sign in with Google" on `/login`
2. Google OAuth completes → session established
3. System detects incomplete profile → redirects to `/register`
4. User fills in personal info, family info, address, and chooses a membership type
5. User clicks "Proceed to Payment" → Stripe Checkout opens
6. Payment succeeds → Stripe webhook fires → member status set to ACTIVE
7. Stripe redirects user to `/dashboard`
8. Dashboard shows name, email, membership type, start date, and expiry date
   (life / patron / benefactor show "Never Expires")

**Incomplete Registration (returning non-member):**
1. User logs in via Google but has not completed registration or paid
2. Redirected to `/register` with their info partially pre-filled
3. Two buttons at the bottom: **"Proceed to Payment"** and **"Cancel"**
4. Cancel → home page (`/`) with a "Register to continue" prompt

### 1.3 Non-Goals
- Email/password signup flow (existing, out of scope for this spec)
- Admin dashboard (separate spec)
- Event registration (separate spec)
- Any CSS styling or Tailwind — bare HTML only

---

## 2. Pages in Scope

| Page | Status | Change Required |
|------|--------|-----------------|
| `/register` | Exists (email/password only) | Major rework for social login path |
| `/membership` | Stub | Replaced by Stripe checkout-session call (no UI needed) |
| `/dashboard` | Stub | Full implementation |

---

## 3. Routing Logic (Post-Login Redirect)

After OAuth callback establishes a session, the system must determine where to send the user.
This logic lives in `app/api/auth/callback/route.ts`.

| Condition | Redirect To |
|-----------|-------------|
| `fullName` is null (profile never saved) | `/register` |
| `fullName` set but `memberStatus` is null / PENDING / EXPIRED / CANCELLED | `/register` |
| `memberStatus` is ACTIVE | `/dashboard` |

---

## 4. Registration Page (`/register`) — Revised

### 4.1 Social Login Path (primary)
When user arrives already authenticated (has a Supabase session), skip Step 1 entirely.
Show only:
- **Step 1**: Personal info (first name, last name, phone, bio)
- **Step 2**: Family info (spouse name, children)
- **Step 3**: Address (street, city, state, zip, country)
- **Step 4**: Membership type selection (choose from active membership fee tiers — last step before payment)

Bottom of Step 4:
- **"Proceed to Payment"** button → calls `POST /api/payments/checkout-session` → redirects to Stripe URL
- Note displayed under button: _"You will be redirected to Stripe, our secure payment partner, and returned to this site after payment."_
- **"Cancel"** button → navigates to `/` (home page)

### 4.4 Pre-fill for Returning Users
If the user has previously saved profile data (name, address), pre-fill the form fields from `GET /api/members/me`. This applies to users who registered personal info but never completed payment.

### 4.2 Home Page Cancel State
When a user arrives at `/` after cancelling registration, show a banner/message:
> "Complete your registration to become a member." with a "Register" link → `/register`

This is shown only when user is authenticated but has no active membership.

### 4.3 Membership Type Display
Fetch available types from `GET /api/memberships/types`. Display each with name and price.
For types where price is $0 (honorary) — do not show to regular users.

---

## 5. Dashboard Page (`/dashboard`)

### 5.1 Content
| Element | Source |
|---------|--------|
| User name | `GET /api/auth/me` → `user.fullName` |
| User email | `GET /api/auth/me` → `user.email` |
| Membership type | `GET /api/memberships/me` → `membership.membershipType` |
| Join date | `GET /api/memberships/me` → `membership.joinDate` |
| Expiry date | `GET /api/memberships/me` → `membership.expiryDate` — display "Never Expires" if null |
| Sign out button | Client component → `supabase.auth.signOut()` → redirect to `/login` |

### 5.2 Membership Status Display

| memberStatus | Display |
|---|---|
| ACTIVE, expiryDate set | "Active — expires [date]" |
| ACTIVE, expiryDate null | "Active — Never Expires" |
| PENDING | "Pending approval" |
| EXPIRED | "Expired — [link to /register to renew]" |
| CANCELLED | "Cancelled" |
| No record | "No membership — [link to /register]" |

### 5.3 Membership Types That Never Expire
`life`, `lifeWard`, `honoraryNoVote` — these have null expiryDate, display "Never Expires".
Patron and Benefactor have annual expiry — display actual date.

---

## 6. Technical Constraints

- **No styling** — bare HTML only (Figma design pending)
- Server Components for all data fetching; Client Components only for interactive actions
- Need to create `lib/auth/supabase-server.ts` — server-side Supabase client helper
- The `/register` page must remain a Client Component (multi-step form with local state)
- Stripe checkout session: call `POST /api/payments/checkout-session`, get back `{ url }`, do `window.location.href = url`

---

## 7. Files to Create / Modify

| File | Action |
|------|--------|
| `app/api/auth/callback/route.ts` | Update redirect logic based on profile completeness |
| `app/register/page.tsx` | Rework for social login path + membership type step + Cancel button |
| `app/dashboard/page.tsx` | Full server component implementation |
| `app/dashboard/sign-out-button.tsx` | New client component |
| `app/page.tsx` | Add "Complete registration" prompt for authenticated non-members |
| `lib/auth/supabase-server.ts` | New server-side Supabase client helper |

---

## 8. Acceptance Criteria

| Scenario | Expected Outcome |
|----------|-----------------|
| New user logs in via Google | Redirected to `/register`, step 1 is personal info (not account creation) |
| User completes all steps and clicks "Proceed to Payment" | Stripe Checkout opens |
| Payment succeeds | Redirected to `/dashboard` showing name, membership type, dates |
| Life/patron/benefactor member on dashboard | Expiry shows "Never Expires" |
| User clicks Cancel on registration | Redirected to `/` with "Complete registration" message |
| User visits `/dashboard` without session | Redirected to `/login` |
| Returning user with ACTIVE membership logs in | Redirected to `/dashboard` directly |

---

## Agent Workflow Tracking

### Requirements Decisions (confirmed)
- Registration complete signal: `address` field is null → incomplete
- Membership type selection: Step 4 (final step before payment)
- Payment flow: Stripe Checkout → success redirects to `/dashboard`
- Pre-fill: returning users with saved profile data see pre-filled form

### Phase 1: Analysis
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-12/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-12/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-12/03-implementation.md`

### Phase 4: QA
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-12/04-qa-report.md`
