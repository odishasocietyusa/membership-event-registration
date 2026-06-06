# Phase 3: Implementation Log — Rolling Membership Expiry

> **Spec:** [SPEC-24-rolling-membership-expiry](file:///Users/utkalnayak/Documents/code/membership-event-registration/specs/active/SPEC-24-rolling-membership-expiry.md)
> **Implementer Agent:** Antigravity (agy)
> **Date Started:** 2026-06-06
> **Status:** Complete

---

## 1. Implementation Summary

### 1.1 Progress Overview
| Step | Description | Status | Notes |
|------|-------------|--------|-------|
| 1 | Dependency installation | ✅ Done | Added `date-fns` to `apps/web/package.json` and ran `pnpm install` |
| 2 | Refactor constants | ✅ Done | Defined `EXPIRY_MONTHS` and removed `EXPIRY_DAYS` in `constants.ts` |
| 3 | Create pure utility | ✅ Done | Implemented `computeExpiryDate` in `expiry.ts` |
| 4 | Write unit test suite | ✅ Done | Created complete Jest unit tests in `computeExpiryDate.test.ts` |
| 5 | Refactor membership service | ✅ Done | Integrated `computeExpiryDate` in `membership-service.ts` for approvals |
| 6 | Refactor payment service | ✅ Done | Integrated `computeExpiryDate` in `payment-service.ts` for activations/upgrades |
| 7 | Update tests & verify | ✅ Done | Verified all 307 unit tests and 63/64 E2E tests pass (with 1 pre-existing E2E failure) |
| 8 | Document SPEC-21 updates | ✅ Done | Marked July 4th upgrade anchor sections in SPEC-21 design doc as superseded |

### 1.2 Files Changed

#### Created
| File | Lines | Purpose |
|------|-------|---------|
| `apps/web/lib/memberships/expiry.ts` | ~16 | Pure expiry calculation function using `date-fns` `addMonths`. |
| `apps/web/lib/memberships/__tests__/computeExpiryDate.test.ts` | ~56 | Jest unit tests covering leap years, EOM clamping, and non-expiring tiers. |

#### Modified
| File | Changes | Reason |
|------|---------|--------|
| `apps/web/package.json` | Added `date-fns` | Required for calendar-correct month arithmetic. |
| `apps/web/lib/memberships/constants.ts` | Added `EXPIRY_MONTHS` mapping, removed `EXPIRY_DAYS` | Centralized configurations for rolling intervals. |
| `apps/web/lib/memberships/membership-service.ts` | Replaced legacy helper and day-based lookup | Cleaned up obsolete day-based expiry computations. |
| `apps/web/lib/payments/payment-service.ts` | Refactored `activateMembership`, `applyUpgrade`, and `recordPayment` | Passed down transaction timestamp (`paymentDate`) to align joins/expiries. |
| `specs/artifacts/SPEC-21/02-design.md` | Appended warning alerts | Noted that the July 4th upgrade logic is superseded. |

---

## 2. Implementation Details

### Step 1: Centralizing Constants & Creating Pure Expiry Utility
*   **What was done:** Added `EXPIRY_MONTHS` (mapping annual tiers to 12 months, and fiveYearFamily to 60 months) to `constants.ts`. Built `computeExpiryDate(type, paymentDate)` in `expiry.ts` utilizing `date-fns` to ensure leap year and month-end date clamping.

### Step 2: Refactoring Services
*   **What was done:** Updated `membership-service.ts` to fetch expiration from the new pure utility inside `approveMembership`. Updated `payment-service.ts` by removing its local `addMonths` and `EXPIRY_MONTHS` helpers, and updating both `activateMembership` and `applyUpgrade` parameters to accept an optional `paymentDate: Date = new Date()`.
*   **Date Anchoring:** Updated `recordPayment` to resolve the payment record's database `createdAt` timestamp (or `input.paymentDate`) and pass it down. This ensures that membership activation and join/consecutive dates match the payment record exactly.

### Step 3: Test Verification
*   **What was done:** Wrote comprehensive Jest tests for `computeExpiryDate` covering normal cases, leap day payments, month-end clamps, and non-expiring tiers (life, patron, benefactor). Ran the entire Jest test suite (307/307 tests passed) and Playwright E2E suites (63/64 tests passed, confirming 1 pre-existing flaky/unrelated E2E redirect failure).

---

## 3. Deviations from Design
*   **Optional Parameter Defaults:** Instead of making `paymentDate` strictly required in `activateMembership` and `applyUpgrade` signatures, they were made optional with a default fallback to `new Date()`. This guarantees backwards-compatibility and prevents having to mock/re-write dates in dozens of legacy unit tests.

---

## 4. Issues Encountered
*   **Pre-existing E2E Failure:** The `e2e/stripe-checkout.spec.ts` test was observed failing due to a login redirect upon submitting step 2 of registration. Discarding workspace changes to original `main` branch proved the exact same redirect failure occurs on clean `main`. The issue is pre-existing and unrelated.

---

## 5. Implementation Checklist
*   [x] All design steps completed
*   [x] Code compiles without errors
*   [x] Jest unit tests pass
*   [x] E2E verification run
*   [x] Obsolete day-based references removed
*   [x] Warnings appended to superseded designs

**Implementation Status:** ✅ Ready for QA
