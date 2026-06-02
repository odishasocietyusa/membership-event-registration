# SPEC-25 — Phase 2: Design

**Spec:** Profile Page Membership Label & Expiry Display  
**Architect:** Claude Code  
**Date:** 2026-05-30  
**Status:** Complete

---

## 1. Change Plan

Single file. Single line replaced.

**File:** `apps/web/app/profile/ProfileClient.tsx`  
**Target:** Line 417 — the unconditional expiry `<p>` inside the Membership fieldset.

---

## 2. Before / After

**Before (line 417):**
```tsx
<p><strong>Expiry date:</strong> {formatDate(member.expiryDate, '—')}</p>
```

**After:**
```tsx
{member.expiryDate && (
  <p><strong>Valid through:</strong> {formatDate(member.expiryDate)}</p>
)}
```

Changes:
- Conditional render on `member.expiryDate` (truthy when non-null `Date`)
- Label renamed "Expiry date" → "Valid through"
- `fallback` argument removed — row is absent when null, so a fallback `'—'` is never needed

---

## 3. Test Cases (RED phase targets)

No unit test file exists for this component. The QA phase will verify via manual render check and the existing Playwright E2E suite.

However, the logic is simple enough that the RED test target is the rendered DOM:

| Scenario | Expected DOM |
|----------|-------------|
| Annual member, `expiryDate = 2027-06-15` | `<p><strong>Valid through:</strong> June 15, 2027</p>` present |
| Life member, `expiryDate = null` | No element with text "Valid through" or "Expiry date" |
| `membershipType = null`, `expiryDate = null` | No expiry row |

---

## 4. No-Touch Boundaries

| File | Reason |
|------|--------|
| `apps/web/app/profile/page.tsx` | Server component — `expiryDate` already flows through `MemberRow` |
| `apps/web/lib/memberships/constants.ts` | `NO_EXPIRY_TYPES` not needed client-side; null check is authoritative |
| Any API route | No data change |
| Prisma schema | `expiryDate DateTime?` already correct |
