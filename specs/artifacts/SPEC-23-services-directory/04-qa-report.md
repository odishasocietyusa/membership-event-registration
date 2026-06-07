# SPEC-23 — Phase 4: QA Report

**Spec:** Services Directory & Discrete Messaging
**QA:** Claude Code
**Date:** 2026-06-07
**Status:** APPROVED

---

## Test Suite Results

| Suite | Tests | Result |
|-------|-------|--------|
| `app/api/services/route.test.ts` | 7 | ✅ All pass |
| `app/api/services/[id]/route.test.ts` | 8 | ✅ All pass |
| `app/api/services/[id]/contact/route.test.ts` | 7 | ✅ All pass |
| Full suite (`pnpm test`) | 353 | ✅ 352 pass / 1 pre-existing fail (unrelated) |
| ESLint (`pnpm lint`) | — | ✅ No warnings or errors |
| TypeScript (`tsc --noEmit`) | — | ✅ No errors |

**Pre-existing failure:** `app/api/auth/callback/route.test.ts` — unrelated to SPEC-23.

---

## Acceptance Criteria Checklist

| Requirement | Status | Notes |
|-------------|--------|-------|
| FR-01 Self-registration form | ✅ | `/services/register` — active members only |
| FR-02 Directory page at `/services` | ✅ | Auth-gated, shows only `active` providers |
| FR-03 Subject & remote filtering | ✅ | `<form method="GET">` with specialization select + online checkbox |
| FR-04 OSA Member badge | ✅ | Derived from `memberId` join + `memberStatus === 'active'` |
| FR-05 Discrete contact form | ✅ | Inline form in `ContactButton.tsx` — no email in DOM or API response |
| FR-06 Active member authorization | ✅ | API-level 403 + UI-level message for non-active members |
| FR-07 Server-mediated email relay | ✅ | `sendServiceContactEmail()` via Resend — email never leaves server |
| FR-08 My Service Profile panel | ✅ | Edit/delete at `/services/[id]/edit`; links from dashboard + directory |
| FR-09 Admin moderation | ✅ | `/admin/services` — approve, deactivate, re-activate, delete |
| Approval flow (user decision) | ✅ | New registrations start `pending`; admin must approve before visible |
| NFR-01 Zero email leak | ✅ | `email` excluded from all `PUBLIC_SELECT` queries; T-01, T-07, T-21 verify absence |
| NFR-02 Rate limiting (5/hour) | ✅ | Prisma count on `ServiceContactLog`; T-18 verifies 429 |
| NFR-03 Styling | ⏸ | Deferred — unstyled functional stubs per project constraint |
| NFR-04 Responsiveness | ⏸ | Deferred — pending Figma design |

---

## Privacy Verification

- `ProviderPublic` type has no `email` field — TypeScript enforces exclusion at compile time
- `PUBLIC_SELECT` constant omits `email` — all listing/detail queries use it
- `getProviderEmail(id)` is the only function that selects email — called only inside the contact route, value passed directly to Resend, never serialised to JSON
- T-01 (GET list), T-07 (POST 201), T-21 (contact 200) all assert `JSON.stringify(data)` does not contain `email`

---

## Approval Flow Verification

| Scenario | Expected | Covered by |
|----------|----------|-----------|
| New registration → status `pending` | Not visible in directory | `createProvider` hardcodes `status: 'pending'`; `listProviders` default filter is `status: 'active'` |
| Admin approves → status `active` | Visible in directory | `AdminServiceActions` PATCH with `{ status: 'active' }` |
| Admin deactivates → status `inactive` | Hidden from directory | `AdminServiceActions` PATCH with `{ status: 'inactive' }` |
| Non-admin attempts status change | Stripped silently | `PATCH /api/services/[id]` deletes `status` from payload for non-admin; T-12 verifies |
| Contact pending/inactive provider | 404 | Contact route checks `provider.status !== 'active'` |

---

## Files Delivered

| File | Action |
|------|--------|
| `apps/web/prisma/schema.prisma` | Added `ProviderStatus` enum, `ServiceProvider`, `ServiceContactLog` models; back-relations on Member |
| `apps/web/lib/validation/service-provider.schema.ts` | Created |
| `apps/web/lib/services/service-provider-service.ts` | Created |
| `apps/web/lib/messaging/service-contact.ts` | Created |
| `apps/web/app/api/services/route.ts` | Created |
| `apps/web/app/api/services/route.test.ts` | Created |
| `apps/web/app/api/services/[id]/route.ts` | Created |
| `apps/web/app/api/services/[id]/route.test.ts` | Created |
| `apps/web/app/api/services/[id]/contact/route.ts` | Created |
| `apps/web/app/api/services/[id]/contact/route.test.ts` | Created |
| `apps/web/app/services/page.tsx` | Created |
| `apps/web/app/services/ContactButton.tsx` | Created |
| `apps/web/app/services/register/page.tsx` | Created |
| `apps/web/app/services/register/RegisterForm.tsx` | Created |
| `apps/web/app/services/[id]/edit/page.tsx` | Created |
| `apps/web/app/services/[id]/edit/EditForm.tsx` | Created |
| `apps/web/app/admin/services/page.tsx` | Created |
| `apps/web/app/admin/services/AdminServiceActions.tsx` | Created |
| `apps/web/app/components/nav-bar.tsx` | Added Services + Manage Services links |
| `apps/web/app/dashboard/page.tsx` | Added Services Directory + Register links |

---

## Known Limitations

- **NFR-03/NFR-04 (styling/responsiveness):** Deferred to future Figma-driven spec.
- **No email notification to provider on approval:** Admin approves silently. A future spec could add a Resend notification to the provider when their status changes to `active`.
- **No pagination on `/services`:** Low priority until provider count grows. Add when needed.

---

## SPEC-23 CLOSED
