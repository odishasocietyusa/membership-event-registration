# Feature Specification: Navigation Bar

> **Spec ID:** SPEC-15
> **Status:** Draft
> **Author:** Utkal Nayak
> **Created:** 2026-05-16

---

## 1. Overview

### 1.1 Summary
Implement a global navigation bar rendered on every page via the root layout. The nav contains five main menus with submenus, three utility links (Sign In / Register / Donate), and a user menu shown to authenticated users. Menu items and submenus render conditionally based on authentication state, membership status, and email domain. No CSS styling — bare functional HTML only.

### 1.2 Goals
- [ ] Every page has a consistent top navigation without duplicating auth logic
- [ ] Unauthenticated users see only public items; auth-gated items are hidden
- [ ] Authenticated active members see the full menu
- [ ] Admin users see an additional Admin Panel link
- [ ] BOG Documents visible only to `@odishasociety.org` email addresses
- [ ] Sign In replaced by user name + Sign Out when authenticated

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
├── About Us
│   ├── Vision & Mission            /about/vision-mission         public
│   ├── Constitution & Bylaws       /constitution                 public  ← EXISTS
│   ├── Member Rights & Privileges  /about/member-rights          public
│   ├── OSA Administration          /about/administration         public  (Sanity)
│   ├── OSA Committees              /about/committees             public  (Sanity)
│   ├── Past Leadership             /leadership-program           public  ← EXISTS
│   └── Contact Us                  /about/contact               public
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
│   └── BOG Documents               /chapters/bog-documents       domain-restricted (@odishasociety.org)
│
├── Activities
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
    └── Utkarsa — Newsletter        /publications/utkarsa         public
```

### 2.2 Utility Bar (always visible at top level)

| Item | Authenticated (any status) | Unauthenticated |
|---|---|---|
| Sign In | Hidden | Shown → `/login` |
| Register | Hidden | Shown → `/register` |
| Sign Out | Shown (in user menu) | Hidden |
| User name / email | Shown (in user menu) | Hidden |
| Admin Panel | Shown for `role = admin` only → `/admin` | Hidden |
| Donate | Always shown → `/donate` | Always shown |

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Nav is rendered in the root `layout.tsx` so it appears on every page | Must Have | |
| FR-02 | All five main menus and their submenus are present as links | Must Have | |
| FR-03 | Public submenu items are visible to unauthenticated users | Must Have | |
| FR-04 | Auth-gated submenu items are hidden (not just disabled) for unauthenticated users | Must Have | |
| FR-05 | Under Members, unauthenticated users see only "Member Benefits" | Must Have | |
| FR-06 | Under Chapters, unauthenticated users see only "Chapter Details" | Must Have | |
| FR-07 | BOG Documents (`/chapters/bog-documents`) is hidden unless the user's email ends with `@odishasociety.org` | Must Have | |
| FR-08 | When unauthenticated, show Sign In and Register links | Must Have | |
| FR-09 | When authenticated, show user's name (or email if no name) and a Sign Out link; hide Sign In and Register | Must Have | |
| FR-10 | Admin users see an "Admin Panel" link | Must Have | |
| FR-11 | Donate link is always visible | Must Have | |
| FR-12 | OSA name/logo in nav links to home (`/`) | Must Have | |
| FR-13 | All pages not yet built render a stub ("Coming soon") — nav links are live | Should Have | Prevents 404s |
| FR-14 | Active nav item (current page) is visually indicated | Nice to Have | Can be plain `[current]` text for now |

### 3.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | No styling | Bare HTML only | Per project Phase 3 constraint |
| NFR-02 | Server component | Nav reads session server-side | No client-side token exposure |
| NFR-03 | Single auth check | One `getSession` call in layout; pass user state as props | Do not re-fetch session per nav item |
| NFR-04 | No broken links | All nav URLs return 200 or a stub page | 404s are not acceptable |

---

## 4. Access Control Rules Summary

| Access level | Condition | Sees |
|---|---|---|
| Public | Anyone | All public items + Sign In + Register + Donate |
| Authenticated — any status | Valid session | Public items + auth-gated items (except domain-restricted) + user menu + Donate |
| Authenticated — `@odishasociety.org` email | Valid session + email domain | Everything above + BOG Documents |
| Admin | `role = admin` | Everything above + Admin Panel link |
| Unauthenticated | No session | Public items only + Sign In + Register + Donate |

---

## 5. Page Inventory

### 5.1 Pages That Already Exist

| Route | Status |
|---|---|
| `/` | ✅ Implemented |
| `/about` | ✅ Implemented (Sanity) |
| `/constitution` | ✅ Implemented (MDX) — maps to "Constitution & Bylaws" |
| `/leadership-program` | ✅ Implemented (Sanity) — maps to "Past Leadership" |
| `/dashboard` | ✅ Implemented |
| `/events` | ✅ Implemented (Sanity, auth-gated) — maps to "Annual Convention" |
| `/gallery` | ✅ Implemented (Sanity) |
| `/news` | ✅ Implemented (Sanity) |
| `/announcements` | ✅ Implemented (Sanity) |
| `/login` | ✅ Implemented |
| `/register` | ✅ Implemented |
| `/membership` | ✅ Implemented |

### 5.2 Pages That Need Stubs (render "Coming soon" for now)

All other routes in the nav tree. Stub pages are one-file server components with a heading and "Coming soon" paragraph. They are created so no nav link 404s.

**About Us stubs:**
- `/about/vision-mission`
- `/about/member-rights`
- `/about/administration`
- `/about/committees`
- `/about/contact`

**Members stubs:**
- `/members/benefits`
- `/members/policy`
- `/members/search`
- `/members/bog-minutes`
- `/obituary`

**Chapters stubs:**
- `/chapters`
- `/chapters/executives`
- `/chapters/bog-documents`

**Activities stubs (14 pages):**
- `/activities/convention` — redirect to `/events` (already built)
- `/activities/awards`, `/activities/odia-learning`, `/activities/odissi-music`
- `/activities/odisha-development`, `/activities/library`, `/activities/higher-education`
- `/activities/networking`, `/activities/health-wellness`, `/activities/drama-festival`
- `/activities/sampark-dori`, `/activities/nilachakra`, `/activities/womens-forum`
- `/activities/classified`

**Publications stubs:**
- `/publications/urmi`
- `/publications/utkarsa`

### 5.3 Pages Suggested to Add (not in original requirements)

| Suggestion | Rationale |
|---|---|
| `/donate` | Donate link in nav has no destination page yet |
| `/gallery` link under Activities or Publications | Gallery exists but has no nav entry — worth surfacing |
| `/news` link under Publications | News exists but has no nav entry |
| `/announcements` link under About Us or Members | Exists but has no nav entry |

---

## 6. Technical Constraints

### 6.1 Approach
- Nav is a **server component** (`NavBar`) rendered inside `apps/web/app/layout.tsx`
- Session is read once in `layout.tsx` via `createSupabaseServer()` and passed as props to `NavBar`
- `NavBar` receives `{ user: MemberRow | null }` and renders conditionally
- No `usePathname` hook or client-side JS required for this phase (styling deferred)

### 6.2 Files to Create / Modify

```
apps/web/
├── app/
│   ├── layout.tsx                          MODIFY — add NavBar, pass session user
│   ├── components/
│   │   └── nav-bar.tsx                     CREATE — NavBar server component
│   ├── about/
│   │   ├── vision-mission/page.tsx         CREATE stub
│   │   ├── member-rights/page.tsx          CREATE stub
│   │   ├── administration/page.tsx         CREATE stub
│   │   ├── committees/page.tsx             CREATE stub
│   │   └── contact/page.tsx               CREATE stub
│   ├── members/
│   │   ├── benefits/page.tsx              CREATE stub
│   │   ├── policy/page.tsx               CREATE stub (auth-gated)
│   │   ├── search/page.tsx               CREATE stub (auth-gated)
│   │   └── bog-minutes/page.tsx          CREATE stub (auth-gated)
│   ├── obituary/
│   │   └── page.tsx                       CREATE stub (auth-gated)
│   ├── chapters/
│   │   ├── page.tsx                       CREATE stub
│   │   ├── executives/page.tsx           CREATE stub (auth-gated)
│   │   └── bog-documents/page.tsx        CREATE stub (domain-restricted)
│   ├── activities/
│   │   ├── convention/page.tsx           CREATE — redirect to /events
│   │   ├── awards/page.tsx              CREATE stub
│   │   └── [12 more stubs...]
│   ├── publications/
│   │   ├── urmi/page.tsx                CREATE stub
│   │   └── utkarsa/page.tsx             CREATE stub
│   └── donate/
│       └── page.tsx                      CREATE stub
```

### 6.3 Auth-Gated Stub Pattern
Auth-gated stubs redirect unauthenticated users to `/login` using the same server-side session check pattern as the dashboard. Domain-restricted stubs additionally check `user.email.endsWith('@odishasociety.org')`.

---

## 7. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should `/activities/convention` redirect to `/events` or be its own page? | Open | |
| Should `/gallery`, `/news`, `/announcements` appear anywhere in the nav? | Open | Suggested under Publications and About Us respectively |
| Should "Register" link be hidden for authenticated users who have already registered? | Open | |
| Should suspended members see auth-gated menu items or be treated like unauthenticated? | Open | |

---

## 8. References

- [`apps/web/app/layout.tsx`](../../apps/web/app/layout.tsx) — root layout to modify
- [`apps/web/middleware.ts`](../../apps/web/middleware.ts) — current auth gate list (will need updating as new auth-gated routes are added)
- [`apps/web/lib/auth/supabase-server.ts`](../../apps/web/lib/auth/supabase-server.ts) — session helper

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
