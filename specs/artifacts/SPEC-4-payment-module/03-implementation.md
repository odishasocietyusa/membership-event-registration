# SPEC-4 Implementation Log — Payment Module

> Phase 3 / Implementer Agent  
> Date: 2026-05-14  
> Input: `02-design.md`

---

## Summary

All files from the implementation sequence in `02-design.md` have been created or modified.

---

## Files Changed

### Modified

| File | Change |
|------|--------|
| `apps/web/prisma/schema.prisma` | Added `PaymentStatus`, `PaymentType` enums; replaced `PaymentRecord` model; added `MembershipFee` model |
| `apps/web/prisma/seed.ts` | Added `membershipFees` array + seed loop for all 9 membership types |
| `apps/web/package.json` | Added `"stripe": "^20.0.0"` to dependencies |

### Created

| File | Purpose |
|------|---------|
| `apps/web/lib/payments/stripe.ts` | Stripe singleton + `createCheckoutSession`, `createUpgradeSession`, `createDonationSession`, `issueRefund` |
| `apps/web/lib/payments/payment-service.ts` | Business logic: `calculateCumulativePaid`, `calculateUpgradeCost`, `activateMembership`, `recordPayment` |
| `apps/web/lib/payments/webhook-handlers.ts` | `handleCheckoutCompleted` (with P2002 idempotency), `handlePaymentFailed` |
| `apps/web/lib/payments/receipt.ts` | `sendMembershipReceipt`, `sendDonationReceipt` via Resend |
| `apps/web/lib/validation/payment.schema.ts` | Zod schemas: `CheckoutSessionSchema`, `DonateSchema`, `RefundSchema`, `ListPaymentsQuerySchema` |
| `apps/web/app/api/payments/checkout-session/route.ts` | POST — fetch fee from DB, create Stripe checkout session |
| `apps/web/app/api/payments/upgrade-session/route.ts` | POST — compute upgrade cost, auto-activate $0 upgrades, else create Stripe session |
| `apps/web/app/api/payments/donate/route.ts` | POST — public, optional auth, creates donation checkout |
| `apps/web/app/api/payments/route.ts` | GET (admin) — paginated payment list, masks anonymous donor identity |
| `apps/web/app/api/payments/me/route.ts` | GET — authenticated member's own payment history |
| `apps/web/app/api/payments/[id]/refund/route.ts` | POST (admin) — validates amount, calls Stripe refund, updates DB |
| `apps/web/app/api/payments/[id]/receipt/route.ts` | POST — sends correct receipt email, stamps `receiptRequestedAt` |
| `apps/web/app/api/webhooks/stripe/route.ts` | POST (public) — verifies signature, dispatches to handlers |
| `apps/web/app/api/cron/expiry-reminders/route.ts` | GET — CRON_SECRET protected, sends member and admin reminder emails |
| `apps/web/vercel.json` | Vercel cron: runs expiry-reminders daily at 09:00 UTC |

---

## Setup Steps Required

After pulling this branch, run in order:

```bash
cd apps/web

# 1. Install stripe (requires network)
pnpm install

# 2. Apply schema to database
pnpm prisma:push

# 3. Seed membership fees
pnpm prisma:seed
```

Add to `apps/web/.env.local`:
```
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CRON_SECRET=
RESEND_FROM_EMAIL=
RESEND_ORG_NAME=The Odisha Society of the Americas
RESEND_ORG_EIN=
ADMIN_NOTIFICATION_EMAIL=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

---

## Known Issues

### Pre-existing: `@prisma/client` TypeScript type resolution

`tsc --noEmit` reports `Module '"@prisma/client"' has no exported member X` across the entire project (including pre-existing files `lib/auth/with-auth.ts` and `lib/members/member-service.ts`). This is a pnpm virtual store symlink resolution issue with `"moduleResolution": "bundler"` in tsconfig — it does not affect the Next.js build or Prisma runtime. Resolves when `pnpm install` is run with full network access, which re-creates the `.prisma` symlinks correctly.

### stripe package not yet installed

`pnpm install` failed due to network TLS certificate error (`UNABLE_TO_GET_ISSUER_CERT_LOCALLY`). The `stripe` package is declared in `package.json` but not yet in `node_modules`. Run `pnpm install` when network is available.

---

## Deviations from Design

| Deviation | Reason |
|-----------|--------|
| `ADMIN_NOTIFICATION_EMAIL` env var added | Cron route needs an admin email target; not in design but required for the feature to function |
| `NEXT_PUBLIC_SITE_URL` env var added | Used to build Stripe `success_url` / `cancel_url`; must be public to work in both server and client contexts |
