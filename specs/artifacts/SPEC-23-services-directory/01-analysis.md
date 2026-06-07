# SPEC-23 — Phase 1: Analysis

**Spec:** Services Directory & Discrete Messaging
**Analyst:** Claude Code
**Date:** 2026-06-07
**Status:** Complete

---

## Naming Adaptations (from original spec)

| Original (spec) | Adopted |
|-----------------|---------|
| `/teachers` | `/services` |
| "Teacher Directory" | "Services" |
| `TeacherProfile` | `ServiceProvider` |
| `TeacherContactLog` | `ServiceContactLog` |
| Nav label "Teacher Directory" | "Services" (first item under Programs) |

---

## Codebase Findings

### Auth
- `withAuth(handler, { role? })` in `lib/auth/with-auth.ts` — Bearer token, validates Supabase session, resolves Member row including `memberStatus`. Used for all protected API routes.
- `getCurrentMember()` in `lib/auth/get-current-member.ts` — server-component equivalent, reads session via cookie.
- Both are established patterns; SPEC-23 uses both (server pages + API routes).

### Email (Resend)
- `resend ^4.0.0` already installed.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` configured in `.env.local`.
- `lib/messaging/resend.ts` exports `sendRelayEmail(input)` — sends a server-mediated relay email via Resend. Reusable for service contact with a new function specific to the services context (different body template).

### Rate Limiting
- No existing rate-limiting infrastructure in the codebase.
- Will implement via a Prisma count query on `ServiceContactLog`:
  ```ts
  const recentCount = await prisma.serviceContactLog.count({
    where: { senderMemberId: ctx.user.id, sentAt: { gte: new Date(Date.now() - 3_600_000) } }
  })
  if (recentCount >= 5) return 429
  ```
- Simple and correct; no Redis or middleware needed.

### Nav Bar
- `app/components/nav-bar.tsx` — Programs submenu currently renders Sanity-driven program links dynamically.
- "Services" must be inserted as the **first** static `<li>` before the Sanity-driven `programs.map(...)` loop (line 74).

### Privacy constraint (NFR-01)
- `ServiceProvider.email` is the routing address for Resend — it must **never** appear in any API response body or `select` statement that reaches the client.
- All Prisma `findMany` / `findUnique` calls for listings must explicitly omit `email` from `select`.
- The contact API route reads `email` server-side only, passes it directly to Resend, never serialises it to JSON.

### OSA Member Badge
- `ServiceProvider` has optional `memberId` FK to `Member`.
- Badge logic: `memberId !== null && member.memberStatus === 'active'`.
- Resolved via a Prisma join (`include: { member: { select: { memberStatus: true } } }`) — no email comparison needed.

---

## Open Questions

| ID | Question | Resolution |
|----|----------|------------|
| OQ-1 | Profile picture — custom upload or initials? | Initials avatar (derived from `fullName`). No photo upload in this spec. |
| OQ-2 | Can non-members register as service providers? | OSA members only. Registration requires active session; `memberId` is always set. |
| OQ-3 | **Styling** — spec NFR-03 calls for "beautiful modern cards" but a global project constraint requires unstyled functional stubs until Figma is delivered. Which takes precedence? | **Needs user decision before Phase 2.** |
| OQ-4 | Social/web link field — one URL or multiple? | One `websiteUrl` field (per spec model). Sufficient for now. |

---

## Risk Register

| ID | Risk | Mitigation |
|----|------|------------|
| RC-01 | Email leaked via browser devtools if `email` included in listing response | Explicit `select` exclusion on every Prisma listing query; API test verifies absence |
| RC-02 | Resend call fails silently — contact log written but email not delivered | Wrap Resend call in try/catch; return 502 to client if Resend throws; do NOT write log until after successful send |
| RC-03 | Race condition on rate limit (5 concurrent submits) | Acceptable at this scale; Prisma count is sufficient, no atomic decrement needed |

---

## Implementation Scope

### New files
- `apps/web/prisma/schema.prisma` — add `ServiceProvider`, `ServiceContactLog` models; back-relations on `Member`
- `apps/web/lib/validation/service-provider.schema.ts` — Zod schemas for registration and contact forms
- `apps/web/lib/services/service-provider-service.ts` — DB queries (list, getById, create, update, delete); email excluded from all reads
- `apps/web/lib/messaging/service-contact.ts` — Resend email function for service contact (separate template from member messaging)
- `apps/web/app/api/services/route.ts` — `GET` (list, members only) + `POST` (register, active member)
- `apps/web/app/api/services/[id]/route.ts` — `PATCH` (own profile or admin) + `DELETE` (own or admin)
- `apps/web/app/api/services/[id]/contact/route.ts` — `POST` (active member only, rate-limited, Resend relay)
- `apps/web/app/api/services/route.test.ts`
- `apps/web/app/api/services/[id]/route.test.ts`
- `apps/web/app/api/services/[id]/contact/route.test.ts`
- `apps/web/app/services/page.tsx` — directory listing (server component, auth-gated)
- `apps/web/app/services/register/page.tsx` — registration form (server component shell + client form)
- `apps/web/app/services/[id]/ContactButton.tsx` — client component, contact modal + form

### Modified files
- `apps/web/app/components/nav-bar.tsx` — add "Services" as first item under Programs submenu
- `apps/web/app/dashboard/page.tsx` (or profile) — link to "My Service Profile" panel (FR-08)
- `apps/web/app/admin/page.tsx` or admin members — surface provider list for admin moderation (FR-09)
