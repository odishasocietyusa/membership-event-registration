# SPEC-15 — Phase 1: Analysis

**Spec:** Navigation Bar (Redesign)
**Analyst:** Claude Code
**Date:** 2026-06-06
**Status:** Complete

---

## 1. Context — This Is a Redesign, Not a Greenfield Build

SPEC-15 was already implemented and shipped on 2026-05-17 (commit `b68dbb3 "implement navigation bar and stub pages (SPEC-15)"`):
- `NavBar` server component (`apps/web/app/components/nav-bar.tsx`) using native `<details>/<summary>` for collapsible submenus
- `layout.tsx` resolving the member once via `getCurrentMember()` and passing `user` to `NavBar`
- ~30 stub pages (public "Coming soon" stubs, auth-gated stubs that redirect to `/login`, a domain-restricted BOG Documents stub)
- `middleware.ts` extended to gate the new auth-required routes
- A visual-distinction sweep (`border={1}`, `cellPadding={4}`, `<fieldset>/<legend>`)

The spec file's "Agent Workflow Tracking" section was never updated to reflect this (showed "Not Started" for all phases) — the same stale-status pattern found and corrected for SPEC-22.

On 2026-06-06, a design conversation with the product owner concluded the menu's information architecture needed restructuring (grouping by audience/purpose rather than content type). **This analysis treats the work as a restructure of a working, in-production component** — the bulk of the surrounding infrastructure (auth plumbing, stub pattern, layout wiring, middleware gating) is correct and reusable; what changes is the menu tree shape, a handful of new routes, and one new content-integration pattern (Sanity-driven Programs menu).

---

## 2. Existing Code Audit

### 2.1 `app/components/nav-bar.tsx` (current structure)
Read in full — implements the **original** tree from SPEC-15 §2.1b: Home / About Us / Members / Chapters / Activities / Publications, with Admin Panel + Donate + user menu in a trailing utility span. Auth derivation:
```ts
const isAuthed    = user !== null && user.memberStatus !== 'suspended'
const isOsaDomain = isAuthed && (user?.email?.endsWith('@odishasociety.org') ?? false)
const isAdmin     = isAuthed && user?.role === 'admin'
const displayName = user?.fullName ?? user?.email ?? null
```
This derivation logic is **directly reusable** for the redesign — none of the new structural requirements (Programs, Admin-as-dropdown, Donate placement, utility-bar Dashboard) change the underlying auth model. Only the JSX tree composition changes.

### 2.2 `app/layout.tsx`
Already resolves `user` via `getCurrentMember()` (wrapped in try/catch, logs on failure) and passes it to `<NavBar user={user} />`. **No changes needed** beyond what FR-20 (home page content) requires — and that's a change to `app/page.tsx`, not `layout.tsx`.

### 2.3 `middleware.ts`
Protected-route matcher currently includes: `/dashboard`, `/admin`, `/events`, `/members/policy`, `/members/search`, `/members/bog-minutes`, `/obituary`, `/chapters/executives`, `/chapters/bog-documents`. New admin sub-routes (`/admin/events`, `/admin/reports`) are **already covered** by the existing `pathname.startsWith('/admin')` check — no middleware change required for those two. (The §6.2 file list in the spec listing middleware as MODIFY is conservative; confirm during design whether any *new* path prefixes outside `/admin` actually need adding — currently none are anticipated.)

### 2.4 Sanity `static_page` schema and query patterns
`apps/web/sanity/schemas/static-page.ts` already defines `section` (string, "Navigation grouping e.g. 'about', 'history'") and `sort_order` (number, default 0) — exactly the fields needed to drive a content-editable Programs menu. `STATIC_PAGE_BY_SLUG_QUERY` in `sanity/lib/queries.ts` is the established slug-fetch pattern (used by `/about`); a new `PROGRAMS_BY_SECTION_QUERY` follows the same shape but filters by `section` and orders by `sort_order`. Currently `static_page` is used for exactly one document (`about-us`) plus a demo page reference — **the Sanity-driven nav pattern does not yet exist anywhere in the codebase**; this will be the first real use of `section`/`sort_order` for navigation purposes.

### 2.5 Existing routes confirmed present
Verified via filesystem:
- `app/admin/{members, payments}` exist; `app/admin/events`, `app/admin/reports` do **not**
- All 14 `app/activities/*` stub directories exist
- `app/membership/{page.tsx, success/page.tsx}` exists (candidate for "Membership Types")
- `app/profile/page.tsx` exists and already references "upgrade" (SPEC-21 self-service upgrade UI lives inline here and on `/dashboard`)
- No dedicated `/membership/upgrade` or similar standalone upgrade route exists

---

## 3. Gap Analysis — Old Tree vs. New Tree

| New menu | Status | Detail |
|---|---|---|
| **About Us** | Mostly reuse + 2 new + 1 relocation | 5 of 6 items map to existing pages (Mission & Vision, Constitution & Bylaws, Administration, Past Leadership — relabeled only). "Policy Documents" and "Forms" are net-new pages (route TBD). "Member Rights & Privileges" relocates to Members. "Contact Us" and "OSA Committees" leave About Us entirely (see below). |
| **Members** | Mostly reuse + 1 relabel + 1 new link target | "Member Search" → "Member Directory" (label change only, same route `/members/search`). "Upgrade Membership" needs a link target — no dedicated route exists; SPEC-21 UI is inline on `/dashboard`/`/profile`. "Statement of Member Rights & Privileges" relocates in from About Us. "Policy Documents & Forms" and "BOG Meeting Minutes" drop out of this menu (superseded / unlinked — see open questions). |
| **Events** | Full reuse | All 3 items (`Events`, `Convention`, `Awards`) already exist at their current routes; this menu is essentially "Activities" trimmed down to 3 items, possibly with route renames under `/events/*` (design-phase decision, not required for function). |
| **Programs** | New integration pattern, content migration | Structurally new — first Sanity-driven nav menu in the codebase. 12 existing `/activities/*` stub pages' content migrates into `static_page` documents (`section = "programs"`), plus "OSA Committees" migrates in from About Us (13 total Programs entries). Requires: new GROQ query, new dynamic route `/programs/[slug]`, Sanity Studio seed data, and a decision on what happens to the old `/activities/*` routes (redirect vs. delete vs. leave dormant). |
| **Chapters** | Full reuse, unchanged | All 3 submenus and their access rules (public / auth-gated / domain-restricted) carry over verbatim from the original implementation — this menu's shape and behavior are identical to what's already live. |
| **Publications** | Full reuse, unchanged | All 5 submenus carry over verbatim. |
| **Admin** | Structural promotion + 2 new stubs | Promoted from a single utility-bar link to a primary dropdown. "Manage Members" and "Manage Payments" map to existing `/admin/{members,payments}`. "Manage Events" and "Reports" are net-new stubs at `/admin/events` and `/admin/reports`. |
| **Donate** | Relocation only | Page exists at `/donate`; only its position in the nav tree changes (utility bar → primary, rightmost). |
| **Utility bar** | Restructured | Drops Admin Panel and Donate (promoted to primary nav); gains "Dashboard" (relocated from the Members dropdown). User name / Sign Out / Sign In / Register logic is unchanged. |
| **Home page** | New content scope | Gains 4 new sections (executive info, upcoming events, news, contact info) absorbing "Contact Us" — the only change in this spec that touches page *content* rather than nav structure. Existing `app/page.tsx` already does Sanity-backed announcement fetching (`ANNOUNCEMENTS_LATEST_QUERY`) — the new sections should follow the same `sanityFetch` + typed-query pattern. |
| **"Home" link** | Removed | Logo already links to `/` in the existing `NavBar` (`<strong><Link href="/">OSA Community Platform</Link></strong>`) — removing the separate "Home" `<li>` is a one-line deletion; FR-02/FR-14 are effectively already satisfied by the logo link. |

---

## 4. Edge Cases & Risks

### 4.1 Programs menu — Sanity fetch in a server component nav
`NavBar` is rendered on every page via `layout.tsx`. Adding a Sanity fetch there means **every page render now depends on Sanity availability/latency** for the Programs submenu specifically (not the rest of the nav, which is derived purely from `user`).
- **Mitigation:** Use `sanityFetch` with the project's existing `revalidate`/ISR pattern (the home page uses `export const revalidate = 60`). Cache the Programs list at the layout or nav-bar level so it isn't refetched per-request. If Sanity is unreachable, the Programs dropdown should degrade to an empty or "Coming soon" state — **must not** break the rest of the nav or the page shell.
- **Decision needed in Phase 2:** where exactly the fetch happens (in `layout.tsx` alongside `getCurrentMember()`, or inside `NavBar` itself) and what the fallback UI looks like on fetch failure.

### 4.2 Content migration — 12 Activities pages → Sanity documents
These are currently static "Coming soon" stub pages with no real content (per the original spec's scope — "Building the content of stub pages" was a non-goal). Migrating them "into Sanity" at this stage effectively means: create 13 `static_page` documents (12 + OSA Committees) with placeholder/minimal content, `section = "programs"`, and a `sort_order`. This is a **content-authoring task**, not a code-migration task — it can happen in parallel with code changes via Sanity Studio. No data-loss risk since there's no real content to lose yet.

### 4.3 Old `/activities/*` routes — dangling links / 404 risk
If these routes are simply abandoned in favor of `/programs/[slug]`, any existing external links, bookmarks, or search-engine indexing pointing at `/activities/odia-learning` etc. would 404 — violating NFR-04 ("No broken links... 404s are not acceptable"), which is explicitly carried forward as an unchanged constraint. **A redirect strategy (e.g., `redirect()` in the old page or a `next.config` rewrite) should be the default assumption** unless the product owner confirms these routes have zero external exposure (likely true, since the site is presumably pre-launch/low-traffic, but worth confirming in Phase 2).

### 4.4 "Upgrade Membership" link target
SPEC-21 (self-service upgrade) implemented the upgrade UI as an inline section on `/dashboard` and `/profile` — there is no dedicated route. Linking to `/dashboard` or `/profile` from the nav works functionally but won't scroll the user to the upgrade section. Two options for Phase 2: (a) add an anchor/fragment (`/dashboard#upgrade`) if the section has a stable `id`, or (b) treat this as out of scope for SPEC-15 and simply link to `/dashboard` (the upgrade section is visible there for eligible members). Recommend (b) — adding anchor-scroll behavior would be scope creep into SPEC-21's territory.

### 4.5 Removed-from-nav pages: `/members/policy`, `/members/bog-minutes`, `/about/contact`, `/about/committees`
These pages exist (built in the original implementation) but have no slot in the redesigned tree. They are not necessarily *deleted* — just unlinked. Leaving them live-but-unlinked is harmless (no broken links, no orphaned nav items) and is the lowest-risk default. Phase 2 should make an explicit call per page: keep dormant, redirect, or delete — but **none of these decisions block moving forward**, since "unlinked but present" satisfies every functional requirement in this spec.

### 4.6 Wider primary bar (8 menus + Donate)
Per the product owner's explicit direction (recorded in conversation, 2026-06-06): overflow/responsive layout is deferred to the Figma redesign phase. No mitigation needed now — `<details>/<summary>` wraps naturally in plain HTML; visual overflow is a CSS concern, and CSS is out of scope (NFR-01 / non-goals, unchanged).

### 4.7 Suspended-member treatment carries over unchanged
FR-17's rule (suspended ≈ unauthenticated in nav, except `/dashboard` shows its own message) requires no new logic — it's derived from the same `user.memberStatus !== 'suspended'` check already in `NavBar`. The redesign doesn't introduce any new suspended-state edge cases.

---

## 5. No Blocking Questions

All structural design decisions were resolved in the 2026-06-06 product-owner conversation (recorded in spec §0 and the menu tree in §2.1). The items still marked "Open — design phase" in spec §7 (route names for Policy Documents/Forms, Upgrade Membership link target, redirect-vs-delete decisions for migrated/orphaned routes) are **implementation-detail decisions that don't block proceeding to Phase 2 Design** — they're exactly the kind of thing Phase 2 (Architect) is meant to settle, with reasonable proposals already on record in the spec to anchor that conversation.

---

## 6. Files to Touch (confirmed)

| File | Action | Why |
|------|--------|-----|
| `apps/web/app/components/nav-bar.tsx` | MODIFY | Restructure JSX tree to new menu shape; auth-derivation logic (`isAuthed`/`isOsaDomain`/`isAdmin`/`displayName`) is reused as-is |
| `apps/web/app/page.tsx` | MODIFY | Add executive/upcoming-events/news/contact sections (FR-20) — follow existing `sanityFetch` pattern already used for announcements |
| `apps/web/app/about/policy-documents/page.tsx` | CREATE | New stub (route pending Phase 2 confirmation) |
| `apps/web/app/about/forms/page.tsx` | CREATE | New stub (route pending Phase 2 confirmation) |
| `apps/web/app/programs/[slug]/page.tsx` | CREATE | Sanity-driven dynamic route, mirrors `/about/page.tsx`'s `STATIC_PAGE_BY_SLUG_QUERY` pattern |
| `apps/web/app/admin/events/page.tsx` | CREATE | New admin stub — "Manage Events" |
| `apps/web/app/admin/reports/page.tsx` | CREATE | New admin stub — "Reports" |
| `apps/web/sanity/lib/queries.ts` | MODIFY | Add `PROGRAMS_BY_SECTION_QUERY` (filter `section == "programs"`, order by `sort_order`) |
| `apps/web/middleware.ts` | NO CHANGE EXPECTED | `/admin/*` prefix already covers new admin stubs; confirm in Phase 2 whether any other new route needs gating (currently none anticipated) |
| Sanity Studio (content) | SEED | Author 13 `static_page` documents (`section = "programs"`) for the migrated Programs items, including "OSA Committees" |
| `apps/web/app/activities/*` (12 dirs) | DECIDE in Phase 2 | Redirect to `/programs/[slug]`, or leave dormant — avoid 404s either way (NFR-04) |
| `apps/web/app/about/contact`, `apps/web/app/about/committees` | DECIDE in Phase 2 | Likely redirect or repurpose once content relocates |
| `apps/web/app/members/policy`, `apps/web/app/members/bog-minutes` | DECIDE in Phase 2 | Currently built but unlinked in new tree — keep dormant, redirect, or delete |
