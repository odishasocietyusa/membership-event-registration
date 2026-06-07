# SPEC-15 — Phase 2: Design

**Spec:** Navigation Bar (Redesign)
**Architect:** Claude Code
**Date:** 2026-06-06
**Status:** Complete

---

## 1. Resolution of Open Design Questions (from Phase 1 Analysis §5 / spec §7)

| Question | Decision | Rationale |
|---|---|---|
| Routes for "Policy Documents" / "Forms" | `/about/policy-documents` and `/about/forms` | Matches the `/about/*` sibling convention already used by Mission & Vision, Member Rights, Administration, etc. Both are simple public stubs (same template as existing About Us pages) — no auth-gating, since the original `/members/policy` (auth-gated) is being superseded by this split, and policy/forms content is reference material the product owner described as broadly relevant |
| "Upgrade Membership" link target | `/dashboard` | The SPEC-21 upgrade UI already renders inline on both `/dashboard` and `/profile`. Adding anchor-scroll (`#upgrade`) would require touching SPEC-21's dashboard markup — out of surgical scope for a nav spec. Link to `/dashboard`, where the upgrade section is visible to eligible members; this satisfies "the item exists and goes somewhere correct" without scope creep |
| Redirect vs. delete for old `/activities/*` (12 dirs) | **Redirect** to `/programs/[slug]` via `next.config.ts` `redirects()` | Satisfies NFR-04 ("no broken links / no 404s", carried forward unchanged). A static config-level redirect map is the lowest-risk option — no code paths inside the old directories need to keep working, and it's trivially reversible. Slugs will be chosen to match 1:1 (e.g. `/activities/odia-learning` → `/programs/odia-learning`) so the mapping is mechanical |
| `/about/contact` — keep, redirect, or delete | **Redirect** to `/` (home page now contains the contact info per FR-20) | Same NFR-04 rationale — anyone with the old link lands on the page that now actually has the content |
| `/about/committees` — keep, redirect, or delete | **Redirect** to `/programs/osa-committees` | "OSA Committees" becomes a Programs entry; redirecting preserves any existing links and is consistent with the `/activities/*` migration approach |
| `/members/policy`, `/members/bog-minutes` — keep, redirect, or delete | **Leave in place, unlinked** (no redirect, no deletion) | These pages are functional, harmless, and not linked from anywhwere in the new tree — "unlinked but present" violates no requirement (NFR-04 only prohibits *broken* links, not *unlinked* pages). Deleting them is unnecessary surgical risk for zero functional gain; redirecting them implies a replacement that doesn't exist. If the product owner wants them gone later, that's a one-line follow-up |

All redirects are implemented as static entries in `next.config.ts` `async redirects()` — no new page-level redirect logic, no runtime cost, and they're trivially auditable in one place.

---

## 2. NavBar Restructure

### 2.1 Approach
`app/components/nav-bar.tsx` is **modified in place** — the component signature (`{ user: Member | null }`), the four derived booleans (`isAuthed`, `isOsaDomain`, `isAdmin`, `displayName`), and the `<details>/<summary>` collapsible pattern all carry over unchanged. Only the JSX tree composition changes, menu-by-menu:

| Menu | Change type | Notes |
|---|---|---|
| Logo / Home | Simplify | Remove the separate `<li><Link href="/">Home</Link></li>` — the existing `<strong><Link href="/">OSA Community Platform</Link></strong>` already satisfies "logo → home" |
| About Us | Edit submenu list | Remove "Member Rights & Privileges" (→ Members), "OSA Committees" (→ Programs), "Contact Us" (→ home page); add "Policy Documents" (`/about/policy-documents`), "Forms" (`/about/forms`); relabel "Vision & Mission" → "Mission & Vision" (same `href`) |
| Members | Edit submenu list | Remove "Member Dashboard" (→ utility bar), "Policy Documents & Forms" (split into About Us), "Member Search" relabeled "Member Directory" (same `href="/members/search"`), "BOG Meeting Minutes" removed (page stays, unlinked per §1); add "Membership Types" (`/membership`), "Upgrade Membership" (`/dashboard`), "Statement of Member Rights & Privileges" (`/about/member-rights`, relocated in) |
| Events (renamed from "Activities") | Trim to 3 items | Keep `Events` (`/events`, auth-gated — same `isAuthed` guard as before), `Annual Convention` (`/activities/convention`), `Awards` (`/activities/awards`). Note: Convention/Awards routes stay at their current `/activities/*` paths — only the *menu* they appear under changes; no need to move these two pages since they aren't part of the Programs migration |
| Programs (new, replaces 12-item Activities tail) | New dynamic submenu | Server-side fetch of `static_page` docs where `section == "programs"`, rendered as `<Link href={`/programs/${slug}`}>{title}</Link>` — see §3 |
| Chapters | No change | Carries over verbatim — same 3 items, same guards (`isAuthed`, `isOsaDomain`) |
| Publications | No change | Carries over verbatim — same 5 items |
| Admin | Promote to dropdown | Replace the single `{isAdmin && <Link href="/admin">Admin Panel</Link>}` utility-bar item with a `<details><summary>Admin</summary>` dropdown (rendered only when `isAdmin`) containing: Manage Members (`/admin/members`), Manage Payments (`/admin/payments`), Manage Events (`/admin/events`), Reports (`/admin/reports`) |
| Donate | Relocate | Move the `<Link href="/donate">Donate</Link>` out of the trailing utility `<span>` into the primary `<ul>` as the last `<li>`, always rendered (no guard) |
| Utility bar | Restructure | Trailing `<span>` becomes: `{isAuthed ? <>{Dashboard link} | {displayName link} | {Sign Out form}</> : <>{Sign In} | {Register}</>}` — Admin Panel and Donate removed from here (promoted to primary nav) |

### 2.2 Rendering order in the trailing utility area
Per the conversation-confirmed order "User name | Dashboard | Sign Out", the JSX renders: `Dashboard` link (`/dashboard`) → `displayName` link (`/profile`, unchanged from current) → Sign Out form (unchanged). This matches FR-19/FR-11.

---

## 3. Programs Menu — Sanity Integration Design

### 3.1 New query (`apps/web/sanity/lib/queries.ts`)
Mirrors the existing `STATIC_PAGE_BY_SLUG_QUERY` shape, filtered by section and ordered:
```ts
export const PROGRAMS_BY_SECTION_QUERY = groq`
  *[_type == "static_page" && section == "programs"] | order(sort_order asc) {
    _id,
    title,
    "slug": slug.current,
    sort_order
  }
`
```
Only the fields the nav needs (`title`, `slug`) plus `sort_order` for debugging — body/last_updated are fetched by the detail page, not the nav query, keeping the nav payload minimal.

### 3.2 Where the fetch happens
**Decision: inside `NavBar` itself**, not hoisted into `layout.tsx`. Rationale: `layout.tsx`'s existing `getCurrentMember()` call is about *auth*, a cross-cutting concern for the whole shell; the Programs list is nav-presentation data, scoped entirely to `NavBar`. Keeping the fetch local to the component that uses it is more surgical and avoids growing `layout.tsx`'s responsibilities. `NavBar` becomes:
```ts
export default async function NavBar({ user }: NavBarProps) {
  const programs = await sanityFetch<SanityProgramLink[]>(PROGRAMS_BY_SECTION_QUERY, {}, false) ?? []
  // ... existing derivation + JSX, using `programs` to render the Programs <details>
}
```
(`NavBar` is already an `async` server component pattern-compatible — confirmed it's invoked as `<NavBar user={user} />` from an async layout; making it `async` itself is a one-line change consistent with `news/[slug]/page.tsx` and other Sanity-backed server components in this codebase.)

### 3.3 Caching / failure behavior
Follow the home page's existing `export const revalidate = 60` ISR convention — but since `NavBar` is a shared component (not a route segment), the revalidation window is governed by whatever route renders it; this is acceptable because the Programs list changes rarely (content-author operation, not a live feed). On fetch failure, `sanityFetch` returns `null`/`undefined` (per its existing contract, evidenced by `?? []` fallbacks elsewhere in the codebase) — `programs` defaults to `[]`, and the Programs `<details>` renders with an empty `<ul>` rather than crashing the nav or the page shell. This degrades gracefully and keeps the rest of the nav fully functional if Sanity is unreachable.

### 3.4 `/programs/[slug]` route
New file `apps/web/app/programs/[slug]/page.tsx`, directly modeled on the existing `app/news/[slug]/page.tsx` / `app/about/page.tsx` pattern:
```tsx
import { notFound } from 'next/navigation'
import { PortableText } from '@portabletext/react'
import { sanityFetch } from '@/sanity/lib/client'
import { STATIC_PAGE_BY_SLUG_QUERY } from '@/sanity/lib/queries'
import type { SanityStaticPage } from '@/types/sanity'

export const revalidate = 60

export default async function ProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await sanityFetch<SanityStaticPage>(STATIC_PAGE_BY_SLUG_QUERY, { slug })
  if (!page) notFound()
  return (
    <main>
      <h1>{page.title}</h1>
      <PortableText value={page.body} />
    </main>
  )
}
```
Reuses the **existing** `STATIC_PAGE_BY_SLUG_QUERY` (generic slug lookup, not section-scoped) — no new query needed for the detail page, only for the nav listing (§3.1). This is consistent with how `/about` already consumes `static_page` documents.

### 3.5 Sanity Studio seed data
13 `static_page` documents to author (content-team task, not code): the 12 migrated Activities entries (Odia Learning, Odissi Music, Odisha Development, OSA Public Library, Higher Education, Professional Networking, Health & Wellness, Drama Festival, Sampark Dori, Nilachakra, Women's Forum, Classified) plus OSA Committees — each with `section = "programs"`, a `sort_order` (matching the original menu's display order, e.g., 10, 20, 30… leaving gaps for future insertions), a `title`, `slug`, and minimal placeholder `body` (since these were "Coming soon" stubs with no real content per the original spec's non-goals).

---

## 4. Home Page Additions (FR-20)

`app/page.tsx` currently fetches and renders `ANNOUNCEMENTS_LATEST_QUERY` results via `sanityFetch`. The new sections follow the **same established pattern** — typed Sanity query + `sanityFetch` + plain-HTML rendering (no CSS, per the unchanged styling constraint):

| New section | Data source | Notes |
|---|---|---|
| Current Executive Info | New query against existing leadership/admin content (likely `leadership_program` schema, used by `/leadership-program` — reuse rather than create a new schema) | Confirm with product owner during implementation whether "current executive" maps to an existing Sanity document type or needs a new lightweight query filter (e.g., "current term" flag) |
| Key Upcoming Events | Existing `ALL_EVENTS_QUERY` (or a new `UPCOMING_EVENTS_QUERY` limited/sorted by date) | `/events` already has Sanity-backed event data (per `app/events/[slug]`) — reuse the schema, add a home-page-scoped query variant if the existing one returns more than needed |
| News | Existing `ALL_NEWS_POSTS_QUERY` pattern, limited (mirrors the existing `ANNOUNCEMENTS_LATEST_QUERY` limit-5 approach) | Follow the `HOMEPAGE_ANNOUNCEMENT_LIMIT` constant convention already in `page.tsx` |
| Contact Info | Static content (address, email, phone) OR a dedicated `static_page` doc (`slug: "contact"`) | Recommend a `static_page` document — keeps content editable without redeploys, consistent with the rest of the CMS-driven approach. Migrates the content that would have lived at `/about/contact` |

Each section follows the existing `<section><h2>…</h2>…</section>` structure already used for Announcements — purely additive, no restructuring of the existing announcement block.

---

## 5. Files to Create / Modify (final, supersedes spec §6.2 draft list)

```
apps/web/
├── app/
│   ├── page.tsx                               MODIFY — add 4 sections (FR-20), reuse sanityFetch pattern
│   ├── components/
│   │   └── nav-bar.tsx                        MODIFY — restructure per §2; becomes async, fetches Programs list
│   ├── about/
│   │   ├── policy-documents/page.tsx          CREATE — public stub, About Us template
│   │   └── forms/page.tsx                     CREATE — public stub, About Us template
│   ├── programs/
│   │   └── [slug]/page.tsx                    CREATE — Sanity-driven dynamic route, mirrors news/[slug]
│   └── admin/
│       ├── events/page.tsx                    CREATE — admin-only stub
│       └── reports/page.tsx                   CREATE — admin-only stub
├── sanity/
│   └── lib/queries.ts                         MODIFY — add PROGRAMS_BY_SECTION_QUERY
├── next.config.ts                             MODIFY — add redirects(): 12× /activities/* → /programs/*,
│                                                /about/contact → /, /about/committees → /programs/osa-committees
└── middleware.ts                              NO CHANGE — /admin/* prefix already covers new admin stubs
```

**Not modified / explicitly left alone:** `layout.tsx` (already wires `NavBar` correctly), `app/members/policy`, `app/members/bog-minutes` (left dormant per §1), the 12 `/activities/*` directories (redirected via config, not deleted — preserves git history and is instantly reversible), `app/profile/page.tsx` and `app/dashboard/page.tsx` (no anchor/scroll changes — see §1 "Upgrade Membership" decision).

---

## 6. Test Plan Outline (for Phase 4 QA)

- Unauthenticated user sees: About Us, Members (Member Benefits only), Events (Convention/Awards only, not "Events"), Programs, Chapters (Chapter Details only), Publications, Donate, Sign In, Register — no Admin, no BOG Documents, no Dashboard/user menu
- Suspended member sees identical to unauthenticated (except `/dashboard` shows suspension message)
- Active authenticated member sees full Members/Chapters/Events submenus, Dashboard + name + Sign Out in utility bar, no Admin/BOG unless additionally qualified
- `@odishasociety.org` member additionally sees BOG Documents
- Admin additionally sees the Admin dropdown with all 4 sub-items
- Programs dropdown renders all Sanity-seeded entries in `sort_order`; degrades to empty list (not a crash) if Sanity is unreachable
- All 12 old `/activities/*` URLs redirect to their `/programs/*` counterparts (NFR-04)
- `/about/contact` redirects to `/`; `/about/committees` redirects to `/programs/osa-committees`
- New stubs (`/about/policy-documents`, `/about/forms`, `/admin/events`, `/admin/reports`, `/programs/[slug]`) all return 200, not 404
- Home page renders all 4 new sections without breaking the existing announcements block
