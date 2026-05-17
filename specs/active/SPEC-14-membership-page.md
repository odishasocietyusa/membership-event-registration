# Feature Specification: Membership Purchase Page

> **Spec ID:** SPEC-14
> **Status:** Draft
> **Author:** Utkal Nayak
> **Created:** 2026-05-16

---

## 1. Overview

### 1.1 Summary
Implement the `/membership` page so that registered OSA members who have not yet paid, or whose membership has expired, can browse available tiers, see their payment history, and purchase or upgrade their membership via Stripe. The page is auth-guarded and only accessible to users who need to take action — active members are redirected away.

### 1.2 Goals
- [ ] Display the member's current status, ID, and prior payment history
- [ ] List all purchasable membership tiers with fees
- [ ] For annual/five-year tiers, show an informational nudge with the remaining amount to reach Life membership
- [ ] For Life, Patron, and Benefactor tiers, show the reduced upgrade price (tier fee minus cumulative prior payments)
- [ ] Route the user through Stripe checkout with correct success and cancel URLs
- [ ] On payment success, show a confirmation and link to the dashboard
- [ ] On cancel or failure, return the user to `/membership`

### 1.3 Non-Goals
- Refund functionality (admin-only, not surfaced on this page)
- CSS styling (deferred to Figma phase)
- Donation flow (separate page `/donate`)
- Honorary, lifeWard membership purchase (admin-assigned only)
- Membership cancellation from this page

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Page is auth-guarded; unauthenticated users are redirected to `/login` | Must Have | |
| FR-02 | Registered users with active membership are redirected to `/dashboard` | Must Have | Active members have nothing to do here |
| FR-03 | Unregistered users (no address on file) are redirected to `/register` | Must Have | Must complete profile before purchasing |
| FR-04 | Suspended members see an informational message and cannot purchase | Must Have | No tier options shown |
| FR-05 | Page displays the member's ID, current membership status, membership dates (if available), and past membership payment history | Must Have | |
| FR-06 | Page lists all purchasable tiers: Annual Student, Annual Single, Annual Family, Five-Year Family, Life, Patron, Benefactor — with their dollar amounts | Must Have | `isAdminOnly` tiers (honorary) are never shown |
| FR-07 | When the user selects Annual Student, Annual Single, Annual Family, or Five-Year Family, show: "You have $X left to become a Life Member. Please consider upgrading." where X = max(0, Life fee − cumulative paid) | Must Have | Informational only; selecting these tiers still charges full price |
| FR-08 | For Life membership: display the upgrade price (Life fee − cumulative paid) with a label "Upgrade price applied — $Y credit from prior payments" | Must Have | If cumulative ≥ Life fee, show "Your prior payments cover the full Life membership fee" and allow $0 activation |
| FR-09 | For Patron membership: display the upgrade price (Patron fee − cumulative paid) with the same credit label | Must Have | Patron fee = $500 |
| FR-10 | For Benefactor membership: display the upgrade price (Benefactor fee − cumulative paid) with the same credit label | Must Have | Benefactor fee = $1,000 |
| FR-11 | Annual/Five-year tiers always charge the full listed price; no upgrade credit is applied at checkout | Must Have | |
| FR-12 | Clicking "Purchase" or "Upgrade" for any tier redirects the user to Stripe Checkout | Must Have | |
| FR-13 | On Stripe payment success, the user is redirected to `/membership/success` which shows a confirmation message and a link to `/dashboard` | Must Have | Webhook activates membership asynchronously |
| FR-14 | On Stripe cancel or payment failure, the user is returned to `/membership` | Must Have | Fix current `cancel_url` which incorrectly points to `/register` |
| FR-15 | No refund option is shown anywhere on `/membership` or `/membership/success` | Must Have | Refunds are admin-only |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Auth guard | Session + registration check server-side on every load | Never rely on middleware alone |
| NFR-02 | No styling | Bare HTML only | Per project Phase 3 constraint |
| NFR-03 | Server component | Fetch all data server-side; no token exposure to browser | |
| NFR-04 | Consistent base URL | Use `VERCEL_URL` fallback pattern | Same as dashboard, admin, stripe.ts |
| NFR-05 | Upgrade cost accuracy | Cumulative paid = sum of `amountCents` for completed payments where `membershipType` is an `isUpgradePath: true` tier | Patron and Benefactor past payments (isUpgradePath: false) do not contribute to the credit pool |

---

## 3. Business Logic Reference

### 3.1 Membership Tiers and Fees (seeded values)

| Tier | Enum Value | Fee | isUpgradePath | isAdminOnly | Upgrade Pricing? |
|------|-----------|-----|---------------|-------------|-----------------|
| Annual Student (no vote) | `annualStudentNoVote` | $20 | Yes | No | No — full price only |
| Annual Single | `annualSingle` | $25 | Yes | No | No — full price only |
| Annual Family | `annualFamily` | $40 | Yes | No | No — full price only |
| Five-Year Family | `fiveYearFamily` | $100 | Yes | No | No — full price only |
| Life | `life` | $200 | Yes | No | Yes — (Life fee − cumulative) |
| Patron | `patron` | $500 | No | No | Yes — (Patron fee − cumulative) |
| Benefactor | `benefactor` | $1,000 | No | No | Yes — (Benefactor fee − cumulative) |
| Honorary (no vote) | `honoraryNoVote` | $0 | No | **Yes** | Not shown — admin only |
| Life Ward | `lifeWard` | $100 | Yes | No | Not shown — admin only (used for admin assignment) |

### 3.2 Cumulative Paid Calculation
`cumulativePaid` = sum of `amountCents` across all `PaymentRecord` rows where:
- `memberId` = current user
- `status = 'completed'`
- `paymentType` IN `['membership', 'upgrade']`
- The payment's `membershipType` has `isUpgradePath = true` in `MembershipFee`

This is already implemented in `calculateCumulativePaid()` in `lib/payments/payment-service.ts`.

### 3.3 Upgrade Price Formula
- **Life upgrade price** = max(0, $200 − cumulativePaid)
- **Patron upgrade price** = max(0, $500 − cumulativePaid)
- **Benefactor upgrade price** = max(0, $1,000 − cumulativePaid)

If the upgrade price is $0, Stripe checkout is skipped and the membership is activated directly.

### 3.4 Nudge Text for Annual / Five-Year Tiers
Show inline when user would select one of these tiers:
> "You have $[max(0, $200 − cumulativePaid)] left to become a Life Member. Please consider upgrading."

If cumulativePaid ≥ $200: "Your prior payments already cover the full Life membership fee — you can upgrade to Life at no extra cost."

---

## 4. Acceptance Criteria

### 4.1 Definition of Done
- [ ] All FR-01 through FR-15 implemented
- [ ] `cancel_url` in `createCheckoutSession` and `createUpgradeSession` updated to `/membership`
- [ ] Upgrade cost endpoint generalised to support `life`, `patron`, and `benefactor` as target tiers
- [ ] Build passes (`pnpm build --filter=web`)
- [ ] No TypeScript errors

### 4.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Unauthenticated access | No session | Visit `/membership` | Redirect to `/login` |
| Unregistered user | Session, no address | Visit `/membership` | Redirect to `/register` |
| Active member | memberStatus = active | Visit `/membership` | Redirect to `/dashboard` |
| Suspended member | memberStatus = suspended | Visit `/membership` | See suspension message, no tier options |
| No membership | memberStatus = null, membershipType = null | Visit `/membership` | Full page shown, cumulativePaid = $0 |
| Expired member | memberStatus = expired | Visit `/membership` | Full page shown with history |
| Annual tier selected | Any eligible member | Click "Purchase Annual Single" | Stripe checkout opens; nudge shows life upgrade amount |
| Life upgrade — partial credit | cumulativePaid = $100 | Click "Upgrade to Life" | Stripe checkout opens for $100 |
| Life upgrade — full credit | cumulativePaid ≥ $200 | Click "Upgrade to Life" | Membership activated immediately, no Stripe redirect |
| Patron upgrade | cumulativePaid = $50 | Click "Upgrade to Patron" | Stripe checkout opens for $450 |
| Payment success | Stripe redirects to `/membership/success` | Page loads | "Payment received" message + link to dashboard |
| Payment cancelled | User cancels Stripe checkout | Stripe redirects | Returns to `/membership` |
| No refund visible | Any state | View `/membership` or `/membership/success` | No refund option present |

---

## 5. Technical Constraints

### 5.1 Technologies
- **Must Use:** Next.js App Router server components, existing API routes, TypeScript
- **Must Avoid:** No client-side JS for the purchase flow; no CSS/Tailwind; no new database queries in page components

### 5.2 Patterns to Follow
- Same `VERCEL_URL` fallback for `baseUrl` as `dashboard/page.tsx`
- Same server-side session + registration check as `register/page.tsx`
- Purchase buttons submit HTML `<form>` to a Server Action that calls the checkout API and redirects to the Stripe URL

### 5.3 Files to Create / Modify

```
apps/web/
├── app/
│   └── membership/
│       ├── page.tsx                       MODIFY — implement full page
│       └── success/
│           └── page.tsx                   MODIFY — add dashboard link, remove placeholder text
├── app/api/payments/
│   ├── checkout-session/route.ts          NO CHANGE — reuse as-is
│   └── upgrade-session/route.ts           MODIFY — generalise to accept targetType (life | patron | benefactor)
└── lib/payments/
    ├── stripe.ts                          MODIFY — fix cancel_url from /register → /membership
    └── payment-service.ts                 MODIFY — generalise calculateUpgradeCost to accept targetType
```

### 5.4 API Routes to Use

| Route | Method | Usage |
|-------|--------|-------|
| `GET /api/auth/me` | GET | Get member ID, status, email |
| `GET /api/memberships/types` | GET | Fetch all non-admin membership tiers with fees |
| `GET /api/payments/me` | GET | Fetch member's past payment history |
| `POST /api/payments/checkout-session` | POST | Create Stripe checkout for annual/five-year tiers |
| `POST /api/payments/upgrade-session` | POST | Create Stripe checkout for life/patron/benefactor at upgrade price |

---

## 6. Dependencies

### 6.1 Upstream Dependencies
- SPEC-12 complete (auth, dashboard, Stripe webhook) ✅
- SPEC-13 complete (admin panel — needed to manually activate memberships in edge cases) ✅

### 6.2 Downstream Impact
- This page is the primary self-service entry point for membership payment
- The events page membership gate (implemented in this session) links expired members here
- A working `/membership` page is required before real member onboarding can begin

---

## 7. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should Patron/Benefactor past payments (isUpgradePath: false) count toward future upgrade credit? | Resolved | No — only isUpgradePath: true payments contribute to the credit pool |
| Should members within 1-year expiry window get full upgrade credit, or just active members? | Resolved | Both active and expired-within-1-year members get credit (existing `calculateUpgradeCost` logic) |
| For first-time buyers (cumulativePaid = 0), should Life/Patron/Benefactor show "upgrade price" label or "full price"? | Resolved | Show full price with no upgrade label when cumulativePaid = 0 |
| Should the success page auto-redirect to `/dashboard` after N seconds, or require a manual click? | Resolved | Auto-redirect to `/dashboard` after 5 seconds with a visible countdown message |

---

## 8. References

- [`lib/payments/payment-service.ts`](../../apps/web/lib/payments/payment-service.ts) — `calculateCumulativePaid`, `calculateUpgradeCost`
- [`lib/payments/stripe.ts`](../../apps/web/lib/payments/stripe.ts) — `createCheckoutSession`, `createUpgradeSession`
- [`app/api/payments/checkout-session/route.ts`](../../apps/web/app/api/payments/checkout-session/route.ts) — checkout API
- [`app/api/payments/upgrade-session/route.ts`](../../apps/web/app/api/payments/upgrade-session/route.ts) — upgrade API
- [`app/api/memberships/types/route.ts`](../../apps/web/app/api/memberships/types/route.ts) — tier list API
- [`prisma/seed.ts`](../../apps/web/prisma/seed.ts) — fee amounts and isUpgradePath flags

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation

### Phase 1: Analysis
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-14/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-14/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-14/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-14/04-qa-report.md`
