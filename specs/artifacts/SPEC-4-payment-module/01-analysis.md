# SPEC-4 Analysis — Payment Module

> Phase 1 / Analyst Agent
> Date: 2026-05-14
> **Note:** Spec scope was expanded after initial analysis. This document reflects the final expanded scope.

---

## 1. Requirements Extracted

### Functional (from spec §2.1)

| ID | Requirement | Notes |
|----|-------------|-------|
| FR-01 | `POST /api/payments/checkout-session` → Stripe checkout URL | Auth required; member-only |
| FR-02 | Webhook activates membership (`member_status=active`, sets `expiry_date`) | Via `checkout.session.completed` |
| FR-03 | `stripe_event_id` uniqueness guards against duplicate payment records | Unique DB constraint |
| FR-04 | Failed/expired checkout creates record with `status=failed` | Via `checkout.session.expired` / `async_payment_failed` |
| FR-05 | `GET /api/payments/me` → authenticated member's own payment history | Auth required |
| FR-06 | `GET /api/payments` → all payments (admin) | Admin-only |
| FR-07 | `POST /api/payments/:id/refund` → Stripe refund + DB update (admin) | `refund_reason` required |
| FR-08 | Refund records `status=refunded`, `refund_reason`, `approved_by` | |
| FR-09 | Webhook verifies Stripe signature before processing | `req.text()` + `constructEvent()` |
| FR-10 | Reminder emails: member 30d and 7d before expiry | Resend + Vercel cron |
| FR-11 | Admin notification: any membership expiring within 30d | Resend + Vercel cron |

### Non-Functional (from spec §2.2)

| ID | Requirement |
|----|-------------|
| NFR-01 | Webhook signature verified on every event |
| NFR-02 | Amounts stored as **integer cents** (`amount_cents Int`) — no floats or Decimals |
| NFR-03 | `refund_reason` + `approved_by` always present on refunded records |

---

## 2. Codebase Findings

### 2.1 What already exists

| Artifact | Location | Relevance |
|----------|----------|-----------|
| `PaymentRecord` Prisma model | `apps/web/prisma/schema.prisma:150-161` | Exists but under-specified — see §3.1 |
| `Member.paymentRecords` relation | `schema.prisma:117` | Will remain pointing at the evolved model |
| `Member.stripeCustomerId` field | `schema.prisma:97` | Already on Member — can be set at checkout |
| `withAuth()` | `lib/auth/with-auth.ts` | Standard auth wrapper used by all other routes |
| `prisma` singleton | `lib/db/prisma.ts` | Shared DB client |
| Route pattern | `app/api/members/me/route.ts` | `withAuth` + Zod parse + service call pattern |
| NestJS stripe service | `apps/api/src/modules/payments/stripe.service.ts` | Reference implementation to port |
| NestJS payments controller | `apps/api/src/modules/payments/payments.controller.ts` | Reference for webhook switch, refund logic |

### 2.2 Stripe package status

```bash
# Need to verify stripe SDK is installed
```
The NestJS app uses `stripe` SDK. The web app's `package.json` needs to be checked — likely not installed yet.

### 2.3 Resend package status

Not present in `lib/` anywhere. FR-10/FR-11 require it. Must add as a dependency.

---

## 3. Gap Analysis

### 3.1 `PaymentRecord` model is insufficient

The current model:
```prisma
model PaymentRecord {
  id            String    @id @default(uuid())
  memberId      String
  transactionId String?
  paymentDate   DateTime?
  amount        Decimal?  // ← violates NFR-02 (must be integer cents)
  notes         String?
  createdAt     DateTime
}
```

Missing fields required by spec:
- `stripeEventId String @unique` — idempotency guard (FR-03)
- `stripeSessionId String?` — links checkout session to payment record
- `status PaymentStatus` enum — pending / completed / failed / refunded (FR-04, FR-08)
- `amountCents Int` — replace `amount Decimal` per NFR-02
- `membershipType MembershipType?` — for audit/display context
- `refundReason String?` — required when `status=refunded` (FR-07)
- `approvedBy String?` — admin member ID (FR-08)
- `currency String @default("usd")`

**Decision**: Evolve `PaymentRecord` in-place. Do not create a parallel `Payment` model — the `Member.paymentRecords` relation already exists and SPEC-3 references `PaymentRecord` in `exportMemberData`. Keep the existing relation name; add new fields; drop `amount Decimal` and `notes` (replaced by structured fields + `refundReason`).

### 3.2 Pricing table gap

No `MembershipTypePricing` table exists. The spec says the Stripe nonprofit discount is handled at the Stripe account level — the app uses prices as-is. Decision: define a `MEMBERSHIP_PRICES` constant map in `lib/payments/stripe.ts` keyed by `MembershipType` enum values (in cents). This is derivable from OSA's published pricing and is the simplest option.

### 3.3 Webhook raw-body constraint

Next.js App Router passes a `Request` object. To get the raw body for Stripe signature verification, the route **must** call `await req.text()` — not `req.json()`. The spec calls this out explicitly in §4.1. The `app/api/webhooks/stripe/route.ts` must be a `POST` handler that reads `req.text()` and calls `stripe.webhooks.constructEvent()`.

No special middleware config is needed — Next.js does not parse bodies automatically in App Router route handlers.

### 3.4 Cron jobs (FR-10, FR-11)

Vercel cron syntax: define in `vercel.json`. Route: `app/api/cron/expiry-reminders/route.ts`. The endpoint must verify a `CRON_SECRET` header to prevent unauthenticated calls. Queries members whose `expiry_date` is within 30 days, sends email via Resend.

### 3.5 Admin `GET /api/payments` endpoint

FR-06 is not listed in spec §4.3 (files to create), but is a stated requirement. Route: `app/api/payments/route.ts` (GET handler). Must be added.

### 3.6 `stripe` and `resend` packages

Must be added to `apps/web/package.json`. The NestJS API already uses `stripe` at version from its own `package.json` — use the same major version.

---

## 4. Edge Cases and Risks

| Risk | Mitigation |
|------|-----------|
| Webhook delivered before DB write completes | Prisma `$transaction` wraps payment insert + member update atomically |
| Duplicate `checkout.session.completed` events | `stripeEventId @unique` on `PaymentRecord`; catch P2002 and return 200 |
| Refund called on already-refunded payment | Service function checks `status === refunded` and throws `ALREADY_REFUNDED` |
| Checkout session for member with no `membershipType` set | Return 400 before creating Stripe session |
| `expiry_date` for life/patron memberships | These membership types have no expiry — set `expiry_date = null` and skip cron reminders |
| Missing `STRIPE_WEBHOOK_SECRET` env var | `stripe.ts` throws at startup if secret missing in non-test env |
| `approved_by` referential integrity | Store as `String?` (member ID or email), not a FK — prevents issues if admin account is deleted |

---

## 5. Dependency Confirmation

- **SPEC-2** (withAuth, roles): ✅ merged to main
- **SPEC-3** (members table, member-service): ✅ merged to main — `Member` model has `membershipType`, `memberStatus`, `expiryDate`, `stripeCustomerId` fields needed by this spec

---

## 6. Clarifying Questions

None — all open questions in the spec are marked Resolved.

---

## 7. Implementation Scope Summary

**Files to create:**
- `lib/payments/stripe.ts`
- `lib/payments/webhook-handlers.ts`
- `lib/validation/payment.schema.ts`
- `app/api/payments/checkout-session/route.ts`
- `app/api/payments/route.ts` (admin list — added per FR-06)
- `app/api/payments/me/route.ts`
- `app/api/payments/[id]/refund/route.ts`
- `app/api/webhooks/stripe/route.ts`
- `app/api/cron/expiry-reminders/route.ts`

**Files to modify:**
- `prisma/schema.prisma` — evolve `PaymentRecord` model + add `PaymentStatus` enum
- `apps/web/package.json` — add `stripe`, `resend`
- `vercel.json` — add cron schedule for expiry reminders

**Files NOT to touch (per spec §4.4):**
- `lib/auth/with-auth.ts`
- `lib/db/prisma.ts`
