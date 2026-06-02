# SPEC-25 — Phase 3: Implementation Log

**Spec:** Profile Page Membership Label & Expiry Display  
**Implementer:** Claude Code  
**Date:** 2026-05-30  
**Status:** Complete

---

## Changes Made

### `apps/web/app/profile/ProfileClient.tsx` — line 417

Replaced unconditional expiry `<p>` with a conditional render:

```tsx
// Before
<p><strong>Expiry date:</strong> {formatDate(member.expiryDate, '—')}</p>

// After
{member.expiryDate && (
  <p><strong>Valid through:</strong> {formatDate(member.expiryDate)}</p>
)}
```

- Row is absent when `expiryDate` is `null` (life, lifeWard, patron, benefactor, honoraryNoVote)
- Row renders with formatted date when `expiryDate` is non-null (annual / five-year tiers)
- Label renamed "Expiry date" → "Valid through"
- Fallback argument removed from `formatDate` — no longer needed since the row is conditionally rendered

---

## Files Modified

| File | Lines Changed |
|------|--------------|
| `apps/web/app/profile/ProfileClient.tsx` | 417 (1 line replaced with 3) |

## Files NOT Modified

All other files untouched as per design constraints.
