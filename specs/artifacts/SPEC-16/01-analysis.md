# Phase 1 Analysis — SPEC-16: Member Search

> **Spec:** `specs/active/SPEC-16-member-search.md`
> **Status:** Complete
> **Date:** 2026-05-17

---

## 1. Requirements Parsed

### Functional summary
A new page at `/members/search` lets any **authenticated, active** member search the directory by first name, last name, city, state, and country. Results include members of **any status** (active / expired / suspended). The result table has seven data columns plus an Actions column containing a pre-encoded "Send Message" link. Pagination is 100 per page; a hard cap of 1 000 total results prevents directory enumeration.

### Search validation rules (from spec + user Q&A)
| Condition | Verdict |
|-----------|---------|
| All fields blank | ❌ blocked |
| Country only (no name/city/state) | ❌ blocked |
| State selected, name+city blank | ✅ allowed |
| Any name or city field non-empty but < 3 chars | ❌ blocked |
| Any name or city field ≥ 3 chars | ✅ allowed |

---

## 2. Open Question Resolutions

### OQ-1 — Name field structure

**Finding:** `fullName` is the only name field in the `Member` table. The registration route (`/api/users/me/profile/route.ts:30`) explicitly concatenates:
```typescript
const fullName = `${firstName.trim()} ${lastName.trim()}`
```
`profileData` stores only `bio`, `spouseName`, and `children` — never the name split.

**Consequence:** First name and last name filters both execute as a case-insensitive `CONTAINS` on `fullName`. A search for last name "Raj" will also match members whose first name is "Raj" (e.g., "Raj Kumar"). This is an acceptable false-positive rate at OSA's membership scale and is flagged as a known limitation for the architect to document.

---

### OQ-2 — Prisma JSON path filtering

**Finding:** Prisma 6.2.0 (`@prisma/client ^6.2.0`) **does** support JSON path filtering with `mode: 'insensitive'` on nullable JSON fields. From the generated `JsonNullableFilterBase` type:
```typescript
{
  path?: string[]
  mode?: QueryMode   // includes 'insensitive'
  string_contains?: string
}
```

This means no `$queryRaw` is needed for city/state/country filters. The Prisma query syntax is:
```typescript
{ address: { path: ['city'], string_contains: cityTerm, mode: 'insensitive' } }
```

**Constraint:** A single Prisma filter object on a JSON field can only target **one path**. Combining city AND state AND country requires wrapping each in a separate `AND` clause:
```typescript
AND: [
  city    ? { address: { path: ['city'],    string_contains: city,    mode: 'insensitive' } } : undefined,
  state   ? { address: { path: ['state'],   string_contains: state,   mode: 'insensitive' } } : undefined,
  country ? { address: { path: ['country'], string_contains: country, mode: 'insensitive' } } : undefined,
].filter(Boolean)
```

---

### OQ-3 — Non-active caller page message

**Resolved in spec:** Show a plain `<p>` with text "Member search is available to active members only." and an `<a href="/membership">` link. No redirect — just an informative message on the page itself.

---

### OQ-4 — Canonical country string in stored data

**Finding:** The registration form (`/app/register/page.tsx:44`) defaults country to the string `'USA'` and stores it as free text. The admin edit page also uses a free-text input with no enforced format.

**Risks:**
- A small number of members may have typed `'United States'`, `'US'`, or `'America'` instead of `'USA'`.
- The `string_contains` filter with `mode: 'insensitive'` will match `'USA'` against stored `'usa'` or `'USA'`, but will **not** match `'United States'`.
- This is a data quality issue pre-dating this spec, not introduced by it.

**Decision:** The country dropdown emits `'USA'` and `'Canada'` exactly. The filter uses `string_contains` (not exact match) so `'Canada'` will match `'Canada'` and `'CANADA'` but not `'CA'`. Acceptable for the current scope.

---

### OQ-5 (New) — State storage format

**Finding (critical):** The state field is currently a **free-text input** in the registration form with no dropdown and no enforced format. Existing members may have stored:
- Full names: `'Georgia'`, `'New York'`
- Abbreviations: `'GA'`, `'NY'`
- Mixed case: `'georgia'`
- Canadian provinces as text: `'Ontario'`, `'ON'`

**Risk:** The new spec introduces a state dropdown. If the dropdown uses **full names** (e.g., `'Georgia'`) but a member stored `'GA'`, the state filter will not match their record and they will be invisible in state-based searches.

**Recommendation:** Use **abbreviations** (e.g., `GA`, `NY`, `ON`) in both the US and Canadian province dropdowns. Abbreviations are the most common free-text entry convention for US address forms, so they maximise match rate against existing data. The `string_contains` filter means `'GA'` will match `'GA'`, `'SAVANNAH, GA'` style strings too — minor but acceptable false positive. The architect must document this as a known data-quality limitation.

---

## 3. Codebase Findings

### 3.1 Existing routes — what exists vs. what is needed

| Route | Auth | Scope | Usable? |
|-------|------|-------|---------|
| `GET /api/members` | Admin only | All members, paginated | ❌ Wrong access level |
| `GET /api/members/search` | Does not exist | — | ➕ Must create |
| `/members/search/page.tsx` | Login-check only | Sanity CMS stub | ✏️ Must replace |

The admin route (`apps/web/app/api/members/route.ts`) must **not** be modified — its access level is intentional.

---

### 3.2 Active-status enforcement pattern

`withAuth` (`lib/auth/with-auth.ts`) validates the JWT and checks **role hierarchy** only. It does not check `memberStatus`. No existing route enforces active status.

**Pattern for this feature:** Add an explicit inline check immediately after `withAuth` resolves the user:
```typescript
export const GET = withAuth(async (req, { user }) => {
  if (user.memberStatus !== 'active') {
    return jsonResponse(403, { error: 'Member search is available to active members only.' })
  }
  // ... rest of handler
})
```
This is the correct scope — it should NOT be added to `withAuth` globally.

---

### 3.3 Name search implementation

Since `fullName` is the only name field:

| Search input | Prisma filter |
|---|---|
| `firstName = 'Utkal'` | `{ fullName: { contains: 'Utkal', mode: 'insensitive' } }` |
| `lastName = 'Nayak'` | `{ fullName: { contains: 'Nayak', mode: 'insensitive' } }` |
| Both provided | `AND: [{ fullName contains firstName }, { fullName contains lastName }]` |

**Known limitation:** Last name `'Raj'` will also match `'Raj Kumar'` (whose last name is `'Kumar'`). Acceptable at OSA's scale.

---

### 3.4 Pagination

The existing `PaginatedResult<T>` interface and `skip`/`take` pattern in `listMembers` can be reused. Changes needed for `searchMembers`:
- `pageSize` fixed at 100 (not variable like `listMembers`)
- `total` capped at 1 000 — use `Math.min(rawCount, 1000)` and limit DB query to `OFFSET + TAKE ≤ 1000`
- Response shape adds `truncated: boolean` flag

```typescript
// Cap enforcement
const CAP = 1000
const skip = (page - 1) * PAGE_SIZE
if (skip >= CAP) return { results: [], total: cappedTotal, page, pageSize: PAGE_SIZE, truncated: true }
const take = Math.min(PAGE_SIZE, CAP - skip)
```

---

### 3.5 Result DTO — PII boundary

The API must return a **strict DTO**, never a raw `Member` row. Fields allowed in response:

| Field | Source | Notes |
|-------|--------|-------|
| `lastName` | Parsed from `fullName` (last word) | Display only — not stored separately |
| `firstName` | Parsed from `fullName` (all but last word) | Display only |
| `city` | `address?.city` | May be null |
| `state` | `address?.state` | May be null |
| `memberSince` | `joinDate` | Formatted as `YYYY-MM-DD` |
| `membershipType` | `membershipType` | Enum string |
| `memberStatus` | `memberStatus` | Enum string |
| `memberId` | `id` | **Only** exposed in the Send Message href — not as a visible table cell |

Fields **never** in response: `email`, `phone`, `stripeCustomerId`, `userId`, `profileData`, `profileVisibility`, `deletedAt`.

---

### 3.6 Send Message link

`memberId` is a UUID. The href `/messages/new?to={memberId}` exposes the UUID, which is not PII and cannot be reverse-engineered to find sensitive data. The messaging epic will create the target route. No security concern.

---

### 3.7 Geo constants file

A new `lib/constants/geo.ts` must export:
- `US_STATES`: Array of `{ label: string; value: string }` — 50 states using **abbreviation as value** (e.g., `{ label: 'Georgia', value: 'GA' }`)
- `CA_PROVINCES`: Array of `{ label: string; value: string }` — 13 provinces/territories using abbreviation as value (e.g., `{ label: 'Ontario', value: 'ON' }`)

The dropdown submits the **value** (abbreviation) to the API. The filter uses `string_contains` with the abbreviation.

---

### 3.8 Country dropdown swap — client component requirement

The state-dropdown-swap behaviour (USA ↔ Canada province list) requires a `onChange` event handler. The `/members/search/page.tsx` must therefore be a **Client Component** (`'use client'`), which means the auth redirect must move to a wrapping server layout or be handled via middleware.

**Options:**
1. Keep the page as a Server Component; auth check in server component; extract the search form + results into a `SearchClient` client component
2. Use Next.js middleware to guard the `/members/search` route

**Recommendation:** Option 1 — thin server component wrapping a `<MemberSearchClient />` client component. This is consistent with how the dashboard and admin pages are structured in this project.

---

## 4. Risk Register

| ID | Risk | Severity | Mitigation |
|----|------|----------|------------|
| R-01 | First/last name search false positives due to single `fullName` field | Low | Document as known limitation; acceptable at OSA scale |
| R-02 | State filter miss-rate for members who stored a different format (full name vs abbreviation) | Medium | Use abbreviations in dropdown; document in UI; data can be normalised in a future migration |
| R-03 | Country filter miss-rate for members who typed 'United States' instead of 'USA' | Low | `string_contains` handles case; exact mismatch affects a small minority |
| R-04 | No DB index on `address` JSON column — full-table scan for city/state/country filters | Medium | Acceptable at current member count (<10 000); architect should note for future indexing if needed |
| R-05 | `address` field is nullable — JSON path filter on `NULL` address returns no match (correct behaviour, but city/state searches will exclude members with no address) | Low | Expected: members with no address simply don't appear in city/state searches |

---

## 5. Files to Create or Modify

| File | Action | Reason |
|------|--------|--------|
| `apps/web/app/api/members/search/route.ts` | **Create** | New member-facing search API |
| `apps/web/app/members/search/page.tsx` | **Replace** | Current stub is non-functional |
| `apps/web/app/members/search/MemberSearchClient.tsx` | **Create** | Client component for form + results (needed for state dropdown swap) |
| `apps/web/lib/members/member-service.ts` | **Modify** | Add `searchMembers()` function |
| `apps/web/lib/validation/member.schema.ts` | **Modify** | Add `MemberSearchQuerySchema`, `MemberSearchResultSchema`, `MemberSearchResponseSchema` |
| `apps/web/lib/constants/geo.ts` | **Create** | US states + Canadian provinces typed lists |

---

## 6. Edge Cases

| Case | Handling |
|------|----------|
| Member has no `address` (null) | city/state/country filters return no match — correct; fullName-only searches still work |
| Member has `fullName = null` | firstName/lastName filters return no match — correct |
| `page` beyond cap (e.g., page 11 with cap 1000 / pageSize 100) | Return empty results array, `truncated: true` |
| Search returns exactly 1 000 results | `truncated: false` (cap not exceeded); only show cap warning when raw count > 1 000 |
| `firstName` and `lastName` both provided | AND condition — must satisfy both |
| State selected but no country selected | Country filter omitted; state filter applied against all records |

---

## 7. Clarifying Questions for User

None — all open questions resolved through code analysis and prior user Q&A.

---

## 8. Approval Checklist

- [x] All spec requirements parsed and understood
- [x] All open questions (OQ-1 through OQ-4) resolved
- [x] New risk OQ-5 (state format inconsistency) identified and mitigation proposed
- [x] Codebase patterns identified for auth, pagination, JSON filtering, DTO shaping
- [x] File change list confirmed — no unintended modifications to existing routes
- [x] No remaining clarifying questions for the user
