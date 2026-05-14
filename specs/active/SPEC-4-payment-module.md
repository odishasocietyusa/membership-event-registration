# Feature Specification: Payment Module

> **Spec ID:** SPEC-4-payment-module
> **Status:** Active
> **Author:** Utkal Nayak
> **Last Updated:** 2026-05-14 (scope expanded)

---

## 1. Overview

### 1.1 Summary
Implement Stripe-based payment processing covering: new membership acquisition at DB-driven tier prices, membership upgrades (pay the net difference with cumulative payment tracking), partial and full admin-initiated refunds, anonymous and member-linked donations, email receipts (IRS charity receipts for donations; payment-evidence receipts for membership fees), and a unified payment ledger that tracks who initiated each transaction. All financial operations are recorded for 501(c)(3) audit compliance.

### 1.2 Goals
- [ ] Member can initiate a Stripe checkout for any available membership tier
- [ ] Membership fees are DB-driven (seeded, editable via Supabase Studio) — not hardcoded
- [ ] Member can upgrade by paying the difference: new tier price minus total previously paid
- [ ] Upgrade eligibility: membership active OR expired within 1 year; expired > 1 year pays full new price
- [ ] Non-members and members alike can make a donation of any amount; donor identity is optional
- [ ] Anonymous donation flag hides donor identity from public views
- [ ] Stripe webhook activates membership and updates `expiry_date` on successful payment
- [ ] Webhook events are idempotent — duplicate events do not create duplicate payment records
- [ ] Admin can issue partial or full refunds with a required reason field
- [ ] Member or donor can request an email receipt (membership: payment evidence; donation: IRS charity receipt)
- [ ] All payment events stored with `is_admin_initiated` flag and transaction timestamp
- [ ] Member can view their own full payment history

### 1.3 Non-Goals (Out of Scope)
- Event registration payments (separate future spec)
- Subscription/recurring billing
- Admin UI for updating membership fees (editable via Supabase Studio directly)
- Donation campaign pages or goal tracking

---

## 2. Requirements

### 2.1 Functional Requirements

#### Membership Fees
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Membership fee per tier stored in a `membership_fees` DB table | Must Have | Seeded with current prices; editable via Supabase Studio |
| FR-02 | Member can create a Stripe checkout session for any membership tier | Must Have | Price read from DB at session creation time |
| FR-03 | Successful payment activates membership and sets `expiry_date` | Must Have | Via webhook |
| FR-04 | `stripe_event_id` uniqueness prevents duplicate payment records | Must Have | Idempotency check |
| FR-05 | Failed or expired checkout recorded with `status = failed` | Must Have | Via `checkout.session.expired` / `async_payment_failed` |

#### Membership Upgrades
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-06 | Member can initiate an upgrade checkout toward Life membership | Must Have | Returns Stripe checkout URL |
| FR-07 | Upgrade cost = Life membership fee − cumulative completed payments to date | Must Have | Cumulative = sum of all prior `membership` + `upgrade` payment records for this member |
| FR-08 | If cumulative paid ≥ Life fee, upgrade cost is $0 — system auto-activates without Stripe checkout | Must Have | No payment needed; system upgrades membership directly |
| FR-09 | Upgrade eligibility: membership active OR expired ≤ 1 year ago | Must Have | Expired > 1 year → blocked; member must purchase a new full membership instead |
| FR-10 | Successful upgrade webhook updates `membership_type = life`, `member_status = active`, clears `expiry_date` (life has no expiry) | Must Have | |
| FR-11 | **Patron and Benefactor tiers are NOT part of the upgrade path** — always require full payment regardless of cumulative history | Must Have | These are separate recognition tiers, not reachable via upgrade differential |
| FR-12 | Payments made for Patron or Benefactor do NOT count toward the Life membership cumulative total | Must Have | Cumulative sum only includes `annual-*`, `five-year-family`, `life`, `life-ward` tier payments |

#### Payment History & Ledger
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-13 | All payments stored with `member_id` (nullable), `payment_type`, `amount_cents`, `created_at`, `is_admin_initiated` | Must Have | Covers membership, upgrade, donation, refund |
| FR-14 | Member can view their own payment history | Must Have | `GET /api/payments/me` |
| FR-15 | Admin can view all payments with filtering | Must Have | `GET /api/payments` |

#### Refunds
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-16 | Admin can issue a partial or full refund with mandatory `refund_reason` | Must Have | Required for nonprofit audit |
| FR-17 | Refund updates original payment `status = refunded`, records `refund_amount_cents`, `approved_by`, `refund_reason` | Must Have | |
| FR-18 | Refund cannot exceed original payment amount | Must Have | Validation before Stripe call |

#### Donations
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-19 | Anyone (member or non-member) can make a donation of any amount | Must Have | `member_id` is optional |
| FR-20 | Donor can choose to be anonymous; anonymous flag hides identity from all non-audit API responses | Must Have | `is_anonymous` field |
| FR-21 | Donation payment stored with `payment_type = donation` | Must Have | |

#### Receipts
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-22 | After any successful membership payment, member can request a payment-evidence receipt via email | Must Have | Not a charity receipt |
| FR-23 | After successful donation, donor can request an IRS 501(c)(3) charity receipt via email | Must Have | Includes org name, EIN, donation amount, date, no-goods-received statement |
| FR-24 | Receipt email sent via Resend; `receipt_requested_at` timestamp stored on payment record | Must Have | |
| FR-25 | Membership fee receipt explicitly states "this is not a charitable contribution" | Must Have | IRS compliance |

#### Webhooks & Security
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-26 | Webhook endpoint verifies Stripe signature before processing | Must Have | `req.text()` + `STRIPE_WEBHOOK_SECRET` |
| FR-27 | Webhook with invalid signature returns 400 | Must Have | |

#### Expiry Reminders
| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-28 | Send reminder email to member 30 days and 7 days before expiry | Must Have | Via Resend + Vercel cron |
| FR-29 | Send notification email to admins when any membership is within 30 days of expiry | Must Have | Via Resend + Vercel cron |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Webhook signature verification | All events verified | `stripe.webhooks.constructEvent()` with `req.text()` |
| NFR-02 | Amounts stored as cents | No `float` or `Decimal` for money | `amount_cents: Int` in Prisma |
| NFR-03 | Refund audit trail | `refund_reason` + `approved_by` always set on refunded records | DB-level constraint |
| NFR-04 | Donation anonymity | `is_anonymous = true` → donor name/email omitted from all API responses except internal admin audit | |
| NFR-05 | IRS receipt accuracy | Charity receipt must include: org name, EIN, donation date, amount, no-goods-or-services statement | Required for 501(c)(3) |
| NFR-06 | Cumulative payment tracking | Sum of all `completed` payment records of type `membership` or `upgrade` for tiers in the upgrade path (excludes `patron`, `benefactor`, `honorary-no-vote`) | No external state |
| NFR-07 | Upgrade path tiers | Only `annual-student-no-vote`, `annual-single`, `annual-family`, `five-year-family`, `life`, `life-ward` are upgrade-path tiers. `patron` and `benefactor` always require full fee. | Enforced in `payment-service.ts` |
| NFR-08 | $0 upgrade auto-activation | If upgrade cost ≤ 0 (cumulative ≥ life fee), skip Stripe checkout entirely; activate life membership immediately and record a $0 `upgrade` payment | Prevents unnecessary Stripe session |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] `membership_fees` table seeded with prices for all 9 membership types
- [ ] `POST /api/payments/checkout-session` returns a valid Stripe checkout URL with price read from DB
- [ ] `POST /api/payments/upgrade-session` returns upgrade checkout URL; cost = new price − cumulative paid
- [ ] Upgrade blocked if membership expired > 1 year ago (returns 400)
- [ ] `POST /api/payments/donate` returns donation checkout URL; member_id optional
- [ ] Completing any checkout triggers webhook → creates ledger record with `is_admin_initiated = false`
- [ ] Sending the same webhook event twice does not create a second payment record
- [ ] `GET /api/payments/me` returns the authenticated member's full payment history
- [ ] `POST /api/payments/:id/refund` (admin) issues partial or full Stripe refund, updates DB
- [ ] Refund amount cannot exceed original `amount_cents`
- [ ] `POST /api/payments/:id/receipt` sends correct receipt email (charity for donation, payment-evidence for membership)
- [ ] Anonymous donation hides donor identity in all non-audit API responses
- [ ] Webhook with invalid signature returns 400
- [ ] All tests passing

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Membership checkout | Authenticated member, `annual-single` fee in DB | `POST /api/payments/checkout-session` | Returns `{ url: '...' }` with price from DB |
| Fee change takes effect | Admin updates fee in DB to new amount | New checkout session created | New amount used, not old hardcoded value |
| Upgrade — eligible (active) | Member with active annual membership, cumulative paid = $40 | `POST /api/payments/upgrade-session` to life ($200) | Upgrade cost = $160 |
| Upgrade — eligible (expired <1yr) | Member expired 6 months ago, cumulative paid = $40 | `POST /api/payments/upgrade-session` to life | Upgrade cost = $160 |
| Upgrade — ineligible (expired >1yr) | Member expired 13 months ago | `POST /api/payments/upgrade-session` | Returns 400 "upgrade window expired" |
| Donation — member | Authenticated member, any amount | `POST /api/payments/donate` with `{ amount_cents: 5000 }` | Checkout URL returned, `member_id` set on record |
| Donation — anonymous | Any user | `POST /api/payments/donate` with `{ is_anonymous: true }` | Record created, identity hidden in GET response |
| Donation — non-member | No auth header | `POST /api/payments/donate` with amount | Checkout URL returned, `member_id = null` |
| Payment success webhook | Valid Stripe signature | `checkout.session.completed` | Ledger record created, membership activated |
| Duplicate webhook | Same `stripe_event_id` in DB | Same event again | No-op, returns 200 |
| Failed webhook | `checkout.session.async_payment_failed` | Webhook received | Record with `status = failed` |
| Full refund | Admin, `refund_reason` provided, `amount_cents = original` | `POST /api/payments/:id/refund` | Stripe refund issued, `status = refunded` |
| Partial refund | Admin, `refund_amount_cents < original` | `POST /api/payments/:id/refund` | Partial refund issued, `refund_amount_cents` stored |
| Refund over limit | Admin, `refund_amount_cents > original` | `POST /api/payments/:id/refund` | Returns 400 |
| Refund without reason | Admin, no `refund_reason` | `POST /api/payments/:id/refund` | Returns 400 |
| Donation charity receipt | Completed donation | `POST /api/payments/:id/receipt` | Resend email with IRS charity language |
| Membership receipt | Completed membership payment | `POST /api/payments/:id/receipt` | Resend email stating "not a charitable contribution" |
| Invalid webhook signature | Tampered header | `POST /api/webhooks/stripe` | Returns 400 |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Stripe SDK, `req.text()` for raw body in App Router, Prisma transactions for atomic payment + membership update
- **Must Use:** Resend SDK for all receipt/reminder emails
- **Must Avoid:** `req.json()` on the webhook route (breaks signature verification)
- **Must Avoid:** floating-point or `Decimal` for monetary amounts — use `Int` (cents)

### 4.2 Patterns to Follow
- `await req.text()` then `stripe.webhooks.constructEvent()` for webhook signature verification
- Prisma `$transaction()` for atomic payment record creation + membership status update
- `withAuth()` from `lib/auth/with-auth.ts` for all auth-required routes
- Port logic from `apps/api/src/modules/payments/stripe.service.ts`

### 4.3 Files/Modules to Create
- `prisma/schema.prisma` — evolve `PaymentRecord` model + add `PaymentStatus`, `PaymentType` enums + add `MembershipFee` model
- `prisma/seed.ts` — add `MembershipFee` seed data for all 9 membership types
- `lib/payments/stripe.ts` — Stripe singleton, `createCheckoutSession()`, `createUpgradeSession()`, `createDonationSession()`, `issueRefund()`
- `lib/payments/webhook-handlers.ts` — `handlePaymentSuccess()`, `handlePaymentFailure()`
- `lib/payments/receipt.ts` — `sendMembershipReceipt()`, `sendDonationReceipt()` via Resend
- `lib/payments/payment-service.ts` — business logic: upgrade eligibility, cumulative paid calculation
- `lib/validation/payment.schema.ts` — Zod schemas for all payment routes
- `app/api/payments/checkout-session/route.ts` — new membership
- `app/api/payments/upgrade-session/route.ts` — membership upgrade
- `app/api/payments/donate/route.ts` — public, no auth required
- `app/api/payments/route.ts` — admin: list all payments
- `app/api/payments/me/route.ts` — member: own payment history
- `app/api/payments/[id]/refund/route.ts` — admin only
- `app/api/payments/[id]/receipt/route.ts` — member/donor: request receipt email
- `app/api/webhooks/stripe/route.ts` — public, no `withAuth()`
- `app/api/cron/expiry-reminders/route.ts` — Vercel cron, protected by `CRON_SECRET`
- `vercel.json` — add cron schedule

### 4.4 Files NOT to Modify
- `lib/auth/with-auth.ts`
- `lib/db/prisma.ts`

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- SPEC-2 (foundation-auth) — `withAuth()` required
- SPEC-3 (member-module) — `members` table must exist; membership activation updates member record

### 5.2 Downstream Impact
- Member `member_status` and `expiry_date` are written by this module
- Admin refund dashboard (future UI spec) reads from `payments` table

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should annual renewals auto-create a new checkout session via a cron job, or is renewal always member-initiated? | Resolved | Member-initiated. No auto-checkout. Instead: send reminder emails to the member (30 days, 7 days before expiry) and a notification email to admins when a membership is about to expire. |
| Is the Stripe nonprofit discount rate configured at the Stripe account level, or does the app need to apply it? | Resolved | Stripe account level. The nonprofit rate is set in the Stripe dashboard. The app uses the price as-is — no discount calculation in code. |
| How are membership fees managed? | Resolved | Seeded into `membership_fees` DB table; admin edits via Supabase Studio. No admin API endpoint needed. |
| How is upgrade cost calculated? | Resolved | `upgrade_cost = new_tier_price − cumulative_completed_payments_for_member`. Eligible if active OR expired ≤ 1 year. Expired > 1 year: pays full new tier price. |
| What format are receipts delivered in? | Resolved | Email only via Resend. Donation: IRS charity receipt. Membership: payment-evidence receipt stating "not a charitable contribution". |
| Can non-members donate? | Resolved | Yes. `member_id` is nullable on donation records. No auth required for `POST /api/payments/donate`. |
| Are Patron and Benefactor reachable via upgrade? | Resolved | No. They are separate recognition tiers requiring full payment always. Payments for these tiers do not count toward the Life membership cumulative total. |
| When member has accumulated enough to reach Life membership, do they get auto-upgraded? | Resolved | No auto-upgrade. On the member's next renewal/upgrade request, the system detects cumulative ≥ Life fee and either auto-activates (if cost = $0) or shows reduced upgrade price. The member initiates the action. |
| Does cumulative reset after a successful upgrade? | Resolved | No reset. The running total grows forever. This is intentional — a member who upgrades early and then the Life fee increases later will not be penalized. |

---

## 7. References

- [`docs/osa-architecture.md`](../../docs/osa-architecture.md) — `payments` schema, Stripe webhook data flow
- [`apps/api/src/modules/payments/stripe.service.ts`](../../apps/api/src/modules/payments/stripe.service.ts) — checkout and webhook logic to port
- [`apps/api/src/modules/payments/payments.controller.ts`](../../apps/api/src/modules/payments/payments.controller.ts) — webhook event switch cases to port

---

## Agent Workflow Tracking

### Phase 1: Analysis
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-4-payment-module/01-analysis.md`

### Phase 2: Design
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-4-payment-module/02-design.md`

### Phase 3: Implementation
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-4-payment-module/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-4-payment-module/04-qa-report.md`
