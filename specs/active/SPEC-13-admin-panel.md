# Feature Specification: Admin Panel

> **Spec ID:** SPEC-13
> **Status:** In Analysis
> **Author:** Utkal Nayak
> **Created:** 2026-05-16

---

## 1. Overview

### 1.1 Summary
Build a server-rendered admin panel at `/admin` that allows OSA administrators to view and manage members, review payment history, and perform administrative actions such as role changes and manual membership activation. The panel is protected so only users with `role = 'admin'` can access it. No CSS styling — bare functional HTML only (consistent with Phase 3 UI constraint).

### 1.2 Goals
- [ ] Give admins a single place to view all members and their membership status
- [ ] Allow admins to manually activate, expire, or cancel a membership
- [ ] Allow admins to promote/demote member roles
- [ ] Allow admins to view all payment records and issue refunds
- [ ] Protect all admin routes so non-admins get a 403 or redirect

### 1.3 Non-Goals
- CSS styling or visual design (deferred to Figma phase)
- Event management (separate spec)
- Content / CMS management (separate spec)
- Bulk CSV export (future spec)
- Audit log viewer (future spec)
- Email / messaging from admin panel (separate spec)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | `/admin` lists all members with name, email, **member ID**, role, membership type, status, join date | Must Have | Paginated if >50 rows |
| FR-02 | Members list is searchable by name or email | Must Have | Client or server search |
| FR-03 | Members list is filterable by membership status (active / pending / expired / cancelled) | Must Have | |
| FR-04 | Clicking a member opens `/admin/members/[id]` with full profile details | Must Have | |
| FR-05 | Member detail shows personal info, family members, and payment history | Must Have | |
| FR-06 | Admin can change a member's role (member ↔ admin) from the detail page | Must Have | Uses existing `PUT /api/members/[id]/role` |
| FR-07 | Admin can manually set membership status (activate / expire / cancel) | Must Have | Uses existing `PUT /api/members/[id]` |
| FR-08 | `/admin/payments` lists all payment records with member name, **member ID**, **email**, amount, type, date, status | Must Have | Member ID and email must be visible on every admin page that lists or links members |
| FR-09 | Admin can issue a refund from the payment detail view | Should Have | Uses existing `POST /api/payments/[id]/refund` |
| FR-10 | Non-admin users attempting to access `/admin/*` are redirected to `/dashboard` | Must Have | |
| FR-11 | Unauthenticated users attempting to access `/admin/*` are redirected to `/login` | Must Have | |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Security | Admin role enforced server-side on every page load | Never rely solely on middleware |
| NFR-02 | No styling | Bare HTML only | Per project Phase 3 constraint |
| NFR-03 | Server components | Pages fetch data server-side | Avoids client-side token exposure |
| NFR-04 | Consistent base URL | Use `VERCEL_URL` fallback pattern | Same as dashboard and stripe.ts |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] All FR-01 through FR-11 implemented
- [ ] Admin role check on every `/admin/*` page (server-side, not just middleware)
- [ ] All existing API routes used — no duplicate data-fetching logic
- [ ] Build passes (`pnpm build --filter=web`)
- [ ] No TypeScript errors

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Admin access | Logged-in user with `role=admin` | Visits `/admin` | Members list renders |
| Member blocked | Logged-in user with `role=member` | Visits `/admin` | Redirected to `/dashboard` |
| Unauthenticated blocked | No session | Visits `/admin` | Redirected to `/login` |
| View member detail | Admin on members list | Clicks a member row | `/admin/members/[id]` shows full profile |
| Activate membership | Admin on member detail, member is pending | Clicks "Activate" | Status changes to active, page refreshes |
| Change role | Admin on member detail | Changes role to admin and submits | Member gains admin role |
| View payments | Admin visits `/admin/payments` | Page loads | All payment records listed with amounts |
| Issue refund | Admin on payment detail, status=completed | Clicks "Refund" | Refund issued via Stripe, status updated |
| Member has no membership | Admin views a member with no payment | Membership section | Shows "No membership on file" |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Next.js App Router server components, existing API routes, TypeScript
- **Must Avoid:** No new database queries in page components — use existing API routes via server-side fetch; no CSS/Tailwind

### 4.2 Patterns to Follow
- Same `VERCEL_URL` fallback for `baseUrl` as `dashboard/page.tsx`
- Same server-side session check pattern as `dashboard/page.tsx` using `createSupabaseServer()`
- Admin role check: after verifying session, fetch `/api/auth/me` and check `user.role === 'admin'`; if not, `redirect('/dashboard')`
- Actions (activate, change role, refund) use HTML `<form>` with `method="POST"` pointing to Next.js Server Actions or a dedicated API route — no client-side JS required
- Follow existing route handler pattern: `withAuth` + role guard in API routes

### 4.3 Pages / Files to Create

```
apps/web/app/admin/
├── layout.tsx               # Shared admin layout with nav links
├── page.tsx                 # Members list (/admin)
├── members/
│   └── [id]/
│       └── page.tsx         # Member detail (/admin/members/[id])
└── payments/
    └── page.tsx             # Payments list (/admin/payments)

apps/web/app/api/admin/
└── members/
    └── [id]/
        └── activate/
            └── route.ts     # POST — shortcut to set memberStatus=active
```

### 4.4 Existing API Routes to Use (Do Not Modify)

| Route | Usage |
|-------|-------|
| `GET /api/members` | Members list with optional `?status=` filter |
| `GET /api/members/[id]` | Member detail + family |
| `PUT /api/members/[id]/role` | Change role |
| `PUT /api/members/[id]` | Update member (used to change status) |
| `GET /api/payments` | All payment records |
| `POST /api/payments/[id]/refund` | Issue refund |

### 4.5 Middleware Update
Add `/admin` to the protected path list in `middleware.ts` so unauthenticated users are redirected to `/login` before the page even loads.

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- SPEC-12 complete (dashboard, session cookies, auth callback) ✅

### 5.2 Downstream Impact
- Admin panel is a prerequisite for onboarding real OSA members (admins need to approve/manage memberships)
- Role promotion via admin panel enables future admin-only features

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should pending memberships require admin approval before activation, or is payment sufficient? | Resolved | Payment is sufficient for auto-activation; manual activation via admin panel is for edge cases (e.g. honorary, comp memberships) |
| Pagination — server-side or client-side? | Open | Decide during design phase based on expected member count |
| Should refund action require a confirmation step? | Open | Decide during design phase |

---

## 7. References

- [`docs/admin-operations-manual.md`](../../docs/admin-operations-manual.md) — admin operations reference
- [`apps/web/app/dashboard/page.tsx`](../../apps/web/app/dashboard/page.tsx) — pattern to follow for server-side auth + fetch
- [`apps/web/app/api/members/route.ts`](../../apps/web/app/api/members/route.ts) — members list API
- [`apps/web/app/api/payments/route.ts`](../../apps/web/app/api/payments/route.ts) — payments list API

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation

### Phase 1: Analysis
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-13/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-13/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-13/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-13/04-qa-report.md`
