# SPEC-23 — Phase 3: Implementation Log

**Spec:** Services Directory & Discrete Messaging
**Implementer:** Claude Code
**Date:** 2026-06-07
**Status:** COMPLETE

---

## Steps Completed

### 1. Prisma Schema ✅
- Added `ServiceProvider` and `ServiceContactLog` models to `schema.prisma`
- Added back-relations `serviceProvider` and `serviceContactsSent` on `Member`
- `npx prisma db push` — tables created; client regenerated

### 2. Zod Schemas ✅
- Created `apps/web/lib/validation/service-provider.schema.ts`
- `RegisterProviderSchema`, `UpdateProviderSchema`, `ContactProviderSchema`

### 3. Service Layer ✅
- Created `apps/web/lib/services/service-provider-service.ts`
- `ProviderPublic` type explicitly excludes `email`
- `PUBLIC_SELECT` constant ensures `email` is never selected in listing queries
- `getProviderEmail(id)` — internal only, used solely by contact route

### 4. Email Function ✅
- Created `apps/web/lib/messaging/service-contact.ts`
- `sendServiceContactEmail()` — separate template from member messaging
- Includes sender's email in body as reply-to coordinates

### 5. RED Tests ✅
- All 3 test suites ran RED (route files absent)

### 6. API Routes (GREEN) ✅
- `apps/web/app/api/services/route.ts` — GET (list) + POST (register)
- `apps/web/app/api/services/[id]/route.ts` — PATCH + DELETE
- `apps/web/app/api/services/[id]/contact/route.ts` — POST (rate-limited relay)
- 22/22 tests GREEN

### 7. Nav Bar ✅
- Added `<li><Link href="/services">Services</Link></li>` as first item under Programs submenu
- Added `<li><Link href="/admin/services">Manage Services</Link></li>` under Admin submenu

### 8. Pages ✅
- `apps/web/app/services/page.tsx` — directory listing with filters, initials/photo avatar, ContactButton
- `apps/web/app/services/ContactButton.tsx` — client component, inline contact form, rate-limit messaging
- `apps/web/app/services/register/page.tsx` — registration guard (active member, no existing profile)
- `apps/web/app/services/register/RegisterForm.tsx` — client form with photo URL field
- `apps/web/app/services/[id]/edit/page.tsx` — owner/admin guard
- `apps/web/app/services/[id]/edit/EditForm.tsx` — pre-populated edit + delete

### 9. Admin Stub ✅
- `apps/web/app/admin/services/page.tsx` — table of all providers (including inactive), link to edit

### 10. Dashboard Link ✅
- Added "Services Directory" and "Register as a Service Provider" links to `app/dashboard/page.tsx`

---

## Test Results

| Suite | Tests | Result |
|-------|-------|--------|
| `app/api/services/route.test.ts` | 7 | ✅ All pass |
| `app/api/services/[id]/route.test.ts` | 8 | ✅ All pass |
| `app/api/services/[id]/contact/route.test.ts` | 7 | ✅ All pass |
| Full suite (`pnpm test`) | 351 | ✅ 350 pass / 1 pre-existing fail |
| ESLint | — | ✅ No warnings or errors |
| TypeScript (`tsc --noEmit`) | — | ✅ No errors |

---

## Files Created / Modified

| File | Action |
|------|--------|
| `apps/web/prisma/schema.prisma` | Added `ServiceProvider`, `ServiceContactLog`; back-relations on Member |
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
| `apps/web/app/components/nav-bar.tsx` | Added Services + Manage Services nav links |
| `apps/web/app/dashboard/page.tsx` | Added Services Directory + Register links |
