# Feature Specification: Event Registration

> **Spec ID:** SPEC-28-event-registration
> **Status:** In Design
> **Author:** Utkal Nayak
> **Created:** 2026-06-07
> **Last Updated:** 2026-06-07 (v2 — incorporates user clarifications)

---

## 1. Overview

### 1.1 Summary
End-to-end event registration for OSA events. Events are authored in Sanity CMS; this spec adds registration fields to Sanity and a PostgreSQL `EventRegistration` model. Events can be **members-only** (authenticated active members) or **open to all** (anyone with a valid email, no account required). Most OSA events are free; content authors set the price per event. Paid events use Stripe Checkout. Admins can view and deregister any registrant.

### 1.2 Goals
- [ ] Event detail pages are publicly visible to all visitors
- [ ] Content authors control: access level (members-only vs open), registration fee (default 0 = free), capacity, guest-count prompt, and a sharable online link (Zoom etc.)
- [ ] Members-only events: require authenticated active-member session to register
- [ ] Open events: anyone can register via name + email (no account required)
- [ ] Paid events: Stripe Checkout for both member and non-member registrants
- [ ] Per-registrant guest count (when enabled by content author)
- [ ] Confirmation email via Resend on successful registration
- [ ] Admin can view all registrants per event and deregister any registrant
- [ ] Enforce capacity limits

### 1.3 Non-Goals (Out of Scope)
- Member-initiated cancellation (admin deregisters; member sees status change)
- Member-initiated refund (admin uses existing `issueRefund`)
- Waitlist management
- Multiple ticket types / tiered pricing per event
- Calendar export (iCal / Google Calendar)
- QR-code check-in

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | **Sanity event schema — new fields**: `accessLevel` (string enum: `membersOnly \| openToAll`, default `membersOnly`), `registrationFee` (number USD, default 0 = free), `registrationCapacity` (number, optional), `guestCountEnabled` (boolean, default false), `onlineLink` (url, optional) | Must Have | Existing events without these fields show no registration UI |
| FR-02 | **Event detail page is public**. All visitors (logged in or not) see event title, date, location, description, online link, and flyer. The registration call-to-action adapts based on access level and auth state (see FR-11). | Must Have | Replaces current member-only gate |
| FR-03 | **Free member registration**: authenticated active member clicks Register → `POST /api/events/[sanityId]/register` creates `EventRegistration` with `status: confirmed` → redirect to `/events/[slug]/success` | Must Have | |
| FR-04 | **Paid member registration**: same endpoint → creates Stripe Checkout session → client redirects to Stripe; webhook confirms and creates `EventRegistration` | Must Have | |
| FR-05 | **Free non-member registration** (open events only): unauthenticated visitor provides name + email → `POST /api/events/[sanityId]/register/guest` creates `EventRegistration` with `status: confirmed` → redirect to `/events/[slug]/success` | Must Have | Unique by `(sanityEventId, guestEmail)` |
| FR-06 | **Paid non-member registration** (open events only): same guest endpoint → Stripe Checkout session with `customer_email = guestEmail`; webhook confirms | Must Have | `memberId` is null on `PaymentRecord` |
| FR-07 | **Guest count**: when `guestCountEnabled` is true, the registration form includes a "How many additional guests are joining?" number input (min 0). Stored as `guestCount` on `EventRegistration`. | Must Have | |
| FR-08 | **Stripe webhook extended**: `checkout.session.completed` with `paymentType: 'event_registration'` → create/upsert `EventRegistration` with `status: confirmed`; create `PaymentRecord` | Must Have | Idempotent via `stripeSessionId` unique |
| FR-09 | **Confirmation email**: sent via Resend on confirmed registration (free or paid, member or guest). Includes event name, date, location, online link (if set). | Must Have | |
| FR-10 | **Capacity enforcement**: if `registrationCapacity` is set and confirmed registrations ≥ capacity, registration endpoint returns `409 Conflict`. Button shows "Sold Out". | Must Have | Atomic check in serializable transaction |
| FR-11 | **Registration CTA states** on the event detail page: | Must Have | |
| | • `accessLevel: membersOnly` + unauthenticated → "Log in to register" (link to `/login`) | | |
| | • `accessLevel: membersOnly` + authenticated non-active member → "Active membership required" (link to `/membership`) | | |
| | • `accessLevel: membersOnly` + active member + already registered → "You're registered ✓" | | |
| | • `accessLevel: membersOnly` + active member + not registered → "Register" button | | |
| | • `accessLevel: openToAll` + already registered (by email cookie or member session) → "You're registered ✓" | | |
| | • `accessLevel: openToAll` + not registered → registration form (name + email + guestCount if enabled) inline or modal | | |
| | • Capacity full (any access level) → "Sold Out" | | |
| | • No `registrationFee` field set in Sanity (legacy events) → show `registration_link` if present, else nothing | | |
| FR-12 | **Admin deregister**: admin events page shows registrant list per event. Admin can click "Deregister" → sets `EventRegistration.status = 'cancelled'` and `cancelledAt = now()`. No automatic refund (admin triggers refund separately if needed). | Must Have | |
| FR-13 | **Admin events page**: lists all Sanity events with confirmed registration count. Clicking an event expands to show registrant list (name, email, guestCount, status, paid amount). | Should Have | |
| FR-14 | **"Already registered" detection for guests**: after a guest registers, the confirmation page sets a cookie `osa_reg_{sanityEventId}=1`. The event detail page reads this cookie server-side to show "You're registered ✓" for returning visitors. | Should Have | Not a security control — just UX |
| FR-15 | **Free registrations do not create a `PaymentRecord`**. Only paid registrations (confirmed via webhook) create a `PaymentRecord`. | Must Have | Keeps payment ledger clean |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Idempotent webhook | No duplicate `EventRegistration` rows on duplicate `checkout.session.completed` | Upsert keyed on `stripeSessionId` |
| NFR-02 | Atomic capacity check | No oversell | Serializable Prisma transaction |
| NFR-03 | API response time | < 500 ms free registration; Stripe redirect < 2 s | Email is fire-and-forget |
| NFR-04 | Guest email uniqueness | One registration per email per event | `@@unique([sanityEventId, guestEmail])` |
| NFR-05 | No duplicate member registrations | One registration per member per event | `@@unique([sanityEventId, memberId])` |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] Sanity event schema has all FR-01 fields
- [ ] `EventRegistration` Prisma model supports both member and non-member registrants
- [ ] `event_registration` added to `PaymentType` enum
- [ ] Member registration endpoint (POST `/api/events/[sanityId]/register`) handles free + paid
- [ ] Guest registration endpoint (POST `/api/events/[sanityId]/register/guest`) handles free + paid for open events
- [ ] Webhook handler extended for `event_registration` (member and guest paths)
- [ ] Event detail page is public; shows all FR-11 CTA states correctly
- [ ] `/events/[slug]/success` confirmation page
- [ ] Confirmation email sent on registration
- [ ] Admin deregister action (PATCH `/api/admin/events/registrations/[id]`)
- [ ] Admin events page shows events + registration counts + registrant list
- [ ] All unit tests pass; Playwright E2E covers member happy path and guest happy path

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Member free registration | Active member, open or members-only event, `registrationFee: 0` | POST member register | `EventRegistration` confirmed; email sent; 200 + redirect |
| Member paid registration | Active member, `registrationFee: 50` | POST member register | Stripe session URL returned; 200 |
| Guest free registration | Open event, `registrationFee: 0`, unauthenticated | POST guest register with name + email | `EventRegistration` confirmed; email sent; cookie set; 200 + redirect |
| Guest paid registration | Open event, `registrationFee: 20` | POST guest register | Stripe session URL returned; `memberId` null |
| Webhook member paid | `checkout.session.completed`, `paymentType: event_registration`, `memberId` set | Stripe fires webhook | `EventRegistration` confirmed; `PaymentRecord` created |
| Webhook guest paid | `checkout.session.completed`, `paymentType: event_registration`, `memberId` null, `guestEmail` set | Stripe fires webhook | `EventRegistration` confirmed; email sent |
| Capacity full | 10/10 confirmed registrations | POST register | 409 Conflict |
| Already registered (member) | Member has confirmed registration | GET event detail page | "You're registered ✓" shown |
| Already registered (guest) | Cookie `osa_reg_{id}` present | GET event detail page | "You're registered ✓" shown |
| Duplicate guest email | Guest email already registered for event | POST guest register | 409 Conflict |
| Non-member attempts members-only | `memberStatus !== 'active'` | POST member register | 403 Forbidden |
| Guest attempts members-only | Unauthenticated, `accessLevel: membersOnly` | POST guest register | 403 Forbidden |
| Duplicate webhook | Same `checkout.session.completed` twice | Second webhook fires | No-op; no duplicate row |
| Admin deregister | Admin, any registrant | PATCH registration status cancelled | `status: cancelled`, `cancelledAt` set; 200 |
| With guest count | `guestCountEnabled: true`, registrant sends `guestCount: 3` | POST register | `EventRegistration.guestCount = 3` |

---

## 4. Technical Constraints

### 4.1 Technologies
- Next.js App Router (RSC + Client Components)
- Prisma ORM + PostgreSQL (via Supabase)
- Stripe Checkout
- Resend
- Sanity CMS

### 4.2 Patterns to Follow
- Member API routes: `withAuth` wrapper
- Guest API routes: no `withAuth`; validate input with Zod; enforce `accessLevel === 'openToAll'`
- Stripe: extend `apps/web/lib/payments/stripe.ts`
- Webhook: extend `apps/web/lib/payments/webhook-handlers.ts`
- Email: Resend client pattern from SPEC-26
- Prisma conventions: UUID ids, `@map` snake_case, `@db.Timestamptz`

### 4.3 Proposed `EventRegistration` Prisma Model

```prisma
model EventRegistration {
  id             String    @id @default(uuid()) @db.Uuid
  sanityEventId  String    @map("sanity_event_id")       // Sanity _id
  // Member registrant (null for non-member/guest)
  memberId       String?   @map("member_id") @db.Uuid
  // Guest registrant (null for member)
  guestEmail     String?   @map("guest_email")
  guestName      String?   @map("guest_name")
  // Common fields
  guestCount     Int       @default(0) @map("guest_count") // additional attendees
  status         EventRegistrationStatus @default(pending)
  stripeSessionId String?  @unique @map("stripe_session_id") // webhook dedup
  cancelledAt    DateTime? @map("cancelled_at") @db.Timestamptz
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz

  // Relations
  member         Member?   @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@unique([sanityEventId, memberId])   // one per member per event
  @@unique([sanityEventId, guestEmail]) // one per email per event
  @@map("event_registrations")
}

enum EventRegistrationStatus {
  pending
  confirmed
  cancelled
  @@map("event_registration_status")
}
```

### 4.4 Files / Modules to Create or Modify

| File | Change |
|------|--------|
| `apps/web/sanity/schemas/event.ts` | Add FR-01 fields (`accessLevel`, `registrationFee`, `registrationCapacity`, `guestCountEnabled`, `onlineLink`) |
| `apps/web/types/sanity.ts` | Add new fields to `SanityEvent` interface |
| `apps/web/sanity/lib/queries.ts` | Update queries + add `EVENT_BY_ID_QUERY` (lookup by `_id`) |
| `apps/web/prisma/schema.prisma` | Add `EventRegistration` model + `EventRegistrationStatus` enum + `event_registration` to `PaymentType` |
| `apps/web/lib/payments/stripe.ts` | Add `createEventRegistrationSession()` |
| `apps/web/lib/payments/webhook-handlers.ts` | Extend `handleCheckoutCompleted` for `event_registration` |
| `apps/web/lib/emails/event-registration-confirmation.ts` | New: Resend email template |
| `apps/web/lib/validation/event.schema.ts` | New: Zod schemas for member register + guest register request bodies |
| `apps/web/lib/validation/payment.schema.ts` | Add `event_registration` to `PaymentType` Zod enum |
| `apps/web/app/api/events/[sanityId]/register/route.ts` | New: POST — authenticated member registration |
| `apps/web/app/api/events/[sanityId]/register/guest/route.ts` | New: POST — unauthenticated guest registration (open events only) |
| `apps/web/app/api/events/[sanityId]/registrations/route.ts` | New: GET — admin list registrants |
| `apps/web/app/api/admin/events/registrations/[id]/route.ts` | New: PATCH — admin deregister |
| `apps/web/app/events/[slug]/page.tsx` | Make public; add server-side registration state; show all FR-11 CTA states |
| `apps/web/app/events/[slug]/RegisterSection.tsx` | New: client component handling register form, button states, Stripe redirect |
| `apps/web/app/events/[slug]/success/page.tsx` | New: confirmation page; sets guest cookie |
| `apps/web/app/admin/events/page.tsx` | Replace stub: event list + registration counts |
| `apps/web/app/admin/events/[sanityId]/page.tsx` | New: per-event registrant list + deregister action |

### 4.5 Files NOT to Modify
- `apps/web/app/api/webhooks/stripe/route.ts` — extend handler only, not the router
- Any existing passing tests

---

## 5. Dependencies

### 5.1 Upstream
- SPEC-2 (Auth) — `withAuth`, `getCurrentMember` ✅
- SPEC-4 (Payment module) — Stripe + PaymentRecord infrastructure ✅
- SPEC-26 (Expiry reminders) — Resend email setup ✅

### 5.2 Downstream Impact
- Admin payments page gains `event_registration` payment records
- Future cancellation / refund / waitlist specs build on `EventRegistration`

---

## 6. Resolved Questions

| Question | Answer |
|----------|--------|
| Event detail page public? | Yes — all visitors see full event details |
| Non-member registration? | Yes — for `accessLevel: openToAll` events via name + email |
| Free registration creates `PaymentRecord`? | No — payment ledger is paid-transactions only |
| Default registration fee? | 0 (free); content author sets price |
| Admin deregister? | Yes — PATCH sets `status: cancelled` + `cancelledAt` |
| Guest count field? | Yes — `guestCountEnabled` in Sanity; `guestCount` on `EventRegistration` |
| Online/Zoom link? | Yes — `onlineLink` field in Sanity; shown on event detail page |
| Calendar invite in email? | Out of scope for this spec |

---

## Agent Workflow Tracking

### Phase 1: Analysis
- **Status:** Complete (updated for v2 requirements)
- **Artifact:** `specs/artifacts/SPEC-28-event-registration/01-analysis.md`

### Phase 2: Design
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-28-event-registration/02-design.md`

### Phase 3: Implementation
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-28-event-registration/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-28-event-registration/04-qa-report.md`
