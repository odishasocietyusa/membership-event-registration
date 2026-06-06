# Phase 1: Requirement Analysis

> **Spec:** SPEC-24-rolling-membership-expiry
> **Analyst Agent:** Antigravity (agy)
> **Date:** 2026-06-06
> **Status:** Complete

---

## 1. Spec Understanding

### 1.1 Feature Summary
The OSA board has transitioned from a fixed-date fiscal-year membership expiry model (traditionally ending on June 30th or July 4th) to a rolling membership expiry model.
- **Annual tiers** (`annualStudentNoVote`, `annualSingle`, `annualFamily`): Expire exactly 12 calendar months (365 days / calendar-aligned) after successful payment, rather than expiring at the end of the fiscal year.
- **Five-year tiers** (`fiveYearFamily`): Expire exactly 60 calendar months after successful payment.
- **Lifetime & Special tiers** (`life`, `lifeWard`, `honoraryNoVote`, `patron`, `benefactor`): Do not expire (`expiryDate` remains `null`).
- Expiry calculation must be isolated in a pure utility function `computeExpiryDate` using the `date-fns` library for exact, calendar-correct month arithmetic.
- Webhook payment events must anchor the expiry calculation to the transaction timestamp to prevent clock drift.


### 1.2 Key Objectives
1. **Define a pure utility function** `computeExpiryDate(type: MembershipType, paymentDate: Date): Date | null` using `addMonths` from `date-fns` for calendar arithmetic.
2. **Move/Expose constants** properly: replace `EXPIRY_DAYS` with `EXPIRY_MONTHS` inside `apps/web/lib/memberships/constants.ts` and ensure `NO_EXPIRY_TYPES` includes `patron` and `benefactor`.
3. **Refactor membership service**: Update `apps/web/lib/memberships/membership-service.ts` to use the new `computeExpiryDate` utility instead of its local day-based helper and `EXPIRY_DAYS`.
4. **Refactor payment service**: Update `apps/web/lib/payments/payment-service.ts` to use `computeExpiryDate`. Modify `activateMembership` and `applyUpgrade` to pass the transaction timestamp (`paymentDate`), ensuring no clock drift.
5. **Update SPEC-21 artifact**: Mark the July 4th upgrade expiry sections in the SPEC-21 design doc as superseded by this rolling-month logic.

---

## 2. Requirements Breakdown

### 2.1 Extracted Requirements

| ID | Requirement | Type | Complexity | Dependencies |
|----|-------------|------|------------|--------------|
| FR-01 | Annual tiers expire exactly 12 calendar months after payment date | Functional | Low | `date-fns` `addMonths` |
| FR-02 | `fiveYearFamily` expires exactly 60 calendar months after payment date | Functional | Low | `date-fns` `addMonths` |
| FR-03 | No-expiry tiers (`life`, `lifeWard`, `honoraryNoVote`, `patron`, `benefactor`) yield `null` expiry | Functional | Low | `NO_EXPIRY_TYPES` set |
| FR-04 | Encapsulate expiry logic in pure function `computeExpiryDate` | Functional | Low | Co-located in `lib/memberships/expiry.ts` |
| FR-05 | `activateMembership` and `applyUpgrade` anchor calculation to the Stripe payment/transaction timestamp | Functional | Medium | Payment service updates |
| NFR-01 | Month arithmetic must be calendar-correct (handling leap years and end-of-month clamps) | Non-Functional | Low | `date-fns` behavior |
| NFR-02 | 100% unit test coverage for `computeExpiryDate` | Non-Functional | Medium | Jest test suite |

### 2.2 Implicit Requirements
- **Removing Day-Based Arithmetic**: Completely remove `EXPIRY_DAYS` from all active files to prevent future developers from using day-based expiry.
- **Webhook Alignment**: `recordPayment` creates a `PaymentRecord`. To guarantee perfect synchronization, the `createdAt` timestamp of the created `PaymentRecord` (or an explicit `paymentDate` passed from Stripe webhook handlers) should be passed down as the anchoring date.
- **Upgrade Paths**: Upgrading to a new tier must calculate the correct expiry date based on the payment date (e.g., +60 months for `fiveYearFamily` upgrade). Upgrading to same-billing-cycle tiers (e.g., annual to annual) preserves the current expiry date as before.

### 2.3 Edge Cases Identified
1. **End-of-Month Clamping**: Joining on January 31.
   - 12 months later: January 31 + 12 months = January 31, 2027.
   - What if payment is on January 31, 2028 (leap year)? January 31, 2028 + 12 months = January 31, 2029.
   - What if payment is on August 31? August 31 + 6 months? (e.g., February has 28 days, so `date-fns` clamps to February 28/29). We must verify `date-fns` behaves correctly and document it in the tests.
2. **Leap Day Payment**: Joining on February 29, 2028.
   - 12 months later (non-leap year): `computeExpiryDate` should return February 28, 2029.
   - 5 years (60 months) later: February 29, 2028 + 60 months = February 28, 2033 (non-leap year).
3. **Upgrade Date Anchoring**: Ensure `applyUpgrade` uses the payment/transaction timestamp, not the server's CPU clock time at execution time.
4. **Soft-Deleted Members**: Does not affect the pure utility function, but verification ensures the database operations on active members work exactly as before.

---

## 3. Scope Validation

### 3.1 In Scope (Confirmed)
- Create `apps/web/lib/memberships/expiry.ts` containing the pure `computeExpiryDate` function.
- Create unit tests in `apps/web/lib/memberships/__tests__/computeExpiryDate.test.ts`.
- Update `apps/web/lib/memberships/constants.ts` to export `EXPIRY_MONTHS` and clean up `EXPIRY_DAYS`.
- Update `apps/web/lib/memberships/membership-service.ts` to import and call `computeExpiryDate`.
- Update `apps/web/lib/payments/payment-service.ts` to call `computeExpiryDate` and update the parameters of `activateMembership` and `applyUpgrade`.
- Update the mock calls/tests in `payment-service.test.ts` to reflect updated signatures.
- Document the policy change in `specs/artifacts/SPEC-21/02-design.md` via an alert note.

### 3.2 Out of Scope (Confirmed)
- Retroactive updates to existing members with fixed July 4th expiry dates.
- Database schema migrations or changes.
- UI elements displaying expiration dates.
- Reminder cron route logic (`expiry-reminders`) adjustments (unless they directly access `EXPIRY_DAYS`, but they actually query the database for existing `expiryDate`). Note: `expiry-reminders` cron is separate (SPEC-26).

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Inconsistent database timestamping | Low | Medium | Use the database transaction's `createdAt` timestamp of the `PaymentRecord` to align the activation timestamp exactly with the payment record. |
| Timezone shifting | Low | Medium | Use timezone-agnostic `Date` objects and UTC calculations wherever possible. |
| Breaking existing tests | Medium | Medium | Thoroughly audit and update mock values in `payment-service.test.ts` and other integration test files. |

---

## 5. Questions for User
No blocking questions remain. The requirements are clean and precise. 
- *A1:* We will proceed with using the `createdAt` timestamp of the `PaymentRecord` generated inside `recordPayment` as the default transaction date when a specific date is not supplied. This guarantees exact alignment.
- *A2:* There is no physical file `memory/project_july4_expiry_spec.md` in the workspace. We will document that this file is non-existent, but the July 4th specification design itself is fully superseded by this implementation.

---

## 6. Recommendations

### 6.1 Suggested Additions
- Write robust leap-year and end-of-month unit test cases to verify the exact behavior of `date-fns` within our utility.

### 6.2 Suggested Simplifications
- Moving all expiry-related configurations (e.g. `EXPIRY_MONTHS`, `NO_EXPIRY_TYPES`) directly into `apps/web/lib/memberships/constants.ts` makes them centrally manageable.

---

## 7. Analysis Summary

### Ready for Design Phase?
- [x] All requirements understood
- [x] No blocking questions remain
- [x] Scope is clearly defined
- [x] Risks are acceptable

**Recommendation:** ✅ Proceed to Design

---

## Handoff to Design Agent
1. Define the pure helper in `apps/web/lib/memberships/expiry.ts` as:
   ```typescript
   import { addMonths } from 'date-fns'
   import type { MembershipType } from '@prisma/client'
   import { EXPIRY_MONTHS, NO_EXPIRY_TYPES } from './constants'

   export function computeExpiryDate(type: MembershipType, paymentDate: Date): Date | null {
     if (NO_EXPIRY_TYPES.has(type)) return null
     const months = EXPIRY_MONTHS[type]
     if (months === undefined) return null
     return addMonths(paymentDate, months)
   }
   ```
2. Export `EXPIRY_MONTHS` and clean up `EXPIRY_DAYS` in `apps/web/lib/memberships/constants.ts`.
3. In `payment-service.ts`:
   - Import `computeExpiryDate` from `@/lib/memberships/expiry`.
   - Update `activateMembership` signature: `activateMembership(memberId: string, membershipType: MembershipType, paymentDate: Date): Promise<void>`.
   - Update `applyUpgrade` signature: `applyUpgrade(memberId: string, membershipType: MembershipType, paymentDate: Date): Promise<void>`.
   - Update `recordPayment` to retrieve `paymentDate` from `input.paymentDate ?? record.createdAt` and pass it down.
4. Update `membership-service.ts` to import `computeExpiryDate` and use it inside `approveMembership`.
5. Update tests in `payment-service.test.ts` and add tests for `computeExpiryDate`.
