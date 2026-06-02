# Feature Specification: Self-Service Membership Upgrade

> **Spec ID:** SPEC-21-self-service-membership-upgrade
> **Status:** Implementation Complete — Pending DB Push & Manual Verification
> **Author:** Utkal Nayak
> **Created:** 2026-05-25

---

## 1. Overview

### 1.1 Summary

Allows any active member to self-upgrade their membership tier to a higher tier directly from their dashboard or profile page, without admin involvement. The member selects a target tier from a dropdown, is shown the full tier price and their personal upgrade fee (target price minus cumulative consecutive payments), and either proceeds through a one-time Stripe Checkout or completes a $0 upgrade instantly if their cumulative payments already meet or exceed the target tier price. On completion, a `PaymentRecord` with `paymentType = upgrade` is always written (even for $0 upgrades), the member's tier is updated, and expiry dates are adjusted per tier rules.

### 1.2 Goals

- [ ] Active members can upgrade to any higher-priced tier from member dashboard and profile page
- [ ] Upgrade fee = `max(0, targetTierPrice − cumulativeConsecutivePayments)`
- [ ] Cumulative consecutive payments: sum of completed payment records since the member's unbroken membership streak began
- [ ] A lapsed-and-rejoined member loses their prior payment history for upgrade calculation purposes
- [ ] $0 upgrade fee: no Stripe charge, but a `PaymentRecord` is written with `amountCents = 0`
- [ ] Upgrade fee > $0: one-time Stripe Checkout; record written on webhook confirmation
- [ ] After upgrade: `Member.membershipType` updated; `expiryDate` set per new tier rules
- [ ] Spouse membership auto-reflects upgrade (derived from primary member record — no separate action needed)
- [ ] Dropdown shows all eligible target tiers with full price and calculated upgrade fee
- [ ] No CSS — unstyled functional stubs only

### 1.3 Non-Goals (Out of Scope)

- Membership downgrades
- Admin-initiated upgrades (admin can edit DB directly)
- Prorated credits for unused time in the current period
- Upgrading `honoraryNoVote` members (admin-only tier, no self-service path)
- Upgrading already-at-top-tier (`benefactor`) members — dropdown simply shows no options
- Upgrade between same-price tiers (e.g., `fiveYearFamily` ↔ `lifeWard`, both $100)
- Email notifications on upgrade (deferred)

---

## 2. Business Rules

### 2.1 Upgrade Eligibility

| Condition | Rule |
|-----------|------|
| Member status | Must be `active` |
| Target tier | Must have a higher `amountDollars` than the current tier in `MembershipFee` |
| `honoraryNoVote` | Never eligible for self-service upgrade |
| `benefactor` | Already at top — no eligible targets; hide upgrade UI |

### 2.2 Upgrade Fee Calculation

```
upgrade_fee = max(0, target_tier_price_dollars − cumulative_consecutive_payments_dollars)
```

**Cumulative consecutive payments** = sum of `amountCents` (in dollars) across all `PaymentRecord` rows for this member where:
- `status = completed`
- `paymentType IN (membership, upgrade)`
- `createdAt >= Member.consecutiveSince`

**`consecutiveSince`** is a new `Date` field on `Member`:
- Set to `joinDate` when a member first joins (or on backfill for existing active members)
- Unchanged on renewals (membership renewed without lapsing)
- Reset to the new `joinDate` when a previously-expired member rejoins — wiping the historical total

### 2.3 Tier Hierarchy (price-ordered, ascending)

| Tier | Price | Expiry Rule | Notes |
|------|-------|-------------|-------|
| `annualStudentNoVote` | $20 | Annual (July 4) | |
| `annualSingle` | $25 | Annual (July 4) | |
| `annualFamily` | $40 | Annual (July 4) | |
| `fiveYearFamily` | $100 | July 4, five years forward | |
| `lifeWard` | $100 | None (lifetime) | Same price as fiveYearFamily — cannot cross-upgrade to fiveYearFamily, but can upgrade to patron or benefactor |
| `life` | $200 | None (lifetime) | |
| `patron` | $500 | None (lifetime) | |
| `benefactor` | $1000 | None (lifetime) | Top tier — no further upgrade |
| `honoraryNoVote` | $0 | Admin-set | Not self-upgradeable |

**Expiry date rules on upgrade:**
- Upgrading to `life`, `lifeWard`, `patron`, or `benefactor`: set `Member.expiryDate = null`
- Upgrading to `fiveYearFamily`: set `Member.expiryDate` = July 4 of the year that is 5 years after the **next** July 4 from today
  - Example: upgrade on 2026-05-25 → next July 4 is 2026-07-04 → expiry = 2031-07-04
- Upgrading between annual tiers: no change to current expiry date (same July 4 cycle)

### 2.4 Post-Upgrade State Changes

| Field | Value |
|-------|-------|
| `Member.membershipType` | New tier |
| `Member.expiryDate` | Per §2.3 rules |
| `PaymentRecord` (new row) | `paymentType = upgrade`, `membershipType = new tier`, `amountCents = upgrade fee in cents`, `status = completed`, `stripePaymentIntentId` (null for $0 upgrades) |

Spouse membership is automatically reflected — `FamilyMember` has no independent membership tier; it is fully derived from the primary member's record. No additional writes required for spouse.

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | An upgrade dropdown appears on the member dashboard and profile page only when `memberStatus = active` and at least one eligible target tier exists | Must Have | Hidden entirely for benefactor members and honoraryNoVote |
| FR-02 | The upgrade section displays the member's cumulative consecutive payments total (e.g., "You have paid $120 toward your membership"). The dropdown lists all tiers with `amountDollars > currentTierPrice`, excluding `honoraryNoVote`. Each option shows: tier display name, full price, and calculated upgrade fee | Must Have | e.g., "You have paid $120 toward your membership" / "Life Membership — $200 (Upgrade fee: $80)" |
| FR-03 | Upgrade fee is calculated server-side via `GET /api/memberships/upgrade-options`; never trusted from client | Must Have | Prevents fee manipulation |
| FR-04 | When upgrade fee > $0: clicking "Upgrade" initiates a Stripe Checkout session for the exact upgrade fee amount; member is redirected | Must Have | One-time payment, not subscription |
| FR-05 | On Stripe `checkout.session.completed` webhook: update `Member.membershipType`, update `Member.expiryDate`, write `PaymentRecord` | Must Have | Idempotent via `stripeEventId` unique constraint |
| FR-06 | When upgrade fee = $0: a confirmation prompt appears ("Upgrade to [tier] at no additional cost?"). On confirm: immediately update member and write `PaymentRecord` via `POST /api/memberships/upgrade` | Must Have | No Stripe session needed |
| FR-07 | `PaymentRecord` is always created for every upgrade, including $0 — `amountCents = 0`, `paymentType = upgrade`, `stripePaymentIntentId = null` for $0 | Must Have | Audit trail requirement |
| FR-08 | A new `consecutiveSince` Date field is added to `Member`; backfilled to `joinDate` for all existing active members on schema push | Must Have | Drives cumulative payment calculation |
| FR-09 | When a lapsed member rejoins (renewal after `memberStatus = expired`), `consecutiveSince` is reset to the new payment date | Must Have | Handled in existing renewal flow |
| FR-10 | `MembershipFee.isUpgradePath` is updated to `true` for `patron` and `benefactor` so they appear as valid upgrade targets | Must Have | Schema seed change |
| FR-11 | After successful upgrade, the page reflects the new tier immediately (re-fetch or server-side redirect) | Must Have | |
| FR-12 | Stripe Checkout success/cancel URLs return the member to their dashboard | Must Have | |
| FR-13 | No CSS — all new UI elements are unstyled functional HTML | Must Have | Project-wide styling freeze |

### 3.2 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | Upgrade fee endpoint response time | < 300ms |
| NFR-02 | Stripe webhook processing is idempotent | Duplicate events must not create duplicate PaymentRecords (guarded by `stripeEventId` unique constraint) |
| NFR-03 | Upgrade options are computed server-side | Client never receives or sends fee amounts to trust |

---

## 4. Acceptance Criteria

### 4.1 Definition of Done

- [ ] All functional requirements implemented
- [ ] All unit and integration tests passing
- [ ] Playwright E2E scenarios passing
- [ ] Schema pushed (`npx prisma db push`) with `consecutiveSince` field
- [ ] Seed updated: `patron` and `benefactor` have `isUpgradePath = true`
- [ ] No CSS added to any new UI

### 4.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Annual member upgrades to Life (fee owed) | Active annualFamily member, paid $40 total | Selects Life ($200), clicks Upgrade | Redirected to Stripe; on payment: tier = life, expiryDate = null, PaymentRecord $160 upgrade written |
| Consecutive 3-year annual member upgrades to Life | Active annualFamily, paid $120 cumulative consecutive | Selects Life ($200) | Upgrade fee = $80 shown; Stripe charged $80 |
| Member with $0 upgrade fee | Active member, cumulative payments ≥ target tier price | Selects target tier | Confirmation prompt shown; on confirm: tier updated, $0 PaymentRecord written, no Stripe session |
| Benefactor member visits dashboard | membershipType = benefactor | Views dashboard | No upgrade dropdown rendered |
| honoraryNoVote member | membershipType = honoraryNoVote | Views dashboard | No upgrade dropdown rendered |
| Lapsed member rejoins and tries to upgrade | Member lapsed (memberStatus was expired), rejoined | Tries to upgrade to life | Cumulative total starts from rejoining date only |
| Annual → fiveYearFamily upgrade expiry | Active annualFamily, upgrades to fiveYearFamily on 2026-05-25 | Upgrade completes | expiryDate = 2031-07-04 |
| Stripe webhook replay | Webhook delivered twice with same `stripeEventId` | Second delivery processed | No duplicate PaymentRecord; member state unchanged |
| Inactive member visits upgrade UI | memberStatus = expired | Views dashboard | No upgrade dropdown rendered |

---

## 5. Technical Constraints

### 5.1 Technologies

- **Must Use:** Prisma ORM, Stripe Checkout (one-time payment mode), Next.js App Router API routes, TypeScript
- **Must Avoid:** Client-side fee calculation, subscription-mode Stripe, CSS

### 5.2 Patterns to Follow

- Stripe webhook idempotency pattern already established in payment module — follow existing webhook handler in `apps/web/app/api/stripe/`
- Auth guard pattern from `withAuth` — all upgrade routes must be authenticated
- Service layer: add upgrade logic in `apps/web/lib/memberships/`

### 5.3 Files / Modules Affected

| File | Change |
|------|--------|
| `apps/web/prisma/schema.prisma` | Add `consecutiveSince DateTime? @map("consecutive_since") @db.Date` to `Member` |
| `apps/web/prisma/seed.ts` | Set `isUpgradePath = true` for `patron` and `benefactor` |
| `apps/web/lib/memberships/upgrade-service.ts` | New: compute eligible tiers, calculate upgrade fee, process $0 upgrades, update member post-payment |
| `apps/web/app/api/memberships/upgrade-options/route.ts` | New: `GET` — returns eligible tiers + upgrade fees for authenticated member |
| `apps/web/app/api/memberships/upgrade/route.ts` | New: `POST` — handles $0 upgrade; creates Stripe Checkout session for paid upgrades |
| `apps/web/app/api/stripe/webhook/route.ts` | Extend: handle `checkout.session.completed` for `paymentType = upgrade` metadata |
| `apps/web/app/(member)/dashboard/page.tsx` | Add: upgrade section with tier dropdown |
| `apps/web/app/(member)/profile/page.tsx` | Add: upgrade section with tier dropdown |
| Existing renewal flow (payment service) | Add: reset `consecutiveSince` when a lapsed member completes a new membership payment |

### 5.4 Files NOT to Modify

- `apps/web/prisma/migrations/` — use `npx prisma db push` only (per AGENTS.md)
- Any file outside `apps/web/` — no monorepo boundary crossings for this spec

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Can `lifeWard` members upgrade to `patron` or `benefactor`? (`lifeWard` and `fiveYearFamily` share $100 price) | Resolved | Yes — `lifeWard` can upgrade to `patron` or `benefactor`. Equal-price cross-tier rule (§2.3) applies only to `fiveYearFamily` ↔ `lifeWard`, not to `lifeWard` upgrading upward. |
| When a `fiveYearFamily` member upgrades to a lifetime tier, should `consecutiveSince` be preserved or reset? | Resolved | Preserved — the cumulative payment history should carry forward across tiers |
| Should the upgrade UI show the member's current cumulative total paid (for transparency)? | Resolved | Yes — show "You have paid $X toward your membership" alongside the upgrade fee in the dropdown |

---

## 7. References

- `apps/web/prisma/seed.ts` — membership fee definitions and prices
- `apps/web/prisma/schema.prisma` — `Member`, `PaymentRecord`, `MembershipFee` models
- SPEC-19 — Spouse linked login (spouse inherits primary member's tier; no extra upgrade logic needed)
- July 4 expiry spec (deferred, referenced in memory) — fiveYearFamily expiry anchored to July 4

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation

### Phase 1: Analysis
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-21/01-analysis.md`

### Phase 2: Design
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-21/02-design.md`

### Phase 3: Implementation
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-21/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-21/04-qa-report.md`
