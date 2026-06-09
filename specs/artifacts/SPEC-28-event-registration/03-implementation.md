# SPEC-28 — Phase 3: Implementation Log

**Implementer:** Claude Code
**Date:** 2026-06-09
**Status:** Complete

---

## Files Created

| File | Purpose |
|------|---------|
| `apps/web/lib/validation/event.schema.ts` | Zod schemas: MemberRegisterSchema, GuestRegisterSchema, DeregisterSchema |
| `apps/web/lib/emails/event-registration-confirmation.ts` | Resend email template for registration confirmation |
| `apps/web/app/api/events/[sanityId]/register/route.ts` | POST — authenticated member registration (free + paid) |
| `apps/web/app/api/events/[sanityId]/register/guest/route.ts` | POST — unauthenticated guest registration for openToAll events |
| `apps/web/app/api/events/[sanityId]/registrations/route.ts` | GET — admin list of registrants per event |
| `apps/web/app/api/admin/events/registrations/[id]/route.ts` | PATCH — admin deregister (soft cancel) |
| `apps/web/app/events/[slug]/RegisterSection.tsx` | Client component: all registration CTA states |
| `apps/web/app/events/[slug]/success/page.tsx` | Confirmation page; sets guest cookie on `?guest=1` |
| `apps/web/app/admin/events/[sanityId]/page.tsx` | Per-event admin registrant list with deregister action |
| `apps/web/lib/validation/event.schema.test.ts` | Unit tests: ZOD-01–06 |
| `apps/web/app/api/events/[sanityId]/register/route.test.ts` | Unit tests: REG-01–09 |
| `apps/web/app/api/events/[sanityId]/register/guest/route.test.ts` | Unit tests: GUEST-01–08 |
| `apps/web/app/api/admin/events/registrations/[id]/route.test.ts` | Unit tests: DEREG-01–04 |

## Files Modified

| File | Change |
|------|--------|
| `apps/web/prisma/schema.prisma` | Added `event_registration` to `PaymentType` enum; added `EventRegistrationStatus` enum; added `EventRegistration` model; added `eventRegistrations` back-relation on `Member` |
| `apps/web/sanity/schemas/event.ts` | Added 5 new fields: `accessLevel`, `registrationFee`, `registrationCapacity`, `guestCountEnabled`, `onlineLink` |
| `apps/web/types/sanity.ts` | Added new fields to `SanityEvent` interface |
| `apps/web/sanity/lib/queries.ts` | Extracted `EVENT_FIELDS` fragment; updated `ALL_EVENTS_QUERY` and `EVENT_BY_SLUG_QUERY` to include new fields; added `EVENT_BY_ID_QUERY` |
| `apps/web/lib/payments/stripe.ts` | Added `createEventRegistrationSession` and `createEventRegistrationGuestSession` |
| `apps/web/lib/payments/webhook-handlers.ts` | Extended `handleCheckoutCompleted` with `event_registration` branch; added `handleEventRegistrationCompleted` and `sendEventRegistrationBySessionId` private functions; added Sanity/Prisma/email imports |
| `apps/web/lib/payments/webhook-handlers.test.ts` | Added WEBHOOK-01–05 test cases; updated mocks for eventRegistration and member |
| `apps/web/lib/validation/payment.schema.ts` | Added `event_registration` to `ListPaymentsQuerySchema` PaymentType enum |
| `apps/web/app/events/[slug]/page.tsx` | Made public (removed unconditional redirect); added capacity and existing-registration queries; added `RegisterSection`; added online link display |
| `apps/web/app/admin/events/page.tsx` | Replaced "Coming soon" stub with event list table and confirmed registration counts |

## Test Results

```
Test Suites: 50 passed (pre-existing: 1 failed — auth/callback unrelated to SPEC-28)
Tests:       384 passed, 1 failed (pre-existing)

New tests passing:
  lib/validation/event.schema.test.ts          8 tests
  app/api/events/.../register/route.test.ts    8 tests
  app/api/events/.../register/guest/route.test.ts  8 tests
  app/api/admin/events/registrations/.../route.test.ts  3 tests
  lib/payments/webhook-handlers.test.ts        +5 new tests (total 10)
```

## DB Push Required

`prisma db push` was blocked by network connectivity to the Supabase cloud instance during implementation. Run manually:

```bash
cd apps/web && npx prisma db push
```

This applies:
- New `event_registration_status` enum
- `event_registration` value on `payment_type` enum
- New `event_registrations` table with all columns and unique indexes

## Known Gaps (for QA)

1. **Playwright E2E tests** — E2E-01 through E2E-04 from the design are not yet written. Requires `prisma db push` and a running dev server with seed data.
2. **Admin layout nav link** — Design step 26 (add Events link to admin nav) was not implemented; admin reaches the events page via direct URL `/admin/events`.
3. **`formatDate` signature** — Verify `formatDate(r.createdAt, '—')` matches the actual function signature in `lib/utils/date.ts`.
