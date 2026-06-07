# Feature Specification: Navigation Bar

> **Spec ID:** SPEC-15
> **Status:** Complete
> **Author:** Utkal Nayak
> **Created:** 2026-05-16
> **Revised:** 2026-06-06
> **Redesign completed:** 2026-06-07

---

## 0. Revision Note (2026-06-06)

The original version of this spec (§§1–8 below, created 2026-05-16) was implemented and shipped on 2026-05-17 (commit `b68dbb3 "implement navigation bar and stub pages (SPEC-15)"`) — `NavBar` server component, ~30 stub pages, middleware gating, and visual-distinction sweep are all live in `main`.

On 2026-06-06, a follow-up design conversation with the product owner concluded that the menu structure needed a significant restructure (driven by user feedback on information architecture — grouping by audience/purpose rather than by content type). **This revision supersedes the menu structure in §2.1 and the derived requirements/inventory in §§3–6**, while keeping this single document as the continuous record of both the original build and the redesign — so future readers see one coherent history rather than two disconnected decisions.

Key structural changes from the original:
- "Activities" (15 items) split into **Events** (Events, Convention, Awards) and **Programs** (the remaining 12 affinity/cultural items + OSA Committees, driven dynamically from Sanity `static_page` documents)
- **Chapters** and **Publications** remain standalone primary menus (unchanged in role, slightly adjusted membership)
- **Admin Panel** promoted from a utility-bar link to a full primary dropdown menu (Manage Members, Manage Payments, Manage Events, Reports)
- **Donate** moved from the utility bar to the primary nav bar (rightmost, standalone)
- **Member Dashboard** moved out of the Members dropdown into the utility bar (alongside user name / Sign Out)
- Explicit **Home** link removed — logo now serves as the home link
- **Contact Us** content absorbed into the home page itself (current executive info, upcoming events, news, contact info) rather than a standalone About Us subpage
- Several Members/About Us submenu items renamed or regrouped (see §2.1)

---

## 1. Overview

### 1.1 Summary
Redesign the existing global navigation bar (rendered on every page via the root layout, implemented under the original version of this spec) to a new information architecture: eight primary menus (About Us, Members, Events, Programs, Chapters, Publications, Admin, Donate) plus a logo-as-home link and a simplified utility bar (user name, Dashboard, Sign Out — or Sign In / Register when unauthenticated). Menu items continue to render conditionally based on authentication state, membership status, and email domain, with suspended members treated identically to unauthenticated users everywhere except `/dashboard`. No CSS styling — bare functional HTML only (unchanged constraint).

### 1.2 Goals
- [ ] Every page has a consistent top navigation without duplicating auth logic
- [ ] Unauthenticated and suspended users see only public items
- [ ] Authenticated active members see the full menu
- [ ] Admin users see an Admin primary menu with management sub-items
- [ ] BOG Documents visible only to `@odishasociety.org` email addresses
- [ ] Sign In / Register replaced by user name + Dashboard + Sign Out (utility bar) when authenticated
- [ ] Programs menu is driven by Sanity `static_page` documents (`section` + `sort_order` fields), so content editors can add/reorder affinity-group pages without code changes
- [ ] Home page gains new content sections (current executive info, upcoming events, news, contact info) absorbing the old standalone "Contact Us" page

### 1.3 Non-Goals
- CSS styling, dropdowns/hover effects beyond native `<details>/<summary>` (deferred to Figma phase)
- Mobile hamburger menu (deferred to Figma phase)
- Notification badges or unread message counts (future spec)
- Building out full content for stub pages (nav links to stubs are fine for this spec)
- Overflow/responsive handling for the now-wider primary bar (8 menus + Donate) — explicitly deferred to the Figma redesign per product owner

---

## 2. Navigation Structure

> **2026-06-06 redesign — supersedes the tree below as of this revision.** See §0 for rationale. The original tree (as implemented in `b68dbb3`) is preserved at the bottom of this section as a historical reference (§2.1b).

### 2.1 Full Menu Tree (current — post-redesign)

```
[Logo → /]                                                        (no explicit "Home" link; logo is the home link)
│
├── About Us
│   ├── Mission & Vision              /about/vision-mission         public  ← EXISTS (relabel only; was "Vision & Mission")
│   ├── Constitution & Bylaws         /constitution                 public  ← EXISTS
│   ├── Policy Documents              TBD (new route)               public/auth TBD — design phase
│   ├── Forms                         TBD (new route)               public/auth TBD — design phase
│   ├── Administration                /about/administration         public  ← EXISTS (Sanity)
│   └── Past Leadership               /leadership-program           public  ← EXISTS
│
├── Members
│   ├── Membership Types              /membership                   auth-gated ← EXISTS
│   ├── Member Benefits               /members/benefits             public  ← EXISTS
│   ├── Member Directory              /members/search               auth-gated ← EXISTS (relabel only; was "Member Search")
│   ├── Upgrade Membership            TBD — link into /dashboard or /profile upgrade section (SPEC-21), or new dedicated route — design phase
│   ├── Member Profile                /profile                      auth-gated ← EXISTS
│   ├── Obituary                      /obituary                     auth-gated ← EXISTS
│   └── Statement of Member Rights & Privileges  /about/member-rights  auth-gated ← EXISTS (moved here from About Us; relabeled)
│
├── Events
│   ├── Events                        /events                       auth-gated ← EXISTS
│   ├── Annual Convention             /activities/convention        public  ← EXISTS (route may be renamed under /events — design phase)
│   └── Awards                        /activities/awards            public  ← EXISTS (route may be renamed under /events — design phase)
│
├── Programs                                                        Sanity-driven — see §2.1.1
│   └── [items rendered dynamically from `static_page` docs where `section == "programs"`, ordered by `sort_order`]
│       Covers (content-managed, not hardcoded): Odia Learning, Odissi Music, Odisha Development,
│       OSA Public Library, Higher Education, Professional Networking, Health & Wellness,
│       Drama Festival, Sampark Dori, Nilachakra, Women's Forum, Classified, OSA Committees
│
├── Chapters
│   ├── Chapter Details               /chapters                     public  ← EXISTS
│   ├── Chapter Executives            /chapters/executives          auth-gated ← EXISTS
│   └── BOG Documents                 /chapters/bog-documents       domain-restricted (@odishasociety.org only)  ← EXISTS
│
├── Publications
│   ├── Urmi — Souvenir               /publications/urmi            public  ← EXISTS
│   ├── Utkarsa — Newsletter          /publications/utkarsa         public  ← EXISTS
│   ├── News                          /news                         public  ← EXISTS
│   ├── Announcements                 /announcements                public  ← EXISTS
│   └── Gallery                       /gallery                      public  ← EXISTS
│
├── Admin                                                           admin-only (role = admin)
│   ├── Manage Members                /admin/members                ← EXISTS
│   ├── Manage Payments               /admin/payments               ← EXISTS
│   ├── Manage Events                 /admin/events                 NEW stub
│   └── Reports                       /admin/reports                NEW stub
│
└── Donate                            /donate                       public, standalone, rightmost  ← EXISTS
```

#### 2.1.1 Programs Menu — Sanity Integration

The `static_page` Sanity schema already has `section` (string) and `sort_order` (number) fields, currently unused beyond a single `about-us` document and a demo page. The Programs menu queries all `static_page` documents where `section == "programs"`, ordered by `sort_order`, and renders each as a submenu link to `/programs/[slug]`. This replaces the hardcoded 12-item "Activities" list with a content-editable list — adding, removing, reordering, or relabeling a Programs page becomes a Sanity Studio operation, not a code change. Existing Activities stub pages (`/activities/*`) and their content will need to be migrated into `static_page` documents (see Phase 1 Analysis for the full mapping and migration plan).

### 2.2 Utility Bar (top-right, alongside primary nav)

| Item | Shown when | Hidden when |
|---|---|---|
| Sign In → `/login` | Unauthenticated | Authenticated |
| Register → `/register` | Unauthenticated | Authenticated |
| `[User name]` → `/profile` | Authenticated | Unauthenticated |
| Dashboard → `/dashboard` | Authenticated | Unauthenticated |
| Sign Out → `/api/auth/signout` | Authenticated | Unauthenticated |

> Admin Panel and Donate have **moved out of the utility bar** into the primary nav (see §2.1) — Admin is now a primary dropdown gated to `role = admin`; Donate is now a standalone primary item, always visible.

---

### 2.1b Original Full Menu Tree (as implemented 2026-05-17, commit `b68dbb3`) — historical reference only

```
OSA [home: /]
│
├── Home                            /                             public
│
├── About Us
│   ├── Vision & Mission            /about/vision-mission         public
│   ├── Constitution & Bylaws       /constitution                 public  ← EXISTS
│   ├── Member Rights & Privileges  /about/member-rights          public
│   ├── OSA Administration          /about/administration         public  (Sanity)
│   ├── OSA Committees              /about/committees             public  (Sanity)
│   ├── Past Leadership             /leadership-program           public  ← EXISTS
│   └── Contact Us                  /about/contact                public
│
├── Members
│   ├── Member Benefits             /members/benefits             public
│   ├── Policy Documents & Forms    /members/policy               auth-gated
│   ├── Member Dashboard            /dashboard                    auth-gated ← EXISTS
│   ├── Member Search               /members/search               auth-gated
│   ├── BOG Meeting Minutes         /members/bog-minutes          auth-gated
│   └── Obituary                    /obituary                     auth-gated
│
├── Chapters
│   ├── Chapter Details             /chapters                     public
│   ├── Chapter Executives          /chapters/executives          auth-gated
│   └── BOG Documents               /chapters/bog-documents       domain-restricted (@odishasociety.org only)
│
├── Activities
│   ├── Events                      /events                       auth-gated ← EXISTS
│   ├── Annual Convention           /activities/convention        public
│   ├── Awards                      /activities/awards            public
│   ├── Odia Learning               /activities/odia-learning     public
│   ├── Odissi Music                /activities/odissi-music      public
│   ├── Odisha Development          /activities/odisha-development public
│   ├── OSA Public Library          /activities/library           public
│   ├── OSA Higher Education        /activities/higher-education  public
│   ├── Professional Networking     /activities/networking        public
│   ├── Health & Wellness           /activities/health-wellness   public
│   ├── Drama Festival              /activities/drama-festival    public
│   ├── Sampark Dori                /activities/sampark-dori      public
│   ├── Nilachakra (Kids)           /activities/nilachakra        public
│   ├── Women's Forum               /activities/womens-forum      public
│   └── Classified                  /activities/classified        public
│
└── Publications
    ├── Urmi — Souvenir             /publications/urmi            public
    ├── Utkarsa — Newsletter        /publications/utkarsa         public
    ├── News                        /news                         public  ← EXISTS
    ├── Announcements               /announcements                public  ← EXISTS
    └── Gallery                     /gallery                      public  ← EXISTS
```

**Original Utility Bar** (superseded by §2.2 above):

| Item | Shown when | Hidden when |
|---|---|---|
| Sign In → `/login` | Unauthenticated | Authenticated |
| Register → `/register` | Unauthenticated | Authenticated |
| `[User name]` (display only) | Authenticated | Unauthenticated |
| Sign Out → `/api/auth/signout` | Authenticated | Unauthenticated |
| Admin Panel → `/admin` | Authenticated + `role = admin` | Everyone else |
| Donate → `/donate` | Always | — |

---

## 3. Requirements

### 3.1 Functional Requirements

> **Note:** FR-01 through FR-17 below describe the **redesigned** structure (§2.1). Requirements that carry over unchanged from the original implementation are marked "← unchanged"; struck-through items reflect the original design that the redesign replaces.

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Nav is rendered in the root `layout.tsx` so it appears on every page | Must Have | ← unchanged |
| FR-02 | ~~Home link is the first item in the main menu bar~~ Logo links to `/` and serves as the home link; no separate "Home" nav item | Must Have | **Changed** — explicit Home link removed |
| FR-03 | All eight primary menus (About Us, Members, Events, Programs, Chapters, Publications, Admin, Donate) and their submenus are present as links | Must Have | **Changed** — was "five content menus"; now eight |
| FR-04 | Public submenu items are visible to unauthenticated users | Must Have | ← unchanged |
| FR-05 | Auth-gated submenu items are hidden (not just disabled) for unauthenticated and suspended users | Must Have | ← unchanged |
| FR-06 | Under Members, unauthenticated and suspended users see only "Member Benefits" | Must Have | ← unchanged (item still present in redesigned Members dropdown) |
| FR-07 | Under Chapters, unauthenticated and suspended users see only "Chapter Details" | Must Have | ← unchanged |
| FR-08 | Under Events, "Events" is hidden from unauthenticated and suspended users | Must Have | **Changed** — was "Activities"; menu renamed/split, rule carries to the new "Events" submenu item |
| FR-09 | BOG Documents is hidden unless the user's email ends with `@odishasociety.org` | Must Have | ← unchanged |
| FR-10 | When unauthenticated or suspended, show Sign In and Register links in the utility bar | Must Have | ← unchanged |
| FR-11 | When authenticated (non-suspended), show user's name (or email if no name), Dashboard, and Sign Out in the utility bar; hide Sign In and Register | Must Have | **Changed** — Dashboard added to utility bar (moved out of Members dropdown) |
| FR-12 | ~~Admin users see an "Admin Panel" link in the utility bar~~ Admin users see an "Admin" primary dropdown menu (Manage Members, Manage Payments, Manage Events, Reports) | Must Have | **Changed** — promoted from utility-bar link to primary dropdown with sub-items |
| FR-13 | Donate is a standalone primary nav item (rightmost), always visible | Must Have | **Changed** — moved from utility bar to primary nav |
| FR-14 | OSA logo links to home (`/`) | Must Have | ← unchanged |
| FR-15 | News, Announcements, Gallery appear as submenus under Publications | Must Have | ← unchanged — all three pages already exist |
| FR-16 | All pages not yet built render a stub ("Coming soon") — no 404s | Must Have | ← unchanged |
| FR-17 | Suspended members are treated as unauthenticated everywhere in the nav | Must Have | ← unchanged — exception: `/dashboard` shows suspension message itself |
| FR-18 | Programs submenu items are fetched from Sanity `static_page` documents where `section == "programs"`, ordered by `sort_order`, rendered as links to `/programs/[slug]` | Must Have | **New** — replaces hardcoded "Activities" list (see §2.1.1) |
| FR-19 | Member Dashboard link moves from the Members dropdown to the utility bar | Must Have | **New** |
| FR-20 | Home page (`/`) gains new sections: current executive info, key upcoming events, news, and contact info — absorbing the content previously planned for the standalone "Contact Us" page | Must Have | **New** — touches `app/page.tsx`, not just nav/layout |

### 3.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Minimal visual distinction | Use `border="1" cellpadding="4"` on tables, `<fieldset>`+`<legend>` for sections, `<hr>` between major sections, nested `<ul>/<li>` for nav | No Tailwind, no inline styles, no CSS files — HTML attributes only |
| NFR-02 | Server component | Nav reads session server-side | No client-side token exposure |
| NFR-03 | Single auth check | One `getSession` + one member lookup in layout; pass user as prop to NavBar | Do not re-fetch per nav item |
| NFR-04 | No broken links | All nav URLs return 200 or a stub | 404s are not acceptable |

---

## 4. Access Control Rules Summary

| User state | Sees in nav |
|---|---|
| Unauthenticated | Public items only (incl. Donate, always visible) + Sign In + Register in utility bar |
| Authenticated + suspended | Same as unauthenticated (treated identically in nav) |
| Authenticated + active/expired/no-membership | Public items + all auth-gated items (except BOG Documents) + user name/Dashboard/Sign Out in utility bar |
| Authenticated + `@odishasociety.org` email | Everything above + BOG Documents |
| Authenticated + `role = admin` | Everything above + **Admin** primary dropdown menu |

> **Changed:** Admin visibility moved from a single utility-bar link to a primary dropdown menu; Donate is now always in the primary bar rather than the utility bar.

---

## 5. Page Inventory

> **2026-06-06:** §§5.1–5.2 below describe the original (2026-05-17) inventory and are preserved for history. **§5.4 is the current inventory** reflecting the redesign — it documents what's already built (most of it, from the original implementation) vs. what's newly required by the restructure.

### 5.1 Pages That Already Existed at Spec Creation (2026-05-16) — historical

| Route | Nav location |
|---|---|
| `/` | Home |
| `/about` | — (About Us landing, not in subnav) |
| `/constitution` | About Us → Constitution & Bylaws |
| `/leadership-program` | About Us → Past Leadership |
| `/dashboard` | Members → Member Dashboard |
| `/events` | Activities → Events |
| `/gallery` | Publications → Gallery |
| `/news` | Publications → News |
| `/announcements` | Publications → Announcements |
| `/login` | Utility bar |
| `/register` | Utility bar |
| `/membership` | — (reached via dashboard or membership gate) |

### 5.2 Pages Created as Stubs by the Original Implementation (2026-05-17, all now exist) — historical

About Us (`/about/vision-mission`, `/about/member-rights`, `/about/administration`, `/about/committees`, `/about/contact`) · Members (`/members/benefits`, `/members/policy`, `/members/search`, `/members/bog-minutes`, `/obituary`) · Chapters (`/chapters`, `/chapters/executives`, `/chapters/bog-documents`) · Activities — 14 pages under `/activities/*` · Publications (`/publications/urmi`, `/publications/utkarsa`) · Utility (`/donate`)

### 5.3 Auth-Gated Stub Pattern (unchanged — still the template for new stubs)
```tsx
// Auth-gated stub template
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/auth/supabase-server'

export default async function SomePage() {
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  return <main><h1>Page Title</h1><p>Coming soon.</p></main>
}
```

Domain-restricted stubs additionally fetch `/api/auth/me` and check `user.email.endsWith('@odishasociety.org')`, returning a 403 message if not.

### 5.4 Current Inventory — Redesign Gap Analysis (2026-06-06)

**Already exists, reused as-is (just relinked/relabeled in the new tree):**
`/about/vision-mission`, `/constitution`, `/about/administration`, `/leadership-program`, `/membership`, `/members/benefits`, `/members/search`, `/profile`, `/obituary`, `/about/member-rights`, `/events`, `/activities/convention`, `/activities/awards`, `/chapters`, `/chapters/executives`, `/chapters/bog-documents`, `/publications/urmi`, `/publications/utkarsa`, `/news`, `/announcements`, `/gallery`, `/admin/members`, `/admin/payments`, `/donate`, `/dashboard`

**New stubs required:**
- `/admin/events` (admin-only — "Manage Events")
- `/admin/reports` (admin-only — "Reports")
- `/about/policy-documents` (route TBD — design phase)
- `/about/forms` (route TBD — design phase)
- `/programs/[slug]` (Sanity-driven dynamic route — see §2.1.1)

**Existing pages/content requiring migration or rework:**
- 12 `/activities/*` Programs-bound stub pages (Odia Learning, Odissi Music, Odisha Development, Library, Higher Education, Networking, Health & Wellness, Drama Festival, Sampark Dori, Nilachakra, Women's Forum, Classified) — content migrates into Sanity `static_page` documents (`section = "programs"`); old `/activities/*` routes likely redirect to `/programs/[slug]`
- `/about/committees` — "OSA Committees" moves from About Us into the Programs Sanity collection (`section = "programs"`)
- `/about/contact` — content absorbed into the home page (§FR-20); standalone route likely removed
- "Upgrade Membership" link target — needs to point at the existing SPEC-21 upgrade UI on `/dashboard` or `/profile` (no dedicated route currently exists)

**Removed from nav (no longer linked, pages may remain or be deleted — design phase decision):**
- `/about/contact` (content moves to home page)
- `/members/policy`, `/members/bog-minutes` (not present in redesigned Members dropdown — superseded by "Policy Documents"/"Forms" under About Us, and no BOG Meeting Minutes item in the new tree)

### 5.3 Auth-Gated Stub Pattern
```tsx
// Auth-gated stub template
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/auth/supabase-server'

export default async function SomePage() {
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  return <main><h1>Page Title</h1><p>Coming soon.</p></main>
}
```

Domain-restricted stubs additionally fetch `/api/auth/me` and check `user.email.endsWith('@odishasociety.org')`, returning a 403 message if not.

---

## 6. Technical Constraints

### 6.1 Approach (unchanged from original — still valid for the redesign)
- `NavBar` is a **server component** in `app/components/nav-bar.tsx` (already exists; will be restructured in place)
- `layout.tsx` resolves the current member once via `getCurrentMember()`, passes `user` to `NavBar`
- `NavBar` receives `user: Member | null` and derives all visibility rules from it
- Suspended check: `user?.memberStatus === 'suspended'` → treat same as `null` for nav purposes
- **New for this revision:** `NavBar`'s Programs submenu additionally needs a Sanity fetch (`static_page` where `section == "programs"`, ordered by `sort_order`) — see §2.1.1 and Phase 1 Analysis for caching/ISR considerations

### 6.2 Files to Create / Modify (redesign — supersedes original §6.2 list, which is now fully built)

```
apps/web/
├── app/
│   ├── page.tsx                               MODIFY — add executive/upcoming-events/news/contact sections (FR-20)
│   ├── components/
│   │   └── nav-bar.tsx                        MODIFY — restructure menu tree to §2.1 (exists from b68dbb3)
│   ├── about/
│   │   ├── policy-documents/page.tsx          CREATE stub (route TBD)
│   │   ├── forms/page.tsx                     CREATE stub (route TBD)
│   │   └── contact/                           REMOVE or repurpose — content moves to home page
│   ├── programs/
│   │   └── [slug]/page.tsx                    CREATE — Sanity-driven dynamic route (§2.1.1)
│   ├── admin/
│   │   ├── events/page.tsx                    CREATE stub (admin-only)
│   │   └── reports/page.tsx                   CREATE stub (admin-only)
│   ├── activities/                            MIGRATE — 12 Programs-bound stubs → Sanity static_page docs;
│   │                                           old routes likely redirect to /programs/[slug] (design-phase decision)
│   └── about/committees/                      MIGRATE — content → Sanity static_page (section="programs")
├── sanity/
│   ├── lib/queries.ts                         MODIFY — add PROGRAMS_BY_SECTION_QUERY (section == "programs", order by sort_order)
│   └── (Studio/CMS)                           SEED — create static_page docs for all 13 Programs items (12 migrated + OSA Committees)
└── middleware.ts                              MODIFY — add /admin/events, /admin/reports to protected matcher
```

> Note: most of the original `app/components/nav-bar.tsx`, `app/layout.tsx`, middleware gating, and ~25 of the ~30 original stub pages are **already built and reused** — this is a restructure of an existing implementation, not a from-scratch build. See Phase 1 Analysis for the full audit.

---

## 7. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should `/activities/convention` redirect to `/events` or be its own page? | Resolved (original) | Separate page — Events is member-gated, Convention is public |
| Should Gallery, News, Announcements appear in nav? | Resolved (original) | Yes — as submenus under Publications |
| Should Register / Sign In be hidden for authenticated users? | Resolved (original) | Yes — replaced by user name + Dashboard + Sign Out (utility bar) |
| Should suspended members see auth-gated menu items? | Resolved (original) | No — treated as unauthenticated in nav. Exception: `/dashboard` handles suspension message itself |
| What routes should "Policy Documents" and "Forms" use under About Us? | Resolved (Phase 2) | `/about/policy-documents` and `/about/forms` — public stubs, follow `/about/*` sibling convention |
| What should "Upgrade Membership" link to? | Resolved (Phase 2) | `/dashboard` — the SPEC-21 upgrade UI is already visible there; anchor-scroll would be scope creep into SPEC-21 |
| Should old `/activities/*` routes redirect to `/programs/[slug]`, or be removed once content migrates to Sanity? | Resolved (Phase 2) | Redirect via `next.config.ts` `redirects()` — 1:1 slug mapping, satisfies NFR-04 (no broken links) |
| Should `/about/contact` and `/about/committees` routes be deleted once their content migrates (to home page / Programs respectively)? | Resolved (Phase 2) | Redirect: `/about/contact` → `/`, `/about/committees` → `/programs/osa-committees` |
| Should `/members/policy` and `/members/bog-minutes` (built but no longer linked in the new Members dropdown) be deleted, repurposed, or kept dormant? | Resolved (Phase 2) | Leave in place, unlinked — functional and harmless; deleting/redirecting adds risk for no functional gain |

---

## 8. References

- [`apps/web/app/components/nav-bar.tsx`](../../apps/web/app/components/nav-bar.tsx) — existing NavBar to restructure (built in `b68dbb3`)
- [`apps/web/app/layout.tsx`](../../apps/web/app/layout.tsx) — root layout (already wires NavBar via `getCurrentMember()`)
- [`apps/web/app/page.tsx`](../../apps/web/app/page.tsx) — home page to extend with new sections (FR-20)
- [`apps/web/middleware.ts`](../../apps/web/middleware.ts) — auth gate list to extend
- [`apps/web/lib/auth/get-current-member.ts`](../../apps/web/lib/auth/get-current-member.ts) — session/member resolution helper used by layout
- [`apps/web/app/api/auth/signout/route.ts`](../../apps/web/app/api/auth/signout/route.ts) — Sign Out endpoint
- [`apps/web/sanity/schemas/static-page.ts`](../../apps/web/sanity/schemas/static-page.ts) — `static_page` schema (`section`, `sort_order` fields drive Programs menu)
- [`apps/web/sanity/lib/queries.ts`](../../apps/web/sanity/lib/queries.ts) — `STATIC_PAGE_BY_SLUG_QUERY`/`ABOUT_PAGE_QUERY` — existing patterns to follow for `PROGRAMS_BY_SECTION_QUERY`
- Commit `b68dbb3` — original SPEC-15 implementation (NavBar, 30 stub pages, middleware, visual sweep)

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation. The original implementation (commit `b68dbb3`, 2026-05-17) shipped without these phases being tracked — this section now tracks the **2026-06-06 redesign** as a continuation of the same spec.

### Phase 1: Analysis
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-15/01-analysis.md`

### Phase 2: Design
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-15/02-design.md`

### Phase 3: Implementation
- **Status:** Complete (2026-06-07)
- **Artifact:** `specs/artifacts/SPEC-15/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Complete (2026-06-07)
- **Artifact:** `specs/artifacts/SPEC-15/04-qa-report.md`
