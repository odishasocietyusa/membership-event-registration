# SPEC-25 — Phase 1: Analysis

**Spec:** Profile Page Membership Label & Expiry Display  
**Analyst:** Claude Code  
**Date:** 2026-05-30  
**Status:** Complete

---

## 1. Requirement Parsing

Two distinct display rules:

1. **Tier label** — show a human-readable label for the member's `membershipType` for all 9 types.
2. **Expiry date** — show "Valid through [date]" only when `expiryDate` is non-null; suppress the row entirely for null-expiry tiers.

---

## 2. Current State Audit

### `apps/web/app/profile/ProfileClient.tsx`

**Lines 54–64** — `MEMBERSHIP_TYPE_LABELS` map already covers all 9 types:

| Key | Label |
|-----|-------|
| `annualStudentNoVote` | Annual Student (no vote) |
| `annualSingle` | Annual Single |
| `annualFamily` | Annual Family |
| `fiveYearFamily` | Five-Year Family |
| `life` | Life |
| `lifeWard` | Life (Ward) |
| `patron` | Patron |
| `benefactor` | Benefactor |
| `honoraryNoVote` | Honorary |

**FR-01 is already satisfied.** No label work required.

**Lines 412–418** — Membership fieldset:

```tsx
<fieldset>
  <legend>Membership</legend>
  <p><strong>Type:</strong> {member.membershipType ? (MEMBERSHIP_TYPE_LABELS[member.membershipType] ?? member.membershipType) : '—'}</p>
  <p><strong>Status:</strong> {member.memberStatus ?? '—'}</p>
  <p><strong>Join date:</strong> {formatDate(member.joinDate, '—')}</p>
  <p><strong>Expiry date:</strong> {formatDate(member.expiryDate, '—')}</p>
</fieldset>
```

**Issues with line 417:**
- The label "Expiry date" is shown unconditionally for all tiers.
- When `expiryDate` is `null`, `formatDate` returns `'—'`, presenting a meaningless `Expiry date: —` to life / patron / benefactor / honorary members.

### `apps/web/lib/utils/date.ts`

`formatDate(date, fallback)` — returns `fallback` when `date` is falsy. This is safe to call with `null`; the fix is to conditionally render the row rather than relying on the fallback.

### `apps/web/lib/auth/with-auth.ts`

`MemberRow = Member` (Prisma `Member` type). `expiryDate: DateTime? @db.Date` — typed as `Date | null` in the generated Prisma client. The null check `member.expiryDate !== null` is valid.

---

## 3. Functional Requirements — Verification

| ID | Requirement | Status |
|----|-------------|--------|
| FR-01 | Show tier label for all types | Already satisfied — `MEMBERSHIP_TYPE_LABELS` is complete |
| FR-02 | Show "Valid through" row when `expiryDate` non-null | Not yet implemented — row renders unconditionally |
| FR-03 | Suppress expiry row when `expiryDate` is `null` | Not yet implemented |
| FR-04 | Rename "Expiry date" → "Valid through" | Not yet implemented |

**Net implementation gap: 1 line change** (line 417 in `ProfileClient.tsx`).

---

## 4. Edge Cases

| Case | Handling |
|------|----------|
| `membershipType = null` (no membership yet) | Type row shows `—`; expiry row absent (expiryDate is null for non-members) |
| `expiryDate` set on a life member (data anomaly) | Row would appear — acceptable, data is technically correct |
| `formatDate` timezone shift on `@db.Date` | Existing behavior unchanged — no regression risk |

---

## 5. Risk Assessment

**Risk:** None. This is a pure conditional render in a client component. No API, schema, or service-layer changes. No new dependencies. Existing Playwright tests are unaffected (they test save/edit flows, not the read-only membership section).

---

## 6. Implementation Scope

**Single file:** `apps/web/app/profile/ProfileClient.tsx`  
**Lines affected:** 417 (replace 1 unconditional `<p>` with a conditional render)  
**Other files:** None
