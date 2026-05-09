# Feature Specification: Payment Module

> **Spec ID:** SPEC-4-payment-module
> **Status:** Draft
> **Author:** Utkal Nayak

---

## 1. Overview

### 1.1 Summary
Implement Stripe-based payment processing for annual and lifetime memberships, including checkout session creation, webhook handling, membership activation on successful payment, renewal expiry tracking, and admin-initiated refunds. All financial operations are recorded in the `payments` table for 501(c)(3) audit compliance.

### 1.2 Goals
- [ ] Member can initiate a Stripe checkout for their membership type
- [ ] Stripe webhook activates membership and updates `expiry_date` on successful payment
- [ ] Webhook events are idempotent — duplicate events do not create duplicate payment records
- [ ] Admin can issue refunds with a required reason field
- [ ] Member can view their own payment history
- [ ] All amounts stored as cents (no float arithmetic)

### 1.3 Non-Goals (Out of Scope)
- Donation flows (deferred)
- Event registration payments (deferred)
- Subscription/recurring billing beyond annual renewal

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Member can create a Stripe checkout session for their membership | Must Have | Returns Stripe-hosted checkout URL |
| FR-02 | Successful payment activates membership and sets `expiry_date` | Must Have | Via webhook |
| FR-03 | `stripe_event_id` uniqueness prevents duplicate payment records | Must Have | Idempotency check |
| FR-04 | Failed or expired checkout is recorded with `status = failed/pending` | Must Have | |
| FR-05 | Member can view their own payment history | Must Have | `GET /api/payments/me` |
| FR-06 | Admin can view all payments | Must Have | `GET /api/payments` |
| FR-07 | Admin can initiate a refund with a mandatory `refund_reason` | Must Have | Required for nonprofit audit |
| FR-08 | Refund updates payment `status = refunded` and records `approved_by` | Must Have | |
| FR-09 | Webhook endpoint verifies Stripe signature before processing | Must Have | Raw body + `STRIPE_WEBHOOK_SECRET` |
| FR-10 | Send reminder email to member 30 days and 7 days before expiry | Must Have | Via Resend + cron job |
| FR-11 | Send notification email to admins when any membership is within 30 days of expiry | Must Have | Via Resend + cron job |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Webhook signature verification | All events verified | `stripe.webhooks.constructEvent()` with `req.text()` |
| NFR-02 | Amounts stored as cents | No `float` or `Decimal` for money | `amount_cents: Int` in Prisma |
| NFR-03 | Refund audit trail | `refund_reason` + `approved_by` always set | DB constraint |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] `POST /api/payments/checkout-session` returns a valid Stripe checkout URL
- [ ] Completing checkout in Stripe triggers webhook, creates payment record, updates `member_status = active` and `expiry_date`
- [ ] Sending the same webhook event twice does not create a second payment record
- [ ] `GET /api/payments/me` returns the authenticated member's payment history
- [ ] `POST /api/payments/:id/refund` (admin) creates refund in Stripe and updates DB record
- [ ] Webhook with invalid signature returns 400
- [ ] All tests passing

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Checkout session creation | Authenticated member | `POST /api/payments/checkout-session` with membership type | Returns `{ url: 'https://checkout.stripe.com/...' }` |
| Payment success webhook | Valid Stripe signature | `checkout.session.completed` event | Payment record created, `member_status = active`, `expiry_date` set |
| Duplicate webhook | Same `stripe_event_id` already in DB | Same event delivered again | Second insert rejected, returns 200 (no-op) |
| Failed payment webhook | `checkout.session.async_payment_failed` | Webhook received | Payment record with `status = failed` |
| View payment history | Authenticated member | `GET /api/payments/me` | Returns own payments only |
| View other member's payments | Member-role user | `GET /api/payments/:other-member-payment-id` | Returns 403 |
| Admin refund | Admin user | `POST /api/payments/:id/refund` with `refund_reason` | Stripe refund issued, DB updated |
| Refund without reason | Admin user | `POST /api/payments/:id/refund` with no `refund_reason` | Returns 400 |
| Invalid webhook signature | Tampered or missing signature header | `POST /api/webhooks/stripe` | Returns 400 |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Stripe SDK, `req.text()` for raw body in App Router, Prisma transactions for atomic payment + membership update
- **Must Avoid:** `req.json()` on the webhook route (breaks signature verification)

### 4.2 Patterns to Follow
- `await req.text()` then `stripe.webhooks.constructEvent()` — see approved plan at `.claude/plans/on-another-claude-session-dreamy-kahan.md`
- Prisma `$transaction()` for atomic payment record creation + membership status update
- Port logic from `apps/api/src/modules/payments/stripe.service.ts`

### 4.3 Files/Modules to Create
- `prisma/schema.prisma` — add `payments` model
- `lib/payments/stripe.ts` — Stripe singleton + `createCheckoutSession()`
- `lib/payments/webhook-handlers.ts` — `handlePaymentSuccess()`, `handlePaymentFailure()`
- `app/api/payments/checkout-session/route.ts`
- `app/api/payments/me/route.ts`
- `app/api/payments/[id]/refund/route.ts` — admin only
- `app/api/webhooks/stripe/route.ts` — public, no `withAuth()`
- `lib/validation/payment.schema.ts` — Zod schemas

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

---

## 7. References

- [`docs/osa-architecture.md`](../../docs/osa-architecture.md) — `payments` schema, Stripe webhook data flow
- [`apps/api/src/modules/payments/stripe.service.ts`](../../apps/api/src/modules/payments/stripe.service.ts) — checkout and webhook logic to port
- [`apps/api/src/modules/payments/payments.controller.ts`](../../apps/api/src/modules/payments/payments.controller.ts) — webhook event switch cases to port

---

## Agent Workflow Tracking

### Phase 1: Analysis
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-4-payment-module/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-4-payment-module/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-4-payment-module/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-4-payment-module/04-qa-report.md`
