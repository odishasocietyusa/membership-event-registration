# Feature Specification: Rolling Membership Expiry

> **Spec ID:** SPEC-24-rolling-membership-expiry
> **Status:** Draft
> **Author:** Utkal Nayak
> **Created:** 2026-05-30

---

## 1. Overview

### 1.1 Summary
The OSA board has formally changed membership expiry policy. Annual and five-year memberships now expire on a rolling basis from the date of successful payment — 12 calendar months and 60 calendar months respectively — rather than aligning to a fixed fiscal year date (July 4). This spec supersedes the deferred July 4 fiscal-year expiry design and promotes the current placeholder logic in `payment-service.ts` to the official, production-grade implementation.

### 1.2 Goals
- [ ] Replace approximate day-based expiry (`EXPIRY_DAYS`) with exact calendar-month arithmetic
- [ ] Define and test a pure `computeExpiryDate(type, paymentDate)` utility function
- [ ] Ensure SPEC-21 upgrade paths use the same rolling-month logic for `fiveYearFamily`
- [ ] Remove all references to July 4 fiscal-year expiry from active code and specs

### 1.3 Non-Goals (Out of Scope)
- Retroactive re-calculation of expiry dates for existing members
- Proration or refunds based on the policy change
- Patron / benefactor / life / lifeWard expiry (these remain `null` — no expiry)
- UI changes to display expiry dates (handled when Figma designs are delivered)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Annual tiers (`annualStudentNoVote`, `annualSingle`, `annualFamily`) expire exactly 12 calendar months after the successful payment date | Must Have | Use `date-fns` `addMonths(paymentDate, 12)` |
| FR-02 | `fiveYearFamily` expires exactly 60 calendar months after the successful payment date | Must Have | Use `addMonths(paymentDate, 60)` |
| FR-03 | No-expiry tiers (`life`, `lifeWard`, `honoraryNoVote`, `patron`, `benefactor`) continue to produce `null` expiryDate | Must Have | `NO_EXPIRY_TYPES` set must include patron and benefactor |
| FR-04 | A pure function `computeExpiryDate(type: MembershipType, paymentDate: Date): Date \| null` must encapsulate the expiry logic | Must Have | Testable in isolation; used by `activateMembership` |
| FR-05 | `activateMembership` must pass the actual payment date (not `new Date()`) to `computeExpiryDate` so the expiry anchors to the transaction timestamp | Must Have | Prevents clock drift between Stripe webhook receipt and DB write |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Month arithmetic must be calendar-correct | No drift across leap years or month boundaries | `date-fns addMonths` handles this |
| NFR-02 | Unit test coverage for `computeExpiryDate` | 100% branch coverage | Cover all tiers, leap-year dates, end-of-month edge cases |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] `computeExpiryDate` implemented and unit-tested
- [ ] `EXPIRY_DAYS` constant removed; replaced by `EXPIRY_MONTHS`
- [ ] `activateMembership` uses `computeExpiryDate(membershipType, paymentDate)` where `paymentDate` is the Stripe payment timestamp
- [ ] SPEC-21 design doc updated: `fiveYearFamily` upgrade expiry uses `addMonths(paymentDate, 60)` not July 4 logic
- [ ] Memory entry `project_july4_expiry_spec.md` marked superseded
- [ ] All existing Playwright E2E tests pass

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Annual single, mid-year join | `annualSingle`, paymentDate = 2026-06-15 | `computeExpiryDate` called | Returns 2027-06-15 |
| Annual join on Jan 31 | `annualSingle`, paymentDate = 2026-01-31 | `computeExpiryDate` called | Returns 2027-01-31 |
| Five-year family | `fiveYearFamily`, paymentDate = 2026-03-01 | `computeExpiryDate` called | Returns 2031-03-01 |
| Five-year on leap day | `fiveYearFamily`, paymentDate = 2028-02-29 | `computeExpiryDate` called | Returns 2033-02-28 (date-fns clamps) |
| Lifetime tier | `life`, any date | `computeExpiryDate` called | Returns `null` |
| Patron tier | `patron`, any date | `computeExpiryDate` called | Returns `null` |
| Benefactor tier | `benefactor`, any date | `computeExpiryDate` called | Returns `null` |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** `date-fns` (`addMonths`) — already in the project dependency tree
- **Must Avoid:** Manual day-count arithmetic (`setDate(getDate() + N)`)

### 4.2 Patterns to Follow
- Pure utility function pattern (`computeExpiryDate`) co-located in `apps/web/lib/memberships/`
- Constants in `apps/web/lib/memberships/constants.ts`
- Unit tests in `apps/web/lib/memberships/__tests__/computeExpiryDate.test.ts`

### 4.3 Files to Modify
- `apps/web/lib/payments/payment-service.ts` — replace `EXPIRY_DAYS` usage with `computeExpiryDate(type, paymentDate)`
- `apps/web/lib/memberships/constants.ts` — replace `EXPIRY_DAYS` with `EXPIRY_MONTHS`; confirm `NO_EXPIRY_TYPES` includes `patron` and `benefactor`
- `apps/web/lib/memberships/` — add `expiry.ts` with `computeExpiryDate`
- `specs/artifacts/SPEC-21/02-design.md` — update `fiveYearFamily` upgrade expiry section

### 4.4 Files NOT to Modify
- Prisma schema (`schema.prisma`) — `expiryDate` field already exists as `DateTime?`
- Any auth or Stripe webhook handlers outside the expiry calculation path

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- None — this is self-contained. Can run in parallel with SPEC-21 Phase 3, but SPEC-21 implementer must use the `computeExpiryDate` function once available.

### 5.2 Downstream Impact
- **SPEC-21 (Self-Service Upgrade):** The `fiveYearFamily` expiry rule in Phase 2 design was drafted with a July 4 anchor. That section must be updated to `addMonths(paymentDate, 60)` before SPEC-21 Phase 3 starts.
- **Future renewal flows:** Any renewal logic must call `computeExpiryDate(type, renewalPaymentDate)` — not extend from the old expiry date.

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should existing members with July 4 expiry dates be migrated? | Resolved | No — out of scope. Policy applies to new payments only. |
| What is the expiry for `honoraryNoVote`? | Resolved | Remains in `NO_EXPIRY_TYPES` (no expiry) — honorary membership is granted indefinitely. |
| Does `patron` have an expiry? | Resolved | `null` — patron and benefactor are treated the same as life members (no expiry). Confirmed by board 2026-05-30. |

---

## 7. References

- Board decision communicated 2026-05-30 (verbal / chat)
- Supersedes deferred July 4 expiry design (originally noted in `memory/project_july4_expiry_spec.md`)
- Related: SPEC-21 `02-design.md` — fiveYearFamily upgrade expiry section
- `apps/web/lib/payments/payment-service.ts:7-11` — current `EXPIRY_DAYS` placeholder

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation

### Phase 1: Analysis
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-24/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-24/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-24/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-24/04-qa-report.md`
