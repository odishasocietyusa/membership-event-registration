# Phase 4 QA Report — SPEC-18: Member Profile Edit

> **Date:** 2026-05-18
> **Status:** Ship with fixes (3 issues to resolve)

---

## 1. Pass/Fail Summary

| ID | Requirement | Status |
|----|-------------|--------|
| FR-01 | `/profile` auth-guarded, redirects to `/login` | PASS |
| FR-02 | Page pre-populated from GET /api/members/me + family | PASS |
| FR-03 | Read-only fields displayed | PASS |
| FR-04 | Editable fields present | PASS |
| FR-04b | chapterId auto-derived server-side | PASS |
| FR-04c | No match → chapterId=null → "No Chapter" | PASS |
| FR-04d | Chapter updated after save | PASS |
| FR-05 | Profile visibility toggles | PASS |
| FR-06 | Family members listed with Remove | PASS |
| FR-07 | Add family member; spouse email field | PASS |
| FR-08 | Remove without reload | PASS |
| FR-09 | Edit family member via PUT | PASS |
| FR-09b | FamilyMember.email in schema | PASS (migration pending) |
| FR-10 | Save calls PUT /api/members/me | PASS |
| FR-11 | Bio and spouseName in UpdateMemberSchema | PASS |
| FR-12 | Inline save confirmation | PASS |
| FR-13 | Inline error on failure | PASS |
| FR-14 | Admin note near email field | PASS |
| FR-15 | Nav bar Profile link | PASS |
| FR-16 | No CSS | PASS |
| NFR-01 | withAuth userId-first lookup | PASS |
| NFR-02 | Members only edit own profile | PASS |
| NFR-03 | Read-only fields rejected by API | PASS |
| NFR-04 | No CSS | PASS |
| NFR-05 | chapterId never accepted from client | PASS |

---

## 2. Issues Found

### C-1 (Critical): Empty address overwrites existing data on every save

**File:** `ProfileClient.tsx` — `handleSave`
**Problem:** `address` is always included in the payload, even when untouched. For members who have an address from registration, saving the profile (without touching the address section) sends `{ street: '', city: '', zip: '', state: '', country: 'USA' }`. This triggers chapter re-derivation with an empty state, setting `chapterId = null` and overwriting the stored address with empty strings.
**Fix:** Only send address when at least one field is non-empty.

### H-1 (High): Clearing dateOfBirth / graduationYear in family edit is impossible

**File:** `ProfileClient.tsx` — `handleSaveEdit`
**Problem:** Falsy checks (`if (editForm.dateOfBirth)`) silently omit empty values. User clears a date, saves, sees success — but old value persists.
**Fix:** Send `null` explicitly to clear; update `UpdateFamilyMemberSchema` to accept `.nullable()`.

### H-3 (High): Clearing fullName in family edit produces silent no-op

**File:** `ProfileClient.tsx` — `handleSaveEdit`
**Problem:** `if (editForm.fullName.trim())` omits empty fullName. User clears name, save succeeds, old name reappears silently.
**Fix:** Add client-side validation error if fullName is empty on save.

---

## 3. Security Review

| Check | Verdict |
|-------|---------|
| chapterId absent from UpdateMemberSchema | PASS |
| updateFamilyMember() ownership enforcement | PASS |
| Profile page data leak | PASS |
| Read-only fields excluded from member API | PASS |
| withAuth case 3 (email match, userId mismatch) | ACKNOWLEDGED — documented edge case, acceptable risk |

---

## 4. Overall Verdict

**Ship with fixes.** All 25 FR/NFR requirements pass. Fix C-1, H-1, H-3 before deploying.
