# SPEC-28 — Phase 1: Analysis

**Spec:** Event Registration
**Analyst:** Claude Code (feature-dev:code-explorer)
**Date:** 2026-06-07
**Status:** Complete

---

## 1. Requirement Breakdown with Sub-Tasks

### FR-01 — Sanity event schema gains three new optional fields

- **ST-01a**: In `apps/web/sanity/schemas/event.ts`, append three `defineField` entries: `registrationFee` (type `number`, optional, min 0), `registrationCapacity` (type `number`, optional, min 1), `requiresMembership` (type `boolean`, `initialValue: true`).
- **ST-01b**: In `apps/web/types/sanity.ts`, add `registrationFee?: number`, `registrationCapacity?: number`, `requiresMembership?: boolean` to `SanityEvent`.
- **ST-01c**: In `apps/web/sanity/lib/queries.ts`, add the three new fields to both `EVENT_BY_SLUG_QUERY` and `ALL_EVENTS_QUERY`. `UPCOMING_EVENTS_QUERY` and `ALL_EVENT_SLUGS_QUERY` do not need them.

**Constraint**: `registrationFee === 0` means "free but requires registration"; field absent/null means "use external `registration_link`". This zero vs null distinction is load-bearing — use `number | null | undefined` throughout TypeScript typing and `registrationFee != null` (not `!== 0`) as the UI gate check.

---

### FR-02 — Event detail page shows contextual UI

- **ST-02a**: `apps/web/app/events/[slug]/page.tsx` currently hard-redirects unauthenticated users to `/login`. The spec requires unauthenticated users to see "Log in to register" when `registrationFee` is non-null. The page must attempt `getCurrentMember()` without unconditional redirect and render the prompt when result is null AND `registrationFee != null`.
- **ST-02b**: Add a `RegisterButton` client component. The current page is a pure Server Component; the register POST + loading state + redirect requires a client component. It receives `sanityEventId`, `slug`, `isFree`, `isAlreadyRegistered`, `isSoldOut`, `isAuthenticated` as props and handles the `fetch` call and redirect.
- **ST-02c**: Server component fetches the member's registration status (`EventRegistration` by `(sanityEventId, memberId)`) and passes `isAlreadyRegistered` to the client component.
- **ST-02d**: Server component fetches confirmed registration count for `isSoldOut` (`prisma.eventRegistration.count`).

**Risk**: Changing the unauthenticated-user behavior is a gate change for the entire events section. See Q4 below — implementer must not proceed on this item without an answer.

---

### FR-03 — Free event registration via POST

- **ST-03a**: Create `apps/web/app/api/events/[sanityId]/register/route.ts` as a `withAuth`-wrapped POST handler.
- **ST-03b**: Handler fetches the Sanity event by `_id` to get `registrationFee`, `registrationCapacity`, `requiresMembership`, `slug`, `title`. Requires a new `EVENT_BY_ID_QUERY` GROQ query (existing queries only search by `slug.current`).
- **ST-03c**: For free registrations: run an atomic Prisma transaction that (1) counts confirmed registrations, (2) checks capacity, (3) creates `EventRegistration` with `status: 'confirmed'`.
- **ST-03d**: After successful creation, call `sendEventRegistrationConfirmation()` as fire-and-forget.
- **ST-03e**: Return `{ redirect: '/events/${slug}/success' }`. The `slug` comes from the Sanity event fetched in ST-03b.

---

### FR-04 — Paid event registration via Stripe Checkout

- **ST-04a**: Same POST endpoint. Branch on `registrationFee > 0`.
- **ST-04b**: Add `createEventRegistrationSession(memberId, memberEmail, sanityEventId, eventTitle, slug, feeAmountDollars)` to `apps/web/lib/payments/stripe.ts`. `success_url`: `${BASE_URL}/events/${slug}/success?session_id={CHECKOUT_SESSION_ID}`; `cancel_url`: `${BASE_URL}/events/${slug}`. Stripe session `metadata` carries `paymentType: 'event_registration'`, `memberId`, `sanityEventId`, `slug`.
- **ST-04c**: Handler returns `{ url: session.url }` to the client, which does `window.location.href = url`.
- **ST-04d**: For paid events, the `EventRegistration` row is NOT created at session-creation time — the webhook creates it on `checkout.session.completed`. To prevent double-click launching two sessions, create a `pending` `EventRegistration` row at session-creation time; webhook upserts it to `confirmed`.

---

### FR-05 — Webhook handler extended for `event_registration`

- **ST-05a**: Add `event_registration` to `PaymentType` enum in `apps/web/prisma/schema.prisma`.
- **ST-05b**: In `apps/web/lib/payments/webhook-handlers.ts`, `handleCheckoutCompleted()` branches on `paymentType === 'event_registration'` and calls a new `handleEventRegistrationCompleted(session)`.
- **ST-05c**: `handleEventRegistrationCompleted`: (1) calls `recordPayment` with `paymentType: 'event_registration'`; (2) upserts `EventRegistration` to `confirmed` keyed on `(sanityEventId, memberId)`; (3) calls `sendEventRegistrationConfirmation()`.
- **ST-05d**: `recordPayment()` in `payment-service.ts` conditions its side-effects on `membershipType` being non-null. For `event_registration`, `membershipType` is null — no side-effects are triggered. No changes to `recordPayment()` logic needed.
- **ST-05e**: Existing idempotency pattern (`stripeEventId` unique constraint + P2002 catch) applies here without change.

---

### FR-06 — Confirmation email via Resend

- **ST-06a**: Create `apps/web/lib/emails/event-registration-confirmation.ts` with `sendEventRegistrationConfirmation(to, memberName, eventTitle, eventDate, eventLocation)`. Follow the `receipt.ts` pattern (Resend client, `RESEND_FROM_EMAIL` env var).
- **ST-06b**: Called on both paths: free (POST handler) and paid (webhook handler).
- **ST-06c**: Email failures must not fail the registration. Wrap in try/catch, log but do not rethrow.
- **ST-06d**: Webhook handler has `memberId` from metadata — must query `prisma.member.findUnique` for email + name. Sanity event details fetched by `sanityEventId` for title/date/location.

---

### FR-07 — Capacity enforcement (409)

- **ST-07a**: Count `EventRegistration` where `sanityEventId = X AND status = 'confirmed'`. If `count >= registrationCapacity`, return `409 { error: 'Event is at capacity' }`.
- **ST-07b**: The count + insert must be atomic. Use `prisma.$transaction(async (tx) => {...}, { isolationLevel: 'Serializable' })`. Prisma defaults to `READ COMMITTED` which is insufficient to prevent oversell.
- **ST-07c**: Event detail page reads capacity state server-side and passes `isSoldOut` prop.

---

### FR-08 — "You're registered" indicator

- **ST-08a**: Query `prisma.eventRegistration.findUnique({ where: { sanityEventId_memberId: { sanityEventId, memberId } } })`. If found with `status: 'confirmed'`, set `isAlreadyRegistered = true`.
- **ST-08b**: Skip this query when user is not authenticated.

---

### FR-09 — Admin events page

- **ST-09a**: Replace the stub in `apps/web/app/admin/events/page.tsx`.
- **ST-09b**: Fetch all Sanity events via `ALL_EVENTS_QUERY`.
- **ST-09c**: Efficient count: one `prisma.eventRegistration.groupBy({ by: ['sanityEventId'], where: { status: 'confirmed' }, _count: true })` call, then merge with Sanity list by `_id`.
- **ST-09d**: Create `apps/web/app/api/events/[sanityId]/registrations/route.ts` as admin-only GET handler returning registrant list (name, email, payment status).
- **ST-09e**: Admin page must check `member.role === 'admin'` (current stub only checks for session).

---

### FR-10 — `requiresMembership` API gate

- **ST-10a**: In POST handler, check `member.memberStatus !== 'active'` when `requiresMembership !== false`. Return `403` if blocked.
- **ST-10b**: JIT-created members (from `withAuth`) have `memberStatus: null` → correctly blocked.
- **ST-10c**: When `requiresMembership` is explicitly `false`, skip the membership status check. Auth (`withAuth`) still applies.

---

### NFR-01 — Idempotent webhook

Use `@@unique([sanityEventId, memberId])` on `EventRegistration` for business dedup AND `stripeSessionId String? @unique` for webhook dedup. Catches both P2002 paths.

### NFR-02 — Atomic capacity check

Use `{ isolationLevel: 'Serializable' }` on the Prisma interactive transaction for the capacity check + insert.

### NFR-03 — Response time

Email sending in the free registration path must be fire-and-forget (`sendEventRegistrationConfirmation(...).catch(console.error)` without `await`) to keep the critical path under 500 ms.

---

## 2. Edge Cases and Risks Beyond the Spec

**EC-01: Sanity fetch in the webhook handler.**
The webhook needs event title/date/location from Sanity for the confirmation email. If Sanity is unavailable, wrap the email call in try/catch, return 200 to Stripe regardless, log the failure.

**EC-02: Race condition on paid registration capacity.**
Between Stripe session creation and webhook arrival, another member could fill the last seat. Recommended: confirm the registration and log a warning for admin review rather than issuing an automatic refund (avoids significant complexity).

**EC-03: `registrationFee: 0` vs `registrationFee: null` in Sanity.**
Sanity number field with no value returns `null` in GROQ, not `0`. Use `registrationFee != null` (not `!== 0`) as the registration-UI gate. Document this in the Sanity schema description field.

**EC-04: `slug` not available in webhook metadata — it must be in `success_url`.**
The success page redirect is performed by Stripe using `success_url`, not by the webhook. Therefore `slug` must be embedded in `success_url` at session-creation time, not derived in the webhook.

**EC-05: Spouse sessions.**
`withAuth` resolves a spouse session to the primary member's `Member` row. A spouse registering creates an `EventRegistration` under the primary member's ID. No behavior change needed, but admin reports should note this.

**EC-06: `EVENT_BY_ID_QUERY` gap.**
All existing Sanity queries search by `slug.current`. The register API receives a `sanityId` (`_id`). A new `EVENT_BY_ID_QUERY` must be added to `queries.ts`.

**EC-07: Admin events page N+1 risk.**
Use `groupBy` for a single aggregate query across all events. Do not query counts per-event in a loop.

**EC-08: `PaymentRecord.membershipType` is nullable.**
For `event_registration` payments, `membershipType` will be null — already allowed by the schema. No change needed.

**EC-09: `ListPaymentsQuerySchema` in `payment.schema.ts` hardcodes the PaymentType enum.**
`z.enum(['membership', 'upgrade', 'donation'])` at line 40 must be updated to include `'event_registration'`. This file is **not** listed in the spec's modification table — must be added.

**EC-10: `handlePaymentFailed` fallback.**
Uses `paymentType ?? 'membership'` as default. Pre-existing issue; do not change it in this spec.

**EC-11: Free event email is in the request critical path.**
Must be fire-and-forget to stay under 500 ms.

**EC-12: Success page receives `session_id` for paid events, nothing for free.**
Ignore `session_id`; display a static confirmation message. Simplest safe implementation.

**EC-13: `requiresMembership` absent in existing Sanity events.**
Existing events return `requiresMembership: undefined` from GROQ, not `true`. Use `event.requiresMembership !== false` (not `=== true`) for the gate check.

---

## 3. Resolved Answers to Open Questions

**Q1: Should free registrations create a `PaymentRecord` with `amountCents: 0`?**
**Decision: No.**
A zero-amount record pollutes the payment ledger and has no accounting value. The `EventRegistration` row alone confirms attendance. Skip `recordPayment` entirely for free events.

**Q2: Should non-members register for `requiresMembership: false` events?**
**Decision: Yes — authenticated non-members can register.**
The spec's non-goal ("guest registration") refers to anonymous/unauthenticated access. An authenticated user with an expired or pending membership has a valid account and should participate in open events. `withAuth` already blocks unauthenticated users.

**Q3: Handle Supabase-authenticated user with no `Member` record?**
**Decision: No special handling needed.**
`withAuth` JIT-creates a `Member` row for any authenticated user without one. The JIT-created member has `memberStatus: null` → not `'active'` → correctly blocked by the membership gate. No special case is needed.

---

## 4. New Blocking Questions

**Q4: Should the event detail page be visible to unauthenticated users?**
Currently hard-redirects to `/login`. FR-02 implies rendering "Log in to register" for unauthenticated visitors, which requires the page to render without auth.

Two interpretations:
- **A (conservative)**: Page still requires login; unauthenticated users see only the "Log in to register" prompt with no event details.
- **B (open)**: Event title/date/location/description becomes publicly visible for events with `registrationFee` set; register button shows "Log in to register" for visitors.

**Implementer cannot proceed on FR-02 without this decision.** Recommended: **Option B** — public visibility for events with registration enabled is better for discoverability and consistent with community platforms.

**Q5: Is `SanityEvent._id` always the bare production ID (no `drafts.` prefix)?**
Likely yes (queries run against published dataset), but must be confirmed before building the `[sanityId]` route.

**Q6: Should `EventRegistration` have a `cancelledAt DateTime?` field for forward-compatibility?**
Low cost now, high cost later. Recommend adding it even though no cancellation UI is in scope.

**Q7: What is the fallback if Sanity is unavailable when the webhook fires?**
Recommend: skip email, log error, return 200 to Stripe. Define this in design.

---

## 5. Recommended Implementation Order

1. **DB schema** — `event_registration` PaymentType enum + `EventRegistration` model + `prisma db push`
2. **Sanity schema + TypeScript types + queries** — 3 new fields + `EVENT_BY_ID_QUERY`
3. **Zod validation** — `apps/web/lib/validation/event.schema.ts` + update `payment.schema.ts`
4. **Stripe session** — `createEventRegistrationSession` in `stripe.ts`
5. **Email template** — `lib/emails/event-registration-confirmation.ts`
6. **POST register route** — free path first, then paid path
7. **Webhook handler extension** — `handleEventRegistrationCompleted`
8. **Event detail page UI** — server-side state fetch + `RegisterButton` client component + success page
9. **Admin events page** — replace stub + admin registrations GET route
10. **Tests** — unit tests for route and webhook branch; Playwright E2E for free registration happy path

---

## 6. Files to Create or Modify (Reconciled)

| File | Change | In Spec? |
|------|--------|----------|
| `apps/web/sanity/schemas/event.ts` | Add 3 new fields | Yes |
| `apps/web/types/sanity.ts` | Add 3 new fields to `SanityEvent` | Yes |
| `apps/web/sanity/lib/queries.ts` | Update queries + add `EVENT_BY_ID_QUERY` | Partial |
| `apps/web/prisma/schema.prisma` | `EventRegistration` model + `event_registration` enum value | Yes |
| `apps/web/lib/payments/stripe.ts` | Add `createEventRegistrationSession` | Yes |
| `apps/web/lib/payments/webhook-handlers.ts` | Extend `handleCheckoutCompleted` | Yes |
| `apps/web/lib/emails/event-registration-confirmation.ts` | New: Resend email | Yes |
| `apps/web/app/api/events/[sanityId]/register/route.ts` | New: POST handler | Yes |
| `apps/web/app/api/events/[sanityId]/registrations/route.ts` | New: GET (admin) | Yes |
| `apps/web/app/events/[slug]/page.tsx` | Registration UI + state fetches | Yes |
| `apps/web/app/events/[slug]/success/page.tsx` | New: confirmation page | Yes |
| `apps/web/app/admin/events/page.tsx` | Replace stub | Yes |
| `apps/web/lib/validation/event.schema.ts` | New: register request Zod schema | Yes |
| `apps/web/lib/validation/payment.schema.ts` | Add `event_registration` to PaymentType enum | **No — discovered in analysis** |

---

*Phase 1 complete. Awaiting human approval before Phase 2 (Design).*
