# Phase 2: Design Document

> **Spec:** SPEC-24-rolling-membership-expiry
> **Architect Agent:** Antigravity (agy)
> **Date:** 2026-06-06
> **Status:** Ready for Review

---

## 1. Design Overview

### 1.1 Solution Summary
This design replaces the day-based membership expiry placeholder logic with a calendar-month rolling membership expiry. 
1. **New pure utility function** `computeExpiryDate(type: MembershipType, paymentDate: Date): Date | null` will be implemented using `date-fns` (`addMonths`).
2. **Move Constants**: `EXPIRY_MONTHS` will be defined and exported in `apps/web/lib/memberships/constants.ts`. The legacy `EXPIRY_DAYS` constant will be completely removed.
3. **Refactor Services**:
   - `apps/web/lib/memberships/membership-service.ts` will use the new `computeExpiryDate` utility inside `approveMembership`.
   - `apps/web/lib/payments/payment-service.ts` will import `computeExpiryDate`, remove its local `addMonths` helper and local `EXPIRY_MONTHS` definition, and update `activateMembership` and `applyUpgrade` parameters to accept an explicit `paymentDate: Date`.
   - `recordPayment` will extract the payment record's `createdAt` timestamp (or `input.paymentDate`) and pass it to `activateMembership` and `applyUpgrade`, eliminating time/clock drift.
4. **Update SPEC-21 Design Document**: A warning/superseded notice will be appended to the July 4 upgrade calculation sections in `specs/artifacts/SPEC-21/02-design.md`.

### 1.2 Design Principles Applied
- **Surgical scope**: Only touch the files necessary to transition from day-based/July 4th concepts to the rolling month expiry model.
- **Verification-first**: Define exact unit tests to check leap years, end-of-month clamps, and all membership tier categories (including non-expiring tiers).
- **Zero clock drift**: Anchor expiry dates to the database transaction timestamp (`PaymentRecord.createdAt`) or Stripe payment timestamp rather than `new Date()` CPU clock inside service files.

---

## 2. Codebase Analysis

### 2.1 Existing Patterns Identified

| Pattern | Location | Will Reuse? |
|---------|----------|-------------|
| Centralized membership types and sets | `apps/web/lib/memberships/constants.ts` | Yes |
| Service module with Prisma transactions | `apps/web/lib/payments/payment-service.ts` | Yes |
| Jest service unit tests using mocked db | `apps/web/lib/payments/payment-service.test.ts` | Yes |

### 2.2 Related Existing Code

| File | Relevance | Action |
|------|-----------|--------|
| `apps/web/lib/memberships/constants.ts` | Exposes `NO_EXPIRY_TYPES` set | Add `EXPIRY_MONTHS` and remove legacy day-based exports |
| `apps/web/lib/memberships/membership-service.ts` | Calculates expiry using legacy `EXPIRY_DAYS` days | Replace calculations with `computeExpiryDate` utility |
| `apps/web/lib/payments/payment-service.ts` | Handles activations and upgrades with inline day/month logic | Update signatures to accept `paymentDate` and call `computeExpiryDate` |
| `specs/artifacts/SPEC-21/02-design.md` | Contains obsolete July 4 upgrade anchor logic | Add note documenting it is superseded |

### 2.3 Conventions to Follow
- **Function definition**: Pure function `computeExpiryDate(type: MembershipType, paymentDate: Date): Date | null` co-located in `apps/web/lib/memberships/expiry.ts`.
- **Imports**: Resolve modules using TS path aliases where applicable (e.g. `@/lib/memberships/constants` or `./constants` inside its own directory).

---

## 3. Architecture Design

### 3.1 Component Diagram

```
┌────────────────────────────────────────────────────────┐
│             lib/payments/payment-service.ts            │
│                                                        │
│  - recordPayment()                                     │
│  - activateMembership(..., paymentDate)                 │
│  - applyUpgrade(..., paymentDate)                      │
└───────┬────────────────────────────────────────────────┘
        │
        │ (calls)
        ▼
┌────────────────────────────────────────────────────────┐
│             lib/memberships/expiry.ts                  │
│                                                        │
│  - computeExpiryDate(type, paymentDate)                │
└───────┬─────────────────────────────┬──────────────────┘
        │                             │
        │ (reads)                     │ (calls)
        ▼                             ▼
┌───────────────────────────────┐   ┌────────────────────┐
│   lib/memberships/constants   │   │     date-fns       │
│                               │   │                    │
│  - EXPIRY_MONTHS              │   │  - addMonths()     │
│  - NO_EXPIRY_TYPES            │   │                    │
└───────────────────────────────┘   └────────────────────┘
```

### 3.2 Key Interfaces/Contracts

```typescript
// apps/web/lib/memberships/constants.ts

export const EXPIRY_MONTHS: Partial<Record<MembershipType, number>> = {
  annualStudentNoVote: 12,
  annualSingle:        12,
  annualFamily:        12,
  fiveYearFamily:      60,
}
```

```typescript
// apps/web/lib/memberships/expiry.ts

import { addMonths } from 'date-fns'
import type { MembershipType } from '@prisma/client'
import { EXPIRY_MONTHS, NO_EXPIRY_TYPES } from './constants'

/**
 * Pure function to compute the rolling expiration date.
 * Returns null for lifetime or special non-expiring tiers.
 */
export function computeExpiryDate(type: MembershipType, paymentDate: Date): Date | null {
  if (NO_EXPIRY_TYPES.has(type)) {
    return null
  }
  const months = EXPIRY_MONTHS[type]
  if (months === undefined) {
    return null
  }
  return addMonths(paymentDate, months)
}
```

---

## 4. File Structure

### 4.1 Files to Add
- `apps/web/lib/memberships/expiry.ts` (The pure expiry function)
- `apps/web/lib/memberships/__tests__/computeExpiryDate.test.ts` (Complete unit tests for all tiers, leap years, and month-end boundary clamping)

### 4.2 Files to Modify
- `apps/web/lib/memberships/constants.ts` (Move/Add `EXPIRY_MONTHS`, remove `EXPIRY_DAYS`)
- `apps/web/lib/memberships/membership-service.ts` (Use new `computeExpiryDate`)
- `apps/web/lib/payments/payment-service.ts` (Accept `paymentDate` in `activateMembership`, `applyUpgrade`, and retrieve/pass it in `recordPayment`)
- `apps/web/lib/payments/payment-service.test.ts` (Align tests with updated signatures)
- `specs/artifacts/SPEC-21/02-design.md` (Document superseded sections)

---

## 5. Detailed Design

### 5.1 `membership-service.ts` Refactoring
- Remove `EXPIRY_DAYS` definition and the local `computeExpiry` helper function.
- Import `computeExpiryDate` from `./expiry`.
- Inside `approveMembership`, replace:
  ```typescript
  const expiryDate = computeExpiry(member.membershipType, now)
  ```
  with:
  ```typescript
  const expiryDate = computeExpiryDate(member.membershipType, now)
  ```

### 5.2 `payment-service.ts` Refactoring
- Remove the local `addMonths` helper and local `EXPIRY_MONTHS` definition.
- Import `computeExpiryDate` from `@/lib/memberships/expiry`.
- Modify `activateMembership` parameters:
  ```typescript
  export async function activateMembership(
    memberId: string,
    membershipType: MembershipType,
    paymentDate: Date,
  ): Promise<void>
  ```
  And inside `activateMembership`:
  ```typescript
  const expiryDate = computeExpiryDate(membershipType, paymentDate)
  ```
- Modify `applyUpgrade` parameters:
  ```typescript
  export async function applyUpgrade(
    memberId: string,
    membershipType: MembershipType,
    paymentDate: Date,
  ): Promise<void>
  ```
  And inside `applyUpgrade`:
  ```typescript
  let expiryDate: Date | null = member.expiryDate
  if (NO_EXPIRY_TYPES.has(membershipType)) {
    expiryDate = null
  } else if (membershipType === 'fiveYearFamily') {
    expiryDate = computeExpiryDate(membershipType, paymentDate)
  }
  ```
- Update `recordPayment` to retrieve `paymentDate` from `input.paymentDate ?? record.createdAt` (so it matches the payment record database transaction timestamp exactly) and pass it:
  ```typescript
  const paymentDate = input.paymentDate ?? record.createdAt
  if (input.paymentType === 'upgrade') {
    await applyUpgrade(input.memberId, membershipType, paymentDate)
  } else {
    await activateMembership(input.memberId, membershipType, paymentDate)
  }
  ```

---

## 6. Testing Strategy

### 6.1 Unit Tests for `computeExpiryDate`
Wrote to `apps/web/lib/memberships/__tests__/computeExpiryDate.test.ts`:
- **Annual Single**: Check standard mid-year payment (e.g. 2026-06-15) resolves to exactly one year later (2027-06-15).
- **Annual Single (EOM)**: Check January 31 payment resolves to January 31 next year. Check August 31 payment resolves to August 31 next year.
- **Five-Year Family**: Check payment on 2026-03-01 resolves to 5 years later (2031-03-01).
- **Leap Day Five-Year**: Check payment on 2028-02-29 resolves to 5 years later (2033-02-28), verifying that `date-fns` correctly clamps to the end of the non-leap February.
- **Non-Expiring Tiers**: Check `life`, `patron`, and `benefactor` return `null` for any payment date.

### 6.2 Service & Integration Tests
Run `pnpm --filter=web test` to verify:
- `payment-service.test.ts` updates are fully functional.
- Mock payments correctly call `activateMembership` and `applyUpgrade` with the calculated database timestamp.

---

## 7. Implementation Sequence

### 7.1 Checklist & TDD Plan
- [ ] Add `date-fns` to `apps/web/package.json` dependencies and run `pnpm install`.
- [ ] Update `apps/web/lib/memberships/constants.ts` (Remove `EXPIRY_DAYS`, add `EXPIRY_MONTHS`).
- [ ] Create `apps/web/lib/memberships/expiry.ts` (Implement `computeExpiryDate`).
- [ ] Create `apps/web/lib/memberships/__tests__/computeExpiryDate.test.ts` (Write the RED test cases).
- [ ] Verify test suite runs and fails (RED).
- [ ] Implement `computeExpiryDate` logic to pass tests (GREEN).
- [ ] Modify `apps/web/lib/memberships/membership-service.ts` to use `computeExpiryDate`.
- [ ] Modify `apps/web/lib/payments/payment-service.ts` to accept and pass `paymentDate` down.
- [ ] Fix `apps/web/lib/payments/payment-service.test.ts` (Update mock parameters and timestamps).
- [ ] Run the complete Jest test suite (`pnpm --filter=web test`) to confirm everything is GREEN.
- [ ] Run Playwright E2E tests (`pnpm --filter=web test:e2e`) to verify no regressions in payment flows.
- [ ] Update `specs/artifacts/SPEC-21/02-design.md` with superseded notice.
