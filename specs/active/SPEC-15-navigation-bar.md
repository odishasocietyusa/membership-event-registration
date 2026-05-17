# Feature Specification: Navigation Bar

> **Spec ID:** SPEC-15
> **Status:** Draft
> **Author:** Utkal Nayak
> **Created:** 2026-05-16

---

## 1. Overview

### 1.1 Summary
Implement a global navigation bar rendered on every page via the root layout. The nav contains six main menus (Home + five content menus) with submenus, utility links (Sign In / Register / Donate or Sign Out when authenticated), and an Admin Panel link for admins. Menu items render conditionally based on authentication state, membership status, and email domain. Suspended members are treated the same as unauthenticated users everywhere except `/dashboard`. No CSS styling — bare functional HTML only.

### 1.2 Goals
- [ ] Every page has a consistent top navigation without duplicating auth logic
- [ ] Unauthenticated and suspended users see only public items
- [ ] Authenticated active members see the full menu
- [ ] Admin users see an additional Admin Panel link
- [ ] BOG Documents visible only to `@odishasociety.org` email addresses
- [ ] Sign In / Register replaced by user name + Sign Out when authenticated

### 1.3 Non-Goals
- CSS styling, dropdowns, hover effects (deferred to Figma phase — plain links only for now)
- Mobile hamburger menu (deferred to Figma phase)
- Notification badges or unread message counts (future spec)
- Building the content of stub pages (nav links to stubs are fine for this spec)

---

## 2. Navigation Structure

### 2.1 Full Menu Tree

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

### 2.2 Utility Bar (always at top level alongside main menus)

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

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Nav is rendered in the root `layout.tsx` so it appears on every page | Must Have | |
| FR-02 | Home link is the first item in the main menu bar | Must Have | |
| FR-03 | All five content menus and their submenus are present as links | Must Have | |
| FR-04 | Public submenu items are visible to unauthenticated users | Must Have | |
| FR-05 | Auth-gated submenu items are hidden (not just disabled) for unauthenticated and suspended users | Must Have | |
| FR-06 | Under Members, unauthenticated and suspended users see only "Member Benefits" | Must Have | |
| FR-07 | Under Chapters, unauthenticated and suspended users see only "Chapter Details" | Must Have | |
| FR-08 | Under Activities, "Events" is hidden from unauthenticated and suspended users | Must Have | Events page is member-gated |
| FR-09 | BOG Documents is hidden unless the user's email ends with `@odishasociety.org` | Must Have | |
| FR-10 | When unauthenticated or suspended, show Sign In and Register links | Must Have | |
| FR-11 | When authenticated (non-suspended), show user's name (or email if no name) and Sign Out; hide Sign In and Register | Must Have | |
| FR-12 | Admin users see an "Admin Panel" link in the utility bar | Must Have | |
| FR-13 | Donate link is always visible | Must Have | |
| FR-14 | OSA name/logo links to home (`/`) | Must Have | |
| FR-15 | News, Announcements, Gallery appear as submenus under Publications | Must Have | All three pages already exist |
| FR-16 | All pages not yet built render a stub ("Coming soon") — no 404s | Must Have | |
| FR-17 | Suspended members are treated as unauthenticated everywhere in the nav | Must Have | Exception: `/dashboard` page itself shows suspension message (handled by the page, not nav) |

### 3.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | No styling | Bare HTML only | Per project Phase 3 constraint |
| NFR-02 | Server component | Nav reads session server-side | No client-side token exposure |
| NFR-03 | Single auth check | One `getSession` + one member lookup in layout; pass user as prop to NavBar | Do not re-fetch per nav item |
| NFR-04 | No broken links | All nav URLs return 200 or a stub | 404s are not acceptable |

---

## 4. Access Control Rules Summary

| User state | Sees in nav |
|---|---|
| Unauthenticated | Public items only + Sign In + Register + Donate |
| Authenticated + suspended | Same as unauthenticated (treated identically in nav) |
| Authenticated + active/expired/no-membership | Public items + all auth-gated items (except BOG Documents) + user menu + Donate |
| Authenticated + `@odishasociety.org` email | Everything above + BOG Documents |
| Authenticated + `role = admin` | Everything above + Admin Panel |

---

## 5. Page Inventory

### 5.1 Pages That Already Exist

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

### 5.2 Pages to Create as Stubs

**About Us:**
- `/about/vision-mission`
- `/about/member-rights`
- `/about/administration`
- `/about/committees`
- `/about/contact`

**Members:**
- `/members/benefits` (public)
- `/members/policy` (auth-gated)
- `/members/search` (auth-gated)
- `/members/bog-minutes` (auth-gated)
- `/obituary` (auth-gated)

**Chapters:**
- `/chapters` (public)
- `/chapters/executives` (auth-gated)
- `/chapters/bog-documents` (domain-restricted)

**Activities (all public except Events which exists):**
- `/activities/convention`
- `/activities/awards`
- `/activities/odia-learning`
- `/activities/odissi-music`
- `/activities/odisha-development`
- `/activities/library`
- `/activities/higher-education`
- `/activities/networking`
- `/activities/health-wellness`
- `/activities/drama-festival`
- `/activities/sampark-dori`
- `/activities/nilachakra`
- `/activities/womens-forum`
- `/activities/classified`

**Publications:**
- `/publications/urmi`
- `/publications/utkarsa`

**Utility:**
- `/donate`

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

### 6.1 Approach
- `NavBar` is a **server component** in `app/components/nav-bar.tsx`
- `layout.tsx` calls `createSupabaseServer()` + `fetch('/api/auth/me')` once, passes `user` to `NavBar`
- `NavBar` receives `user: MemberRow | null` and derives all visibility rules from it
- Suspended check: `user?.memberStatus === 'suspended'` → treat same as `null` for nav purposes

### 6.2 Files to Create / Modify

```
apps/web/
├── app/
│   ├── layout.tsx                            MODIFY — fetch session + user, render NavBar
│   ├── components/
│   │   └── nav-bar.tsx                       CREATE — NavBar server component
│   ├── about/
│   │   ├── vision-mission/page.tsx           CREATE stub
│   │   ├── member-rights/page.tsx            CREATE stub
│   │   ├── administration/page.tsx           CREATE stub
│   │   ├── committees/page.tsx               CREATE stub
│   │   └── contact/page.tsx                  CREATE stub
│   ├── members/
│   │   ├── benefits/page.tsx                 CREATE stub (public)
│   │   ├── policy/page.tsx                   CREATE stub (auth-gated)
│   │   ├── search/page.tsx                   CREATE stub (auth-gated)
│   │   └── bog-minutes/page.tsx              CREATE stub (auth-gated)
│   ├── obituary/
│   │   └── page.tsx                          CREATE stub (auth-gated)
│   ├── chapters/
│   │   ├── page.tsx                          CREATE stub (public)
│   │   ├── executives/page.tsx               CREATE stub (auth-gated)
│   │   └── bog-documents/page.tsx            CREATE stub (domain-restricted)
│   ├── activities/
│   │   ├── convention/page.tsx               CREATE stub (public)
│   │   ├── awards/page.tsx                   CREATE stub (public)
│   │   ├── odia-learning/page.tsx            CREATE stub
│   │   ├── odissi-music/page.tsx             CREATE stub
│   │   ├── odisha-development/page.tsx       CREATE stub
│   │   ├── library/page.tsx                  CREATE stub
│   │   ├── higher-education/page.tsx         CREATE stub
│   │   ├── networking/page.tsx               CREATE stub
│   │   ├── health-wellness/page.tsx          CREATE stub
│   │   ├── drama-festival/page.tsx           CREATE stub
│   │   ├── sampark-dori/page.tsx             CREATE stub
│   │   ├── nilachakra/page.tsx               CREATE stub
│   │   ├── womens-forum/page.tsx             CREATE stub
│   │   └── classified/page.tsx               CREATE stub
│   ├── publications/
│   │   ├── urmi/page.tsx                     CREATE stub
│   │   └── utkarsa/page.tsx                  CREATE stub
│   └── donate/
│       └── page.tsx                          CREATE stub
└── middleware.ts                              MODIFY — add new auth-gated routes
```

---

## 7. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should `/activities/convention` redirect to `/events` or be its own page? | Resolved | Separate page — Events is member-gated, Convention is public |
| Should Gallery, News, Announcements appear in nav? | Resolved | Yes — as submenus under Publications |
| Should Register / Sign In be hidden for authenticated users? | Resolved | Yes — replaced entirely by user name + Sign Out |
| Should suspended members see auth-gated menu items? | Resolved | No — treated as unauthenticated in nav. Exception: `/dashboard` page handles suspension message itself |

---

## 8. References

- [`apps/web/app/layout.tsx`](../../apps/web/app/layout.tsx) — root layout to modify
- [`apps/web/middleware.ts`](../../apps/web/middleware.ts) — auth gate list to extend
- [`apps/web/lib/auth/supabase-server.ts`](../../apps/web/lib/auth/supabase-server.ts) — session helper
- [`apps/web/app/api/auth/signout/route.ts`](../../apps/web/app/api/auth/signout/route.ts) — Sign Out endpoint

---

## Agent Workflow Tracking

### Phase 1: Analysis
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-15/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-15/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-15/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-15/04-qa-report.md`
