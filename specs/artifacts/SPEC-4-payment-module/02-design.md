# SPEC-4 Design — Payment Module

> Phase 2 / Architect Agent  
> Date: 2026-05-14  
> Input: `01-analysis.md` + codebase survey

---

## 1. Schema Changes (`apps/web/prisma/schema.prisma`)

### 1.1 New Enums

```
PaymentStatus   → pending | completed | failed | refunded
PaymentType     → membership | upgrade | donation
```

### 1.2 Evolve `PaymentRecord`

Replace the current under-specified model with the full ledger record.

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String @id @default(uuid()) @db.Uuid` | unchanged |
| `memberId` | `String? @db.Uuid` | nullable — anonymous donations |
| `stripeSessionId` | `String?` | Stripe checkout session ID |
| `stripeEventId` | `String? @unique` | idempotency guard; null for $0 upgrades |
| `stripePaymentIntentId` | `String?` | for refund calls |
| `status` | `PaymentStatus @default(pending)` | lifecycle state |
| `paymentType` | `PaymentType` | membership / upgrade / donation |
| `membershipType` | `MembershipType?` | which tier this payment was for |
| `amountCents` | `Int` | cents; replaces `amount Decimal` |
| `refundAmountCents` | `Int?` | set on partial or full refund |
| `refundReason` | `String?` | required when status = refunded |
| `approvedBy` | `String?` | admin email/id string, not FK |
| `isAdminInitiated` | `Boolean @default(false)` | true only for $0 upgrade auto-activations |
| `isAnonymous` | `Boolean @default(false)` | donations: hide identity in API responses |
| `receiptRequestedAt` | `DateTime?` | set when member calls receipt endpoint |
| `currency` | `String @default("usd")` | |
| `createdAt` | `DateTime @default(now())` | |

Drop: `transactionId`, `paymentDate`, `amount Decimal`, `notes`.

`memberId` becomes nullable (anonymous donations). The `Member.paymentRecords` relation still works — Prisma supports nullable FK relations.

### 1.3 New `MembershipFee` Model

```
id               String @id                  -- slug = MembershipType enum value
membershipType   MembershipType @unique
amountDollars    Int                         -- whole dollars; admin reads this in Supabase Studio
isUpgradePath    Boolean @default(false)     -- true for tiers that count toward Life cumulative
isAdminOnly      Boolean @default(false)     -- true = excluded from public tier listings; admin-granted only
createdAt        DateTime @default(now())
```

Purpose: DB-driven pricing. Admin edits rows directly in Supabase Studio. No API endpoint needed.

**Note on units:** `amountDollars` is stored in whole dollars (not cents) for human readability in Supabase Studio. `stripe.ts` multiplies by 100 when creating Stripe checkout sessions. `PaymentRecord.amountCents` is still stored in cents (Stripe-native).

---

## 2. Seed Data (`apps/web/prisma/seed.ts`)

Add a `membershipFees` array seeded via `upsert`. Prices in whole dollars:

| Membership Type | Amount ($) | isUpgradePath | isAdminOnly |
|----------------|-----------|---------------|-------------|
| annual-student-no-vote | 20 | true | false |
| annual-single | 25 | true | false |
| annual-family | 40 | true | false |
| five-year-family | 100 | true | false |
| life | 200 | true | false |
| life-ward | 100 | true | false |
| patron | 500 | false | false |
| benefactor | 1000 | false | false |
| honorary-no-vote | 0 | false | true |

`honorary-no-vote`: `isAdminOnly = true` — row exists for completeness and admin tooling, but excluded from all public-facing tier listing responses. No payment flow; admin backend grants it directly.

---

## 3. Package Dependencies

`stripe` is not yet in `apps/web/package.json`. Add:
- `stripe` — latest v17 (matches NestJS API's version)
- `resend` — already present at `^4.0.0` ✅

---

## 4. Library Layer (`apps/web/lib/payments/`)

### 4.1 `stripe.ts`
- Exports a singleton `stripe` client (constructed once, throws at startup if `STRIPE_SECRET_KEY` missing in non-test env)
- `createCheckoutSession(memberId, membershipType, feeAmountDollars)` → Stripe checkout URL; multiplies `feeAmountDollars * 100` internally before passing to Stripe
- `createUpgradeSession(memberId, upgradeCostCents)` → Stripe checkout URL  
- `createDonationSession(amountCents, memberId?)` → Stripe checkout URL
- `issueRefund(stripePaymentIntentId, refundAmountCents)` → Stripe refund object

All sessions include `metadata` with `memberId`, `paymentType`, `membershipType` (where applicable) so the webhook handler can reconstruct context without a DB lookup.

### 4.2 `payment-service.ts`
Business logic layer — no Stripe SDK calls, no HTTP:

- `calculateCumulativePaid(memberId)` — sums `amountCents` from all `completed` `PaymentRecord` rows where `paymentType` in `[membership, upgrade]` and the associated `membershipType.isUpgradePath = true`
- `calculateUpgradeCost(memberId)` → `{ costCents, eligible, reason }` — checks eligibility (active OR expired ≤ 1 year), fetches Life fee from DB, subtracts cumulative paid; returns `costCents = 0` when cumulative ≥ Life fee
- `activateMembership(memberId, membershipType)` — Prisma update: `memberStatus = active`, set `expiryDate` per tier (null for Life/Life-Ward), set `membershipType`
- `recordPayment(data)` — wraps insert in Prisma `$transaction` together with `activateMembership` for webhook use

### 4.3 `webhook-handlers.ts`
- `handleCheckoutCompleted(session)` — idempotency check on `stripeEventId`, calls `recordPayment` + `activateMembership` in `$transaction`; catches Prisma P2002 and returns silently
- `handlePaymentFailed(session)` — inserts or updates record to `status = failed`

### 4.4 `receipt.ts`
Thin wrappers around the `resend` SDK already present in the project.

- `sendMembershipReceipt(member, paymentRecord)` — sends payment-evidence email; body explicitly states "this is not a charitable contribution"
- `sendDonationReceipt(donorEmail, paymentRecord, orgDetails)` — sends IRS 501(c)(3) charity receipt; includes org name, EIN, donation date, amount, no-goods-or-services statement

`orgDetails` (EIN, org name) come from env vars `RESEND_ORG_NAME` and `RESEND_ORG_EIN`.

---

## 5. Zod Schemas (`apps/web/lib/validation/payment.schema.ts`)

| Schema | Key fields |
|--------|-----------|
| `CheckoutSessionSchema` | `membershipType: MembershipType` |
| `UpgradeSessionSchema` | (no body — current member implied from auth) |
| `DonateSchema` | `amountCents: z.number().int().min(100)`, `isAnonymous?: boolean` |
| `RefundSchema` | `refundAmountCents: z.number().int().positive()`, `refundReason: z.string().min(1)` |

---

## 6. API Routes

All routes follow the established pattern: `withAuth()` + Zod parse + service call + `jsonResponse()`.

| Method | Route | Auth | Handler summary |
|--------|-------|------|----------------|
| POST | `/api/payments/checkout-session` | member | Fetch fee from DB → `createCheckoutSession()` → return `{ url }` |
| POST | `/api/payments/upgrade-session` | member | `calculateUpgradeCost()` → if $0 auto-activate; else `createUpgradeSession()` → return `{ url }` or `{ activated: true }` |
| POST | `/api/payments/donate` | none | Parse body → `createDonationSession()` → return `{ url }` |
| GET | `/api/payments` | admin | `prisma.paymentRecord.findMany()` with pagination query params |
| GET | `/api/payments/me` | member | `prisma.paymentRecord.findMany({ where: { memberId } })` |
| POST | `/api/payments/[id]/refund` | admin | Validate amount ≤ original → `issueRefund()` → update DB record |
| POST | `/api/payments/[id]/receipt` | member | Look up record, determine type, call `sendMembershipReceipt` or `sendDonationReceipt`, stamp `receiptRequestedAt` |
| POST | `/api/webhooks/stripe` | none | `req.text()` → `constructEvent()` → switch on event type → handlers |
| GET | `/api/cron/expiry-reminders` | CRON_SECRET header | Query members expiring in ≤30d, send Resend emails |

### Route-specific notes

**`/api/payments/donate`**: No `withAuth()` wrapper. Reads optional `Authorization` header manually to attach `memberId` if present. If no valid token, `memberId = null`.

**`/api/webhooks/stripe`**: Must **not** use `withAuth()`. Must call `await req.text()` before anything else. Returns 400 on signature failure, 200 on success or known-duplicate.

**`/api/cron/expiry-reminders`**: Verifies `Authorization: Bearer <CRON_SECRET>` header. Queries members where `expiryDate` is between now and +30 days and `memberStatus = active`. Sends 30-day or 7-day email based on proximity. Sends admin notification for all expiring within 30 days.

**`/api/payments/[id]/refund`**: Validates `refundAmountCents ≤ paymentRecord.amountCents`. If already refunded, returns 409. Updates `status = refunded`, sets `refundAmountCents`, `refundReason`, `approvedBy = user.email`.

**`/api/payments` (admin list)**: Supports query params `page`, `limit`, `memberId`, `status`, `paymentType`. Excludes `isAnonymous = true` donor identity fields from response (return `memberId: null` in those rows).

---

## 7. Environment Variables

Add to `.env.local`:
```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CRON_SECRET=
RESEND_FROM_EMAIL=
RESEND_ORG_NAME=
RESEND_ORG_EIN=
```

---

## 8. Vercel Cron (`vercel.json`)

Add a `crons` entry:
```json
{ "path": "/api/cron/expiry-reminders", "schedule": "0 9 * * *" }
```
Runs daily at 09:00 UTC.

---

## 9. Data Flow Diagrams

### Membership Checkout
```
Client → POST /api/payments/checkout-session
  → withAuth → validateMembership type
  → fetch MembershipFee from DB
  → stripe.createCheckoutSession(metadata)
  → return { url }
Client → Stripe Checkout page
Stripe → POST /api/webhooks/stripe (checkout.session.completed)
  → verify signature
  → handleCheckoutCompleted()
    → $transaction: insert PaymentRecord + activateMembership
```

### Upgrade (paid)
```
Client → POST /api/payments/upgrade-session
  → calculateCumulativePaid()
  → calculateUpgradeCost()  [eligible check + cost = Life fee − cumulative]
  → stripe.createUpgradeSession(costCents, metadata)
  → return { url }
  → (webhook same as above; sets membershipType = life, expiryDate = null)
```

### Upgrade ($0 auto-activate)
```
Client → POST /api/payments/upgrade-session
  → calculateUpgradeCost() → costCents = 0
  → activateMembership(memberId, 'life')
  → insert PaymentRecord { amountCents: 0, isAdminInitiated: false, status: completed }
  → return { activated: true }
```

---

## 10. Implementation Sequence

1. **Schema** — evolve `PaymentRecord`, add `MembershipFee`, add enums → run migration
2. **Seed** — add `membershipFees` to `seed.ts` → run seed
3. **Add stripe package** — `pnpm add stripe --filter=web`
4. **`lib/payments/stripe.ts`** — Stripe singleton + session/refund functions
5. **`lib/payments/payment-service.ts`** — business logic (cumulative calc, upgrade eligibility, activate)
6. **`lib/payments/webhook-handlers.ts`** — checkout completed, payment failed
7. **`lib/payments/receipt.ts`** — Resend email wrappers
8. **`lib/validation/payment.schema.ts`** — Zod schemas
9. **API routes** — in order: checkout-session → upgrade-session → donate → me → admin list → refund → receipt → webhook → cron
10. **`vercel.json`** — cron entry

---

## 11. Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| `memberId` nullable on `PaymentRecord` | Anonymous donations have no member row; preserves the `Member.paymentRecords` relation for member-linked payments |
| `stripeEventId @unique` nullable (not required) | $0 upgrade auto-activations never touch Stripe; no event ID to store |
| `isUpgradePath` on `MembershipFee` model | Single source of truth for which tiers count toward Life cumulative; avoids hardcoded list in service logic |
| Prices from `MembershipFee` table (not hardcoded) | Spec FR-01: admin editable via Supabase Studio; retrieved at session creation time |
| `approvedBy` as `String?` not FK | Admin accounts can be deleted without corrupting refund audit trail |
| Cron hits `/api/cron/expiry-reminders` daily | Simple Vercel cron; secret-protected; no external scheduler needed |
| Donation route skips `withAuth()`, reads auth header manually | Non-members can donate; member identity attached when token present |
