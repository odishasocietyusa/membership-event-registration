# SPEC-13 Admin Panel — Phase 1 Analysis

**Spec:** `specs/active/SPEC-13-admin-panel.md`
**Date:** 2026-05-16
**Status:** Complete

---

## 1. Requirement Validation

| FR ID | Requirement | Status | Notes |
|-------|-------------|--------|-------|
| FR-01 | Members list with all fields | Achievable | `GET /api/members` returns all required fields |
| FR-02 | Search by name/email | **Gap** | No `search` param on `GET /api/members` — needs adding |
| FR-03 | Filter by memberStatus | **Gap** | No `status` param on `GET /api/members` — needs adding |
| FR-04 | Member detail page | Achievable | `GET /api/members/[id]` returns `{ member, familyMembers }` |
| FR-05 | Personal info + family + payment history | Achievable (2 calls) | Second call: `GET /api/payments?memberId=<id>` |
| FR-06 | Role change | Achievable | `PUT /api/members/[id]/role` exists, admin-guarded |
| FR-07 | Set membership status | **Nuance** | Use `PUT /api/memberships/[id]/status` not `PUT /api/members/[id]` — the members route only allows `active/suspended`, not `expired` |
| FR-08 | Payments list | Achievable | `GET /api/payments` exists; **Gap**: member name not joined |
| FR-09 | Issue refund | Achievable | `POST /api/payments/[id]/refund` exists, needs `refundAmountCents` + `refundReason` |
| FR-10 | Non-admin redirected to `/dashboard` | Achievable | Server-side role check in every page |
| FR-11 | Unauthenticated redirected to `/login` | Already handled | Middleware already protects `/admin` |

---

## 2. API Inventory

| Route | Method | Role | Response |
|-------|--------|------|----------|
| `/api/auth/me` | GET | any auth | `{ user: Member }` — used for role gate |
| `/api/members` | GET | admin | `{ data: Member[], total, page, limit }` |
| `/api/members/[id]` | GET | admin | `{ member, familyMembers }` |
| `/api/members/[id]/role` | PUT | admin | `{ member }` — body: `{ role }` |
| `/api/memberships/[id]/status` | PUT | admin | `{ membership }` — body: `{ status }` |
| `/api/memberships/[id]/approve` | POST | admin | `{ membership }` |
| `/api/memberships/[id]` | DELETE | admin | cancels membership |
| `/api/payments` | GET | admin | `{ data: PaymentRecord[], total, page, limit }` |
| `/api/payments/[id]/refund` | POST | admin | `{ payment }` — body: `{ refundAmountCents, refundReason }` |

---

## 3. Auth Pattern (copy from dashboard/page.tsx)

```typescript
const supabase = await createSupabaseServer()
const { data: { session } } = await supabase.auth.getSession()
if (!session) redirect('/login')

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
const headers = { Authorization: `Bearer ${session.access_token}` }

const { user } = await fetch(`${baseUrl}/api/auth/me`, { headers, cache: 'no-store' }).then(r => r.json())
if (user?.role !== 'admin') redirect('/dashboard')
```

---

## 4. Gaps and Required Additions

### Gap 1 — Add `search` + `status` to `GET /api/members`
Files: `lib/validation/member.schema.ts`, `lib/members/member-service.ts`, `app/api/members/route.ts`

### Gap 2 — Add member name join to `GET /api/payments`
File: `app/api/payments/route.ts` — add `include: { member: { select: { fullName: true, email: true } } }`

### Gap 3 — No separate `activate` shortcut needed
`PUT /api/memberships/[id]/status` with `{ status: 'active' }` is sufficient. Skip the proposed `POST /api/admin/members/[id]/activate`.

### Gap 4 — memberStatus null states
- `memberStatus=null, membershipType≠null` → display **"Pending"**
- `memberStatus=null, membershipType=null` → display **"No membership"**
- `memberStatus='active'` → **"Active"**
- `memberStatus='expired'` → **"Expired"**
- `memberStatus='suspended'` → **"Suspended"**

### Gap 5 — Refund form needs two fields
`POST /api/payments/[id]/refund` requires `refundAmountCents` (pre-fill with original amount) and `refundReason` (non-empty string). Not a one-click action.

---

## 5. Membership Status Mutations

| Action | Route | Body |
|--------|-------|------|
| Approve pending | `POST /api/memberships/[id]/approve` | `{}` |
| Activate (override) | `PUT /api/memberships/[id]/status` | `{ status: 'active' }` |
| Expire | `PUT /api/memberships/[id]/status` | `{ status: 'expired' }` |
| Suspend | `PUT /api/memberships/[id]/status` | `{ status: 'suspended' }` |
| Cancel | `DELETE /api/memberships/[id]` | — |

---

## 6. Files to Create/Modify

| Change | Files |
|--------|-------|
| Add search+status to members API | `lib/validation/member.schema.ts`, `lib/members/member-service.ts`, `app/api/members/route.ts` |
| Add member name to payments API | `app/api/payments/route.ts` |
| Admin layout | `app/admin/layout.tsx` |
| Members list page | `app/admin/page.tsx` |
| Member detail page | `app/admin/members/[id]/page.tsx` |
| Payments list page | `app/admin/payments/page.tsx` |
