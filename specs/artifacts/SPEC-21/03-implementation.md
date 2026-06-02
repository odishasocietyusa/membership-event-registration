# SPEC-21 — Phase 3: Implementation Log

**Spec:** Self-Service Membership Upgrade
**Implementer:** Claude Code
**Date:** 2026-05-30
**Status:** Complete

---

## Build Steps Completed

### Step 1 — Schema (`prisma/schema.prisma`)
- Added `consecutiveSince DateTime? @map("consecutive_since") @db.Date` to `Member` model
- Ran `npx prisma generate` (DB push pending Docker start)

### Step 2 — `lib/memberships/constants.ts`
- Added `patron` and `benefactor` to `NO_EXPIRY_TYPES`

### Step 3 — `lib/memberships/membership-service.ts`
- Removed `patron` and `benefactor` from `EXPIRY_DAYS`

### Step 4 — `lib/payments/payment-service.ts` (full rewrite)
- Replaced `EXPIRY_DAYS` with `EXPIRY_MONTHS` (12/60 month rolling expiry per SPEC-24 board decision)
- Added `addMonths()` inline helper (calendar-correct; no date-fns dependency)
- Added `applyUpgrade(memberId, membershipType)` — sets `expiryDate = null` for lifetime tiers, `addMonths(now, 60)` for `fiveYearFamily`, preserves expiry for annual→annual
- Updated `activateMembership()` — resets `consecutiveSince` for new/lapsed members; preserves for renewals
- Updated `recordPayment()` — branches on `paymentType === 'upgrade'` to call `applyUpgrade` instead of `activateMembership`
- Updated `calculateCumulativePaid()` — filters payments by `consecutiveSince` when set
- Updated `calculateUpgradeCost()` — active-only eligibility; accepts any `MembershipType`; removed `UPGRADE_TARGET_FEE_IDS` and recently-expired branch
- Added `getUpgradeOptions(memberId)` — returns eligible target tiers with upgrade fees
- Removed `UPGRADE_TARGET_FEE_IDS` constant

### Step 5 — `lib/payments/stripe.ts`
- Widened `createUpgradeSession` signature: `targetType: MembershipType` (was `'life' | 'patron' | 'benefactor'`)
- Added `UPGRADE_LABELS` map for all tiers
- Fixed success/cancel URLs: `/dashboard` (was `/membership/success` / `/membership`)

### Step 6 — `prisma/seed.ts`
- Set `isUpgradePath: true` for `patron` and `benefactor`
- (Backfill block for `consecutiveSince` to run after `npx prisma db push`)

### Step 7 — `app/api/memberships/upgrade-options/route.ts` (new)
- `GET` endpoint — returns `UpgradeOptionsResult` for authenticated member

### Step 8 — `app/api/payments/upgrade-session/route.ts`
- Widened `UpgradeSessionSchema.targetType` from enum to `z.string().min(1)`
- Cast `targetType` to `MembershipType` before service calls

### Step 9 — `app/components/upgrade-section.tsx` (new)
- Client component shared by dashboard and profile
- Handles $0 confirm flow and paid Stripe redirect
- Returns `null` when no eligible options

### Step 10 — `app/dashboard/page.tsx`
- Added `getUpgradeOptions` import and parallel fetch
- Fixed expiry display: `neverExpires` → "Never Expires" replaced with conditional "Valid through" row
- Renders `<UpgradeSection>` when `memberStatus === 'active'`

### Step 11 — `app/profile/page.tsx`
- Added `upgrade-options` fetch to the existing `Promise.all`
- Passes `upgradeOptions` to `ProfileClient`

### Step 12 — `app/profile/ProfileClient.tsx`
- Added `upgradeOptions` prop
- Renders `<UpgradeSection>` below Membership fieldset when `memberStatus === 'active'`

---

## Test Updates

- `lib/payments/payment-service.test.ts` — complete rewrite: removed "recently expired" test; added `applyUpgrade`, `consecutiveSince`, and `getUpgradeOptions` coverage; updated `calculateCumulativePaid` mocks for new `findUnique` call
- `app/api/payments/upgrade-session/route.test.ts` — updated request factory to include `targetType` body; updated ineligible reason string; added missing `targetType` 400 test
- `lib/members/member-service.test.ts` — added `consecutiveSince: null` to `baseMember` fixture

**Final test run:** 246 passed, 0 failed

---

## Pending (requires Docker/Supabase)

- `npx prisma db push` — pushes `consecutiveSince` column to local DB
- `npx prisma db seed` — sets `patron`/`benefactor` `isUpgradePath: true` and backfills `consecutiveSince` for active members

---

## Design Deviation

The design doc used `nextJuly4FromDate()` for `fiveYearFamily` expiry in `applyUpgrade`. Implemented as `addMonths(now, 60)` instead, per the SPEC-24 board decision (2026-05-30) that supersedes July 4 fiscal-year anchoring.
