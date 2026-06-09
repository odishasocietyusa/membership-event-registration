# SPEC-29 — Phase 1: Analysis

**Spec:** Member Expertise Directory
**Analyst:** Claude Code
**Date:** 2026-06-07
**Status:** Complete

---

## 1. Spec Understanding

### 1.1 Feature Summary
A new self-registration directory under `/membership` where members in long-standing tiers (Life, Life Ward, Patron, Benefactor, Honorary) can list a fixed-category area of expertise, an optional organization/affiliation, and a short blurb — so the community can find people to invite for collaboration. Visible to any active member; filterable by category, paginated at 25/page, sorted newest-first; admin can hide unfit entries.

### 1.2 Key Objectives
1. Gate registration to five eligible membership tiers; block Annual/Five-Year tiers server-side.
2. Provide a directory listing page (Name, Organization, Categories, Blurb) with category filter, 25-per-page pagination, newest-first sort, gated to active members.
3. Allow self-edit/self-delete of one's own entry, and admin hide/unhide moderation.

---

## 2. Requirements Breakdown

### 2.1 Extracted Requirements

| ID | Requirement | Type | Complexity | Dependencies |
|----|-------------|------|------------|--------------|
| REQ-01 | Eligibility gate (membershipType allow-list) on registration | Functional | Low | Member.membershipType |
| REQ-02 | Registration form: organization (optional), categories (multi-select, fixed enum), blurb (required, capped) | Functional | Low | — |
| REQ-03 | Self-edit / self-delete own entry | Functional | Low | REQ-02 |
| REQ-04 | Directory listing page, active-member gated | Functional | Med | REQ-08 |
| REQ-05 | Category filter (server-side query) | Functional | Low | REQ-04 |
| REQ-06 | Pagination at 25/page | Functional | Low | REQ-04 (mirrors `member-search.ts` `SEARCH_PAGE_SIZE`) |
| REQ-07 | Sort newest-first | Functional | Low | `orderBy: { createdAt: 'desc' }` |
| REQ-08 | Viewer access control — active members only | Functional | Low | `getCurrentMember()` / `withAuth()` |
| REQ-09 | Admin hide/unhide (soft moderation) | Functional | Low | Admin role check, mirrors `ServiceProvider.status` pattern |

### 2.2 Implicit Requirements
- [ ] One entry per member (1:1 `Member` ↔ `ExpertiseProfile`), matching `ServiceProvider.memberId @unique`.
- [ ] "Name" displayed comes from `Member.fullName`, not re-entered (per `services/register` convention: "Your name (...) will be displayed on your profile").
- [ ] Re-validate eligibility/active-status on every mutating request (PATCH/DELETE), not just at registration time — a member's tier or status can change after they've registered.
- [ ] Admin moderation list needs to show hidden + visible entries (mirrors `listProviders({ includeAll: true })`).

### 2.3 Edge Cases Identified
1. **Member becomes ineligible after registering** (e.g., downgrades from Life to Annual, or a data-fix changes their tier). Decision needed: keep entry visible, auto-hide, or leave to admin discretion. → tracked as OQ-4 in the spec; **recommended resolution: leave the entry as-is** (no auto-hide). Eligibility is a one-time gate at registration, consistent with the spec's framing ("Once registered, it will be available..."); adding tier-change monitoring is unrequested complexity. Admin can always hide manually if needed.
2. **Member's status goes expired/suspended after registering.** The directory listing query already filters to show only entries whose owning member is active-equivalent — actually, re-reading the spec: visibility to *viewers* requires active status, but nothing says an inactive member's *entry* should disappear. Recommendation: do not add an extra join/filter on the owning member's status for listing purposes — keeps the query simple and matches "soft-hide via admin" being the only moderation lever. (If desired later, this is a one-line `where` addition.)
3. **Duplicate registration attempts** — blocked by the existing `getProviderByMemberId`-style lookup + redirect-to-edit pattern.
4. **Category set changes in the future** (new category added/removed) — using a Prisma enum means schema migration is required to add/remove values; alternative is `String[]` validated against an app-level constant array (like `ServiceProvider.specializations`). Recommend the latter for lower migration friction — see Recommendations §6.1.

---

## 3. Scope Validation

### 3.1 In Scope (Confirmed)
- Self-registration form (organization, categories, blurb) for the five eligible tiers
- Self-edit / self-delete
- Directory listing page under `/membership`, active-member gated
- Category filter, 25/page pagination, newest-first sort
- Admin hide/unhide moderation

### 3.2 Out of Scope (Confirmed)
- Messaging/contact between members (no Resend relay, unlike Services Directory)
- Free-text/name search
- Photo uploads
- Annual/Five-Year member registration

### 3.3 Ambiguous (Needs Clarification)
- [x] Route name — **resolved below**: `/membership/expertise`
- [x] Sort field (`createdAt` vs `updatedAt`) — **resolved below**: `createdAt desc` (registration order; matches `ServiceProvider`/`searchMembers` convention of stable `createdAt`-based ordering, and avoids confusing re-ordering on minor edits)
- [x] Blurb length cap — **resolved below**: 500 characters max, 10 minimum (mirrors `ServiceProvider.bio` validation: `min(10).max(1000)`; 500 is tighter to keep it genuinely "short" per the spec's wording)
- [ ] Auto-hide on eligibility/status change — **recommended: no** (see Edge Case 1/2 above); flagged for final user confirmation in Open Questions

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Category drift — free-text categories would break aggregation/filtering | Low | High | Use a fixed, validated set (enum or constant array + Zod `.enum`/`.refine`), enforced both client and server side |
| Eligibility bypass via direct API call | Low | Med | Server-side check in the registration route handler (`withAuth`), not just UI-level hiding of the "Register" link |
| Pagination/filter combined query cost on large directories | Low | Low | Mirror `member-search.ts`: single `Promise.all([count, findMany])` with `skip`/`take`; no result cap needed at this scale (directory size bounded by eligible-tier population) |
| Confusion with existing Services Directory (`/services`, `ServiceProvider`) — both are "member self-registration directories" | Med | Low | New dedicated `ExpertiseProfile` model and route namespace; do not touch `ServiceProvider`/`/services/**` |

---

## 5. Questions for User

> ⚠️ None are blocking — all have a recommended default below. Flag if you'd prefer different defaults.

1. [ ] Confirm route `/membership/expertise` (vs. e.g. `/membership/expertise-directory`) — short and consistent with `/membership/success`.
2. [ ] Confirm **no auto-hide** on tier/status change after registration (admin can always hide manually) — recommended to keep scope minimal per AGENTS.md "simplicity is the goal."
3. [ ] Confirm blurb cap of **500 characters** (min 10).

---

## 6. Recommendations

### 6.1 Suggested Simplifications
- **Use a constant string array + Zod validation for categories instead of a Prisma enum.** This exactly mirrors the existing `ServiceProvider.specializations: String[]` + `RegisterProviderSchema.specializations` pattern (array column, validated against an app-level list). It avoids a schema migration if the organization ever needs to tweak the category list, and keeps the codebase consistent — there is no precedent for using a Postgres enum for this kind of "fixed but app-managed" list (`ProviderStatus`/`MembershipType` are true structural enums; specializations are not). Filtering uses `{ has: category }` exactly as `listProviders` does today.
- **Skip the `includeAll`/admin-list duplication** — reuse the same `listExpertiseProfiles({ category, page, includeHidden })` shape as `listProviders`, following the established convention.
- **No contact/messaging infrastructure** — confirmed out of scope; do not create a `*ContactLog` model or Resend integration for this feature.

### 6.2 Technical Concerns
- None significant. This is a smaller, simpler variant of the just-shipped Services Directory (no email-privacy concerns, no Resend, no rate limiting) — the existing patterns (`withAuth`, `getCurrentMember`, `member-search.ts` pagination, `ServiceProvider`/`AdminServiceActions` moderation UI) cover every architectural need.

---

## 7. Codebase Findings

### Auth
- `getCurrentMember()` (`lib/auth/get-current-member.ts`) — server-component helper; returns `{ member, isSpouseSession }` or `null`. Used by `services/page.tsx` and `membership/page.tsx` for page-level gating + `redirect('/login')`.
- `withAuth(handler, { role? })` (`lib/auth/with-auth.ts`) — Bearer-token API route wrapper; resolves `MemberRow` server-side. Used for all mutating API routes (POST/PATCH/DELETE).
- Active-status check is a simple `member.memberStatus !== 'active'` guard (see `services/register/page.tsx`).
- Admin check is `member.role !== 'admin'` (see `admin/services/page.tsx`).

### Directory & Moderation Pattern (Services Directory, SPEC-23 — directly reusable template)
- Model: `ServiceProvider` with `memberId @unique`, `status: ProviderStatus` (`pending | active | inactive`), `specializations: String[]`.
- Service layer: `lib/services/service-provider-service.ts` — `listProviders(filters)`, `getProviderById`, `getProviderByMemberId`, `createProvider`, `updateProvider`, `deleteProvider`. All reads use an explicit `PUBLIC_SELECT` + `toPublic()` mapper.
- Validation: `lib/validation/service-provider.schema.ts` — `RegisterProviderSchema` (Zod), `UpdateProviderSchema = RegisterProviderSchema.partial().extend({ status })`.
- API routes: `app/api/services/route.ts` (GET list / POST register), `app/api/services/[id]/route.ts` (PATCH/DELETE).
- Pages: `app/services/page.tsx` (listing + filter form via `<form method="GET">` + `searchParams`), `app/services/register/page.tsx` (eligibility + duplicate-entry redirect), `app/services/[id]/edit` (self-edit).
- Admin: `app/admin/services/page.tsx` (table + counts by status) + `AdminServiceActions.tsx` (client component; Supabase session token → `fetch(PATCH/DELETE)`).
- **Note:** the Services Directory uses `pending → active → inactive` (admin-approval workflow). SPEC-29 has **no approval step** — entries go live immediately, and admin only *hides* unfit ones. So the status model should be simpler: a boolean `isHidden` (or two-state `visible | hidden` enum) rather than reusing `ProviderStatus`.

### Pagination Pattern (directly reusable template)
- `lib/members/services/member-search.ts`: `SEARCH_PAGE_SIZE = 25`, `skip = (page - 1) * PAGE_SIZE`, single `Promise.all([prisma.X.count(where), prisma.X.findMany({ where, skip, take, orderBy })])`, returns `{ results, total, page, pageSize }`.
- No result cap (`SEARCH_RESULT_CAP`) is needed for this feature — the eligible population (Life/Patron/Benefactor/Life-Ward/Honorary tiers) is inherently small relative to the 1000-row cap used for full member search.

### Membership Routes & Nav
- `/membership` (`app/membership/page.tsx`) — existing page for membership type info, tier upgrade, payment. New route `/membership/expertise` would sit alongside `/membership/success` as a sub-route.
- Nav bar: `app/components/nav-bar.tsx` line 46 — `<li><Link href="/membership">Membership Types</Link></li>` inside the Membership submenu; a new "Expertise Directory" link would be added here, following the same `<li><Link>` pattern used for "Services" under Programs (per SPEC-23 analysis).

### Eligible Membership Types (from `prisma/schema.prisma`)
```
enum MembershipType {
  annualStudentNoVote, annualSingle, annualFamily, fiveYearFamily,  // ← NOT eligible
  life, lifeWard, patron, benefactor, honoraryNoVote                // ← eligible
}
```

---

## 8. Analysis Summary

### Ready for Design Phase?
- [x] All requirements understood
- [x] No blocking questions remain (all have recommended defaults; user can override during Design review)
- [x] Scope is clearly defined — smaller/simpler than the just-shipped Services Directory, with every needed pattern already present in the codebase
- [x] Risks are acceptable

**Recommendation:** ✅ Proceed to Design

---

## Handoff to Design Agent

**Key Context for Designer:**
1. **Treat the Services Directory (SPEC-23) as the structural template** — `ServiceProvider` model/service/validation/routes/pages/admin-moderation — but simplify: no approval workflow (`pending` state), no `*ContactLog`/Resend/rate-limiting, no email-privacy concerns. New model name: `ExpertiseProfile`; new field for moderation: a simple two-state visibility flag (`isHidden: Boolean` recommended over a `pending|active|inactive`-style enum, since there's no approval step).
2. **Categories are a fixed app-level list** (`Academics, Healthcare, Charity, Music, Dance, Technology, Science, Law, Professional Services, Other`), stored as `String[]` and validated via Zod `.enum`/`.refine` against a shared constant — exactly mirroring `ServiceProvider.specializations`. Do not use a Postgres enum (avoids migration friction for a list the org may want to tweak).
3. **Pagination must follow `member-search.ts`**: `PAGE_SIZE = 25`, `Promise.all([count, findMany])`, `skip`/`take`, returns `{ results, total, page, pageSize }`. Sort `orderBy: { createdAt: 'desc' }`.
4. **Eligibility allow-list**: `['life', 'lifeWard', 'patron', 'benefactor', 'honoraryNoVote']` — checked server-side at registration (and re-checked is unnecessary for edit/delete of an already-existing entry, since ineligibility doesn't retroactively revoke).
5. **Recommended route**: `/membership/expertise` (listing), `/membership/expertise/register`, `/membership/expertise/[id]/edit` — mirrors `/services`, `/services/register`, `/services/[id]/edit`.
