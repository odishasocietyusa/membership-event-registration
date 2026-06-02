# Feature Specification: Profile Page Membership Label & Expiry Display

> **Spec ID:** SPEC-25-profile-membership-label
> **Status:** Implementation Complete — Pending Manual Verification
> **Author:** Utkal Nayak
> **Created:** 2026-05-30

---

## 1. Overview

### 1.1 Summary
The profile page's Membership fieldset must clearly display a member's tier using a human-readable label for all membership types. For time-limited tiers (annual and five-year), the expiry date must also be shown. For lifetime and honorary tiers where `expiryDate` is `null`, the expiry row must be omitted entirely — showing a `—` placeholder for a non-existent date is confusing and not meaningful to the member.

### 1.2 Goals
- [ ] Show a human-readable membership tier label for every membership type on the profile page
- [ ] Show "Valid through" date only when `expiryDate` is non-null (annual / five-year tiers)
- [ ] Suppress the expiry row entirely for null-expiry tiers (life, lifeWard, patron, benefactor, honoraryNoVote)

### 1.3 Non-Goals (Out of Scope)
- Visual styling / badges — no CSS added until Figma designs are delivered (see frontend styling constraint)
- Admin-facing membership display (separate concern)
- Displaying expiry in the member directory / search results

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | The Membership fieldset must display the member's tier using the human-readable label from `MEMBERSHIP_TYPE_LABELS` for all 9 membership types | Must Have | Labels already exist in `ProfileClient.tsx:54-64` |
| FR-02 | A "Valid through" row must be shown when `member.expiryDate` is non-null, formatted as a readable date | Must Have | Applies to `annualStudentNoVote`, `annualSingle`, `annualFamily`, `fiveYearFamily` |
| FR-03 | The expiry row must be absent (not rendered) when `member.expiryDate` is `null` | Must Have | Applies to `life`, `lifeWard`, `patron`, `benefactor`, `honoraryNoVote` |
| FR-04 | The label "Expiry date" must be renamed to "Valid through" to be clearer to members | Should Have | Current label is "Expiry date" at `ProfileClient.tsx:417` |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | No new dependencies introduced | — | Use existing `formatDate` utility |
| NFR-02 | No CSS or styling changes | — | UI is unstyled until Figma is delivered |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] `MEMBERSHIP_TYPE_LABELS` covers all 9 types (already complete — verify no gaps)
- [ ] "Valid through" row renders correctly for an annual member with a set `expiryDate`
- [ ] "Valid through" row is absent for a life / patron / benefactor member
- [ ] Existing profile page E2E test (if any) passes; no regressions on save/edit flows

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Annual member | `membershipType = annualSingle`, `expiryDate = 2027-06-15` | Profile page loads | Shows "Annual Single" label and "Valid through: Jun 15, 2027" |
| Five-year member | `membershipType = fiveYearFamily`, `expiryDate = 2031-03-01` | Profile page loads | Shows "Five-Year Family" and "Valid through: Mar 1, 2031" |
| Life member | `membershipType = life`, `expiryDate = null` | Profile page loads | Shows "Life" label; no "Valid through" row rendered |
| Patron member | `membershipType = patron`, `expiryDate = null` | Profile page loads | Shows "Patron" label; no "Valid through" row rendered |
| Benefactor member | `membershipType = benefactor`, `expiryDate = null` | Profile page loads | Shows "Benefactor" label; no "Valid through" row rendered |
| No membership type | `membershipType = null` | Profile page loads | Shows "—" for type; no expiry row |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Existing `MEMBERSHIP_TYPE_LABELS` map and `formatDate` utility
- **Must Avoid:** CSS classes, Tailwind, inline styles — unstyled only

### 4.2 Patterns to Follow
- Conditional rendering using `member.expiryDate !== null` — do not use a separate set constant in the client; the null check is the authoritative signal
- Keep the change surgical: only modify the Membership fieldset block in `ProfileClient.tsx`

### 4.3 Files to Modify
- `apps/web/app/profile/ProfileClient.tsx` — update Membership fieldset (lines 412–418): rename "Expiry date" → "Valid through" and wrap in `{member.expiryDate && ...}`

### 4.4 Files NOT to Modify
- `apps/web/lib/memberships/constants.ts` — no change needed
- `apps/web/app/profile/page.tsx` — server component unchanged; `expiryDate` already flows through `MemberRow`
- Any API routes

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- None — `expiryDate` is already present on `MemberRow` and passed to `ProfileClient`

### 5.2 Downstream Impact
- SPEC-24 (Rolling Expiry): when SPEC-24 is implemented, `expiryDate` will be correctly set for annual/five-year members; this spec ensures the profile page renders it properly. The two specs are independent but complementary.

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should `honoraryNoVote` suppress the expiry row? | Resolved | Yes — honorary membership has no expiry (`expiryDate` = `null`); row is suppressed by the null check |
| Should the member see "Member since" (joinDate) alongside the label? | Open | joinDate is already shown as a separate row — no change needed unless UX spec says otherwise |

---

## 7. References

- `apps/web/app/profile/ProfileClient.tsx:54-64` — existing `MEMBERSHIP_TYPE_LABELS`
- `apps/web/app/profile/ProfileClient.tsx:412-418` — Membership fieldset to modify
- `apps/web/lib/utils/date.ts` — `formatDate` utility
- SPEC-24 — rolling expiry implementation (sets `expiryDate` correctly for new payments)
- Frontend styling constraint memory — no CSS until Figma delivered

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation

### Phase 1: Analysis
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-25/01-analysis.md`

### Phase 2: Design
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-25/02-design.md`

### Phase 3: Implementation
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-25/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Complete — Pending Manual Verification
- **Artifact:** `specs/artifacts/SPEC-25/04-qa-report.md`
