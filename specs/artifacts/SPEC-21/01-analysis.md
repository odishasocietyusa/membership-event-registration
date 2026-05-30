# Phase 1 Analysis — SPEC-21: Self-Service Membership Upgrade

> **Spec:** `specs/active/SPEC-21-self-service-membership-upgrade.md`
> **Status:** Complete
> **Date:** 2026-05-25

---

## 1. Requirements Validation

| ID | Requirement | Achievable? | Notes |
|----|-------------|-------------|-------|
| FR-01 | Upgrade dropdown on dashboard + profile page when `memberStatus = active` | Yes | Dashboard currently shows membership type (line 84). Profile page has no upgrade section. Both need additive UI. |
| FR-02 | Dropdown shows all eligible tiers with full price, upgrade fee, and cumulative total paid | Yes | `calculateCumulativePaid()` exists but ignores `consecutiveSince`. Needs filtering fix and new GET endpoint. |
| FR-03 | Upgrade fee computed server-side via `GET /api/memberships/upgrade-options` | Yes | Route doesn't exist yet. `calculateUpgradeCost()` in `payment-service.ts` partially implements the logic but scope is wrong. |
| FR-04 | Paid upgrades initiate Stripe Checkout (one-time) | Yes | `POST /api/payments/upgrade-session` and `createUpgradeSession()` exist but hardcoded to `life\|patron\|benefactor` only. Must be expanded. |
| FR-05 | Stripe webhook updates member and writes PaymentRecord | Yes | `handleCheckoutCompleted()` → `recordPayment()` path exists. However `activateMembership()` incorrectly resets `joinDate` — needs a separate upgrade-apply function. |
| FR-06 | $0 upgrade: confirm prompt, immediate update, PaymentRecord written | Yes | `autoActivate` path in upgrade-session route exists. No UI confirmation prompt yet. |
| FR-07 | PaymentRecord always written for upgrades, including $0 | Yes | `recordPayment()` with `paymentType = 'upgrade'` already does this. |
| FR-08 | `consecutiveSince` Date field on `Member`, backfilled for existing active members | Yes | Field doesn't exist. Must be added to schema and backfilled via a seed script run with `db push`. |
| FR-09 | `consecutiveSince` resets when lapsed member rejoins | Yes | `activateMembership()` is the re-entry point. Must add `consecutiveSince = new Date()` when `memberStatus` transitions from `expired` → `active`. |
| FR-10 | `isUpgradePath = true` for `patron` and `benefactor` in seed | Yes | Currently `false` in `seed.ts`. One-line change each. |
| FR-11 | Page reflects new tier after upgrade | Yes | Dashboard fetches membership status server-side — redirect to dashboard after upgrade will re-fetch. |
| FR-12 | Stripe success/cancel URLs return member to dashboard | Partial | Currently hardcoded to `/membership/success` and `/membership`. Must change to `/dashboard`. |
| FR-13 | No CSS | Yes | Project-wide freeze enforced. |

All requirements are achievable. No requirement needs rethinking. Three critical bugs in existing code must be fixed before the new feature is wired up.

---

## 2. Current State — What Already Exists

A prior partial implementation attempt left the following upgrade scaffolding in place. **Do not rebuild what exists — fix the gaps and extend scope.**

### `lib/payments/payment-service.ts`
- **`calculateCumulativePaid(memberId)`** — sums `PaymentRecord.amountCents` for completed membership/upgrade records with `isUpgradePath = true` tiers. **Gap:** no `consecutiveSince` filter. Sums entire history regardless of gaps.
- **`calculateUpgradeCost(memberId, targetType)`** — checks eligibility, calls `calculateCumulativePaid`, returns `{ eligible, costCents, autoActivate }`. **Gap 1:** `targetType` is `'life' | 'patron' | 'benefactor'` only. **Gap 2:** Eligibility allows recently-expired (1-year window) and no-prior-membership members; spec allows `active` only.
- **`activateMembership(memberId, membershipType)`** — updates member's type, status, joinDate, expiryDate. **Critical bug:** always sets `joinDate = new Date()` — for an upgrade this resets the join date, which is wrong. Also uses rolling +N-days expiry, not July 4 anchored.
- **`recordPayment(input)`** — creates `PaymentRecord` then calls `activateMembership()` if `status = completed`. Works for upgrades but inherits the `joinDate` bug above.

### `lib/payments/stripe.ts`
- **`createUpgradeSession(memberId, email, costCents, targetType)`** — creates Stripe Checkout session. **Gap:** `targetType` hardcoded to `'life' | 'patron' | 'benefactor'`.

### `app/api/payments/upgrade-session/route.ts`
- **`POST`** — calls `calculateUpgradeCost`, either returns Stripe URL or auto-activates $0 upgrade. **Gap:** `UpgradeSessionSchema` limits `targetType` to `life | patron | benefactor`.

### `app/api/webhooks/stripe/route.ts` + `lib/payments/webhook-handlers.ts`
- Fully functional. `handleCheckoutCompleted()` → `recordPayment()` path handles both membership and upgrade paymentTypes. Idempotent via `stripeEventId` unique constraint. **No changes needed here other than the `activateMembership()` bug fix flowing through.**

### `lib/memberships/constants.ts`
- **`NO_EXPIRY_TYPES`** = `{life, lifeWard, honoraryNoVote}`. **Critical bug:** `patron` and `benefactor` are missing. Both `payment-service.ts` and `membership-service.ts` have `patron: 365` and `benefactor: 365` in their `EXPIRY_DAYS` maps, causing lifetime tiers to get a rolling 1-year expiry on activation.

### `lib/memberships/membership-service.ts`
- **`EXPIRY_DAYS`** includes `patron: 365` and `benefactor: 365`. **Bug** — same as above.

### `app/api/memberships/me/history/route.ts`
- Payment history endpoint already exists. No changes needed.

---

## 3. Critical Bugs to Fix (Prerequisite to New Feature)

### Bug 1 — Patron/Benefactor incorrectly assigned rolling expiry

**Affected files:**
- `lib/memberships/constants.ts` — add `'patron'` and `'benefactor'` to `NO_EXPIRY_TYPES`
- `lib/memberships/membership-service.ts` — remove `patron: 365` and `benefactor: 365` from `EXPIRY_DAYS`
- `lib/payments/payment-service.ts` — remove `patron: 365` and `benefactor: 365` from `EXPIRY_DAYS`

**Impact:** Without this fix, any patron/benefactor upgrade will set a 1-year expiry instead of a lifetime null.

### Bug 2 — `activateMembership()` resets `joinDate` on upgrade

`activateMembership()` always writes `joinDate: new Date()`. For a new membership application this is correct. For an upgrade, the member already has a `joinDate` and it must not be changed.

**Fix:** Add a separate `applyUpgrade(memberId, membershipType)` function that updates only `membershipType` and `expiryDate` without touching `joinDate` or `memberStatus`. `recordPayment()` must call `applyUpgrade()` instead of `activateMembership()` when `paymentType = 'upgrade'`.

### Bug 3 — Success/cancel URL hardcoded to `/membership`

`createUpgradeSession()` sends users to `/membership/success` on success and `/membership` on cancel. Spec requires `/dashboard`.

---

## 4. Gaps to Fill (New Work)

### Gap 1 — `consecutiveSince` field missing from `Member`

New field: `consecutiveSince DateTime? @map("consecutive_since") @db.Date`

`calculateCumulativePaid()` must be updated to:
```
WHERE createdAt >= member.consecutiveSince AND status = 'completed' AND paymentType IN ('membership','upgrade')
```

Backfill: on schema push, all existing `Member` rows have `consecutiveSince = null`. A migration-seed step must set `consecutiveSince = joinDate` for all active members.

`consecutiveSince` reset: in `activateMembership()`, when a member transitions from `expired` → `active` (rejoining after a lapse), set `consecutiveSince = new Date()`.

### Gap 2 — `calculateUpgradeCost()` scope limited to life/patron/benefactor

Must accept any `MembershipType` as target. The UPGRADE_TARGET_FEE_IDS lookup table must be replaced with a dynamic `prisma.membershipFee.findUnique({ where: { membershipType: targetType } })`.

Eligibility rule: change from `isActive || isRecentlyExpired || hasNoPriorMembership` → `isActive` only. This is a spec requirement.

### Gap 3 — `GET /api/memberships/upgrade-options` endpoint missing

Returns for the authenticated member:
```json
{
  "cumulativePaidCents": 12000,
  "options": [
    { "membershipType": "fiveYearFamily", "displayName": "Five-Year Family", "fullPriceDollars": 100, "upgradeFeeCents": 8000 },
    ...
  ]
}
```

Eligible options = all `MembershipFee` rows where `amountDollars > currentTierDollars` AND `isAdminOnly = false` AND `membershipType != honoraryNoVote` AND (target is higher-priced OR target is `lifeWard`/lifetime with price > current).

Special case: `lifeWard` ($100) members can upgrade to `patron` ($500) and `benefactor` ($1000). `fiveYearFamily` ($100) members cannot upgrade to `lifeWard` ($100) — same price, no cross-tier.

### Gap 4 — `createUpgradeSession()` type constraint too narrow

Change `targetType: 'life' | 'patron' | 'benefactor'` → `targetType: MembershipType`. The Stripe product label must use `membershipType` directly.

### Gap 5 — `UpgradeSessionSchema` must accept all valid upgrade targets

Replace the hardcoded enum with `z.nativeEnum(MembershipType)` (validated against eligibility server-side, not in schema).

### Gap 6 — fiveYearFamily expiry on upgrade must be July 4 anchored

When upgrading to `fiveYearFamily`, `expiryDate` must be July 4 of the year that is 5 years after the next July 4 from today — not a rolling +1825 days.

New helper `nextJuly4FromDate(from: Date): Date` — needed in `applyUpgrade()`.

### Gap 7 — Annual→Annual upgrade must not change expiry date

If a member upgrades within the annual tier family (e.g., `annualSingle` → `annualFamily`), the current `expiryDate` is unchanged. `applyUpgrade()` must detect this case.

### Gap 8 — Upgrade UI on dashboard and profile pages

Both pages need an additive unstyled section containing:
- "You have paid $X toward your membership" (from `GET /api/memberships/upgrade-options`)
- A `<select>` dropdown listing eligible tiers with price and upgrade fee
- A submit button ("Upgrade")
- A confirmation step before proceeding (for $0 upgrades: inline confirm; for paid upgrades: redirect to Stripe URL)

### Gap 9 — `isUpgradePath = true` for patron/benefactor in seed

`seed.ts` lines 40–41: change `isUpgradePath: false` → `isUpgradePath: true` for `patron` and `benefactor`.

---

## 5. Edge Cases

| Case | Handling |
|------|---------|
| Upgrade to same-price tier (fiveYearFamily ↔ lifeWard, both $100) | Blocked — `amountDollars` must be strictly greater. Exception: lifeWard → patron/benefactor is allowed (higher price). |
| Cumulative payments exceed target price (upgrade fee ≤ $0) | `autoActivate: true`, no Stripe session, $0 PaymentRecord written |
| Member is `honoraryNoVote` | `isAdminOnly = true`; `GET /upgrade-options` returns empty options array; no UI rendered |
| Benefactor (top tier) member | No tier has `amountDollars > 1000`; options array empty; no UI rendered |
| Lapsed member (status = expired) | `calculateUpgradeCost()` returns `eligible: false`; upgrade UI not shown (FR-01 gates on `memberStatus = active`) |
| Spouse session initiates upgrade | Allowed — spouse has full edit permissions (SPEC-19 FR-04); upgrade applies to primary member's record |
| Stripe webhook fires twice (duplicate event) | Idempotent via `stripeEventId` unique constraint — P2002 swallowed in `handleCheckoutCompleted()` |
| `consecutiveSince` is null for existing member | `calculateCumulativePaid()` must treat null as "sum all history" (backfill safety net). After backfill runs, null should not occur for active members. |
| Member upgrades then the job runs expiry check | `expireOverdueMemberships()` checks `expiryDate < now`. Lifetime tiers have `expiryDate = null` — `lt: new Date()` with null is falsy in Prisma. No change needed. |

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `activateMembership()` is called from multiple paths (checkout webhook, approve, admin cancel). Changing it affects all callers. | High | High | Do NOT change `activateMembership()`. Add a separate `applyUpgrade()`. Gate in `recordPayment()` by `paymentType`. |
| Backfill `consecutiveSince` is irreversible if wrong | Medium | High | Set `consecutiveSince = joinDate` for active members, null for others. Safe: if wrong, admin can manually correct per member. |
| `isUpgradePath` flag change for patron/benefactor may affect `calculateCumulativePaid()` which filters by this flag | Medium | Medium | Once patron/benefactor have `isUpgradePath = true`, prior patron/benefactor payments will be included in cumulative total. This is correct per spec — all payments across tiers count. |
| Stripe session metadata currently uses `paymentType: 'upgrade'` — webhook already routes this correctly | Low | None | No risk; existing path confirmed working. |
| Changing eligibility check to `active`-only breaks existing upgrade-session tests | Low | Low | Update the 3 existing tests in `route.test.ts` to reflect new eligibility rules. |

---

## 7. Build Sequence

**Group 1 — Schema (hard prerequisite)**
1. `prisma/schema.prisma` — add `consecutiveSince DateTime? @map("consecutive_since") @db.Date` to `Member`
2. Run `npx prisma db push` + `npx prisma generate`

**Group 2 — Bug fixes (prerequisite to new feature)**
3. `lib/memberships/constants.ts` — add `patron`, `benefactor` to `NO_EXPIRY_TYPES`
4. `lib/memberships/membership-service.ts` — remove patron/benefactor from `EXPIRY_DAYS`
5. `lib/payments/payment-service.ts` — remove patron/benefactor from `EXPIRY_DAYS`; add `applyUpgrade()`; update `recordPayment()` to call `applyUpgrade()` when `paymentType = 'upgrade'`; update `calculateCumulativePaid()` to filter by `consecutiveSince`; update `calculateUpgradeCost()` eligibility and target-type scope; set `consecutiveSince` in `activateMembership()` rejoin branch

**Group 3 — Seed + helpers**
6. `prisma/seed.ts` — set `isUpgradePath = true` for patron/benefactor; add backfill step for `consecutiveSince`
7. `lib/payments/stripe.ts` — broaden `createUpgradeSession()` to accept `MembershipType`; fix success/cancel URLs to `/dashboard`

**Group 4 — API routes**
8. `app/api/memberships/upgrade-options/route.ts` — new `GET` endpoint returning cumulative total + eligible tiers
9. `app/api/payments/upgrade-session/route.ts` — update `UpgradeSessionSchema` to accept any `MembershipType`

**Group 5 — UI**
10. `app/dashboard/page.tsx` — add upgrade section (fetch upgrade-options, render dropdown + submit)
11. `app/profile/page.tsx` — same upgrade section

---

## 8. Files Affected (complete list)

| File | Change Type | Notes |
|------|-------------|-------|
| `prisma/schema.prisma` | Schema change | Add `consecutiveSince` to `Member` |
| `prisma/seed.ts` | Data change | `isUpgradePath = true` for patron/benefactor; backfill `consecutiveSince` |
| `lib/memberships/constants.ts` | Bug fix | Add patron/benefactor to `NO_EXPIRY_TYPES` |
| `lib/memberships/membership-service.ts` | Bug fix | Remove patron/benefactor from `EXPIRY_DAYS` |
| `lib/payments/payment-service.ts` | Bug fix + new logic | Remove EXPIRY_DAYS entries; add `applyUpgrade()`; update `recordPayment()`, `calculateCumulativePaid()`, `calculateUpgradeCost()`, `activateMembership()` |
| `lib/payments/stripe.ts` | Extension | Broaden `createUpgradeSession()` type; fix success/cancel URL |
| `app/api/memberships/upgrade-options/route.ts` | New file | `GET` upgrade options for authenticated member |
| `app/api/payments/upgrade-session/route.ts` | Extension | Broaden `UpgradeSessionSchema` |
| `app/dashboard/page.tsx` | New UI section | Upgrade dropdown + cumulative total |
| `app/profile/page.tsx` | New UI section | Same upgrade section |
| `app/api/payments/upgrade-session/route.test.ts` | Test update | Fix eligibility tests to reflect active-only rule |
| `lib/payments/payment-service.test.ts` | New tests | Cover `applyUpgrade()`, `consecutiveSince` filtering, $0 path |

**Files NOT to modify:**
- `app/api/webhooks/stripe/route.ts` — no changes needed
- `lib/payments/webhook-handlers.ts` — no changes needed (bug fix in `payment-service.ts` flows through)
- Any file outside `apps/web/` — no monorepo boundary crossings

---

## 9. Implementation Readiness

- [x] All requirements understood
- [x] No blocking questions remain
- [x] Scope is clearly defined
- [x] Risks are acceptable
- [x] Critical bugs identified and mitigation planned

**Recommendation:** ✅ Proceed to Design

---

## Handoff to Design Agent

1. **Three critical bugs must be fixed first** before wiring the new UI: (a) patron/benefactor missing from `NO_EXPIRY_TYPES`, (b) `activateMembership()` resetting `joinDate` on upgrades — add `applyUpgrade()` instead, (c) Stripe success URL pointing to `/membership` instead of `/dashboard`.
2. **`calculateCumulativePaid()` is the heart of this feature.** Its `consecutiveSince` filter is the only non-trivial query change. The rest of the upgrade path already works end-to-end for life/patron/benefactor — the design phase is mostly extension, not rebuilding.
3. **Eligibility gate is `memberStatus = active` strictly** — remove the recently-expired and no-prior-membership branches from `calculateUpgradeCost()`. No spec ambiguity here.
4. **fiveYearFamily expiry needs a `nextJuly4FromDate()` helper** — design should specify the exact algorithm (next July 4 after `today`, then +5 years).
5. **The upgrade UI is a single reusable section** that fetches `GET /api/memberships/upgrade-options` and renders the dropdown. It should be extracted as a server component or a small async block, not copy-pasted into both dashboard and profile.
