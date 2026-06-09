# SPEC-28 — Phase 2: Design

**Spec:** Event Registration
**Architect:** Claude Code (feature-dev:code-architect)

## Correction: `accessLevel` vs `requiresMembership`

The Phase 1 analysis used `requiresMembership: boolean` from an earlier draft. The authoritative spec (v2) uses `accessLevel: 'membersOnly' | 'openToAll'`. All design decisions in this document use `accessLevel`. Implementers must ignore `requiresMembership` references in the analysis document.

---

## 1. Schema Changes

### 1.1 `PaymentType` enum — add `event_registration`

File: `apps/web/prisma/schema.prisma`, lines 91–97.

```prisma
enum PaymentType {
  membership
  upgrade
  donation
  event_registration @map("event_registration")

  @@map("payment_type")
}
```

### 1.2 New enum `EventRegistrationStatus`

Add immediately after `PaymentType`:

```prisma
enum EventRegistrationStatus {
  pending
  confirmed
  cancelled

  @@map("event_registration_status")
}
```

### 1.3 New model `EventRegistration`

Add after `ServiceContactLog` (end of file):

```prisma
// ─────────────────────────────────────────────────────────────────────────────
// EVENT REGISTRATIONS
// ─────────────────────────────────────────────────────────────────────────────

model EventRegistration {
  id              String                  @id @default(uuid()) @db.Uuid
  sanityEventId   String                  @map("sanity_event_id")
  memberId        String?                 @map("member_id") @db.Uuid
  guestEmail      String?                 @map("guest_email")
  guestName       String?                 @map("guest_name")
  // 0 = registrant only; 3 = registrant + 3 additional (4 total)
  guestCount      Int                     @default(0) @map("guest_count")
  status          EventRegistrationStatus @default(pending)
  stripeSessionId String?                 @unique @map("stripe_session_id")
  cancelledAt     DateTime?               @map("cancelled_at") @db.Timestamptz
  createdAt       DateTime                @default(now()) @map("created_at") @db.Timestamptz
  updatedAt       DateTime                @updatedAt @map("updated_at") @db.Timestamptz

  member          Member?                 @relation(fields: [memberId], references: [id], onDelete: Cascade)

  // Postgres allows multiple NULLs in unique constraints — both constraints
  // enforce correctly without partial indexes.
  @@unique([sanityEventId, memberId])
  @@unique([sanityEventId, guestEmail])
  @@index([sanityEventId, status])
  @@map("event_registrations")
}
```

### 1.4 Inverse relation on `Member`

Inside the `Member` model relations block (after `serviceContactsSent`):

```prisma
eventRegistrations   EventRegistration[]
```

### 1.5 Migration

```bash
cd apps/web && npx prisma db push && npx prisma generate
```

---

## 2. Sanity Schema Changes

File: `apps/web/sanity/schemas/event.ts`

Append five `defineField` entries inside the `fields` array after `is_convention`:

```typescript
defineField({
  name: 'accessLevel',
  title: 'Access Level',
  type: 'string',
  options: {
    list: [
      { title: 'Members Only', value: 'membersOnly' },
      { title: 'Open to All', value: 'openToAll' },
    ],
    layout: 'radio',
  },
  initialValue: 'membersOnly',
  description:
    'membersOnly: only authenticated active members can register. openToAll: anyone with name + email can register.',
}),
defineField({
  name: 'registrationFee',
  title: 'Registration Fee (USD)',
  type: 'number',
  description:
    'Set to 0 for free. Leave blank to hide registration UI and use the legacy Registration Link field instead.',
  validation: (Rule) => Rule.min(0).precision(2),
}),
defineField({
  name: 'registrationCapacity',
  title: 'Registration Capacity',
  type: 'number',
  description: 'Maximum confirmed registrations. Leave blank for unlimited.',
  validation: (Rule) => Rule.integer().min(1),
}),
defineField({
  name: 'guestCountEnabled',
  title: 'Allow Guest Count',
  type: 'boolean',
  initialValue: false,
  description: 'When enabled, registrants can specify additional guests.',
}),
defineField({
  name: 'onlineLink',
  title: 'Online Meeting Link',
  type: 'url',
  description: 'Zoom/Teams link. Shown on event detail page and in confirmation emails.',
}),
```

---

## 3. TypeScript Type Changes

File: `apps/web/types/sanity.ts`

Replace the `SanityEvent` interface:

```typescript
export interface SanityEvent {
  _id: string
  title: string
  slug: string
  start_date: string
  end_date?: string
  location: string
  description: string
  flyer?: SanityImage
  registration_link?: string
  chapter?: string
  is_convention: boolean
  // SPEC-28 fields — all optional (legacy events lack them)
  accessLevel?: 'membersOnly' | 'openToAll'
  registrationFee?: number | null
  registrationCapacity?: number | null
  guestCountEnabled?: boolean
  onlineLink?: string | null
}
```

---

## 4. GROQ Query Changes

File: `apps/web/sanity/lib/queries.ts`

### 4.1 Update `ALL_EVENTS_QUERY` projection

Add after `is_convention`:

```groq
accessLevel,
registrationFee,
registrationCapacity,
guestCountEnabled,
onlineLink
```

### 4.2 Update `EVENT_BY_SLUG_QUERY` projection

Same five fields after `is_convention`.

### 4.3 New `EVENT_BY_ID_QUERY`

```typescript
export const EVENT_BY_ID_QUERY = groq`
  *[_type == "event" && _id == $sanityId][0] {
    _id,
    title,
    "slug": slug.current,
    start_date,
    end_date,
    location,
    description,
    chapter,
    is_convention,
    accessLevel,
    registrationFee,
    registrationCapacity,
    guestCountEnabled,
    onlineLink
  }
`
```

`flyer` is excluded — API routes do not render images.

---

## 5. Zod Validation

### 5.1 New file: `apps/web/lib/validation/event.schema.ts`

```typescript
import { z } from 'zod'

export const MemberRegisterSchema = z.object({
  guestCount: z.number().int().min(0).max(20).optional().default(0),
})
export type MemberRegisterInput = z.infer<typeof MemberRegisterSchema>

export const GuestRegisterSchema = z.object({
  guestName:  z.string().min(1, 'Name is required').max(100),
  guestEmail: z.string().email('Valid email is required'),
  guestCount: z.number().int().min(0).max(20).optional().default(0),
})
export type GuestRegisterInput = z.infer<typeof GuestRegisterSchema>

export const DeregisterSchema = z.object({
  status: z.literal('cancelled'),
})
export type DeregisterInput = z.infer<typeof DeregisterSchema>
```

### 5.2 Update `apps/web/lib/validation/payment.schema.ts`

Line 40 — add `event_registration` to the `paymentType` enum:

```typescript
paymentType: z.enum(['membership', 'upgrade', 'donation', 'event_registration']).optional(),
```

---

## 6. API Contract

### 6.1 `POST /api/events/[sanityId]/register`

**Auth:** `withAuth` (Bearer token required; active membership enforced in handler for `membersOnly` events)

**Request body:** `{ guestCount?: number }`

**Handler logic:**

```
1. MemberRegisterSchema.parse(body) → { guestCount }
2. sanityFetch(EVENT_BY_ID_QUERY, { sanityId }) → event
3. !event → 404
4. event.registrationFee == null → 404 (legacy event)
5. event.accessLevel !== 'openToAll':
     member.memberStatus !== 'active' → 403 { error: 'Active membership required' }
6. findUnique(sanityEventId_memberId):
     existing?.status === 'confirmed' → 409 { error: 'Already registered' }
7. registrationFee === 0 (free path):
     $transaction(async tx => {
       if capacity set: count confirmed; count >= capacity → throw CapacityError
       tx.eventRegistration.upsert(
         where:  sanityEventId_memberId,
         create: { sanityEventId, memberId, guestCount, status: 'confirmed' },
         update: { guestCount, status: 'confirmed', cancelledAt: null }
       )
     }, { isolationLevel: 'Serializable' })
     sendEventRegistrationConfirmation(...).catch(console.error)  // fire-and-forget
     return 200 { redirect: `/events/${event.slug}/success` }
8. registrationFee > 0 (paid path):
     eventRegistration.upsert(
       where:  sanityEventId_memberId,
       create: { sanityEventId, memberId, guestCount, status: 'pending' },
       update: {}   // do not overwrite existing pending row
     )
     url = createEventRegistrationSession(member.id, member.email, sanityEventId, event.title, event.slug, registrationFee, guestCount)
     return 200 { url }
```

**`CapacityError` pattern** — see Section 19.2.

**Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 200 | `{ redirect: string }` | Free — confirmed |
| 200 | `{ url: string }` | Paid — Stripe URL |
| 400 | `{ error: object }` | Validation failure |
| 401 | `{ error: string }` | Missing/invalid token |
| 403 | `{ error: string }` | Non-active on members-only event |
| 404 | `{ error: string }` | Event not found or legacy |
| 409 | `{ error: string }` | At capacity or already registered |

---

### 6.2 `POST /api/events/[sanityId]/register/guest`

**Auth:** None — plain `export async function POST(req, { params })` with no `withAuth` wrapper.

**Request body:** `{ guestName: string; guestEmail: string; guestCount?: number }`

**Handler logic:**

```
1. GuestRegisterSchema.parse(body) → { guestName, guestEmail, guestCount }
2. sanityFetch(EVENT_BY_ID_QUERY, { sanityId }) → event
3. !event → 404
4. event.registrationFee == null → 404
5. event.accessLevel !== 'openToAll' → 403 { error: 'This event is members-only. Please log in to register.' }
6. registrationFee === 0 (free path):
     $transaction(async tx => {
       if capacity set: count confirmed; count >= capacity → throw CapacityError
       tx.eventRegistration.create({ sanityEventId, guestEmail, guestName, guestCount, status: 'confirmed' })
       // P2002 on [sanityEventId, guestEmail] → caught below
     }, { isolationLevel: 'Serializable' })
     sendEventRegistrationConfirmation(...).catch(console.error)
     return 200 { redirect: `/events/${event.slug}/success`, sanityEventId }
7. registrationFee > 0 (paid path):
     url = createEventRegistrationGuestSession(guestEmail, guestName, sanityEventId, event.title, event.slug, registrationFee, guestCount)
     return 200 { url }
```

**Outer catch:** `P2002` → 409 `{ error: 'This email is already registered for this event' }`

**Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 200 | `{ redirect: string; sanityEventId: string }` | Free guest confirmed |
| 200 | `{ url: string }` | Paid — Stripe URL |
| 400 | `{ error: object }` | Validation failure |
| 403 | `{ error: string }` | Members-only event |
| 404 | `{ error: string }` | Event not found or legacy |
| 409 | `{ error: string }` | At capacity or duplicate email |

---

### 6.3 `GET /api/events/[sanityId]/registrations`

**Auth:** `withAuth({ role: 'admin' })`

**Response:**

```typescript
{
  registrations: Array<{
    id: string
    memberId: string | null
    memberName: string | null
    memberEmail: string | null
    guestEmail: string | null
    guestName: string | null
    guestCount: number
    status: 'pending' | 'confirmed' | 'cancelled'
    createdAt: string
    cancelledAt: string | null
  }>
  total: number
  confirmedCount: number
}
```

**Handler logic:**

```
registrations = prisma.eventRegistration.findMany({
  where: { sanityEventId },
  include: { member: { select: { fullName: true, email: true } } },
  orderBy: { createdAt: 'asc' },
})
confirmedCount = registrations.filter(r => r.status === 'confirmed').length
return 200 { registrations: mapped, total: registrations.length, confirmedCount }
```

---

### 6.4 `PATCH /api/admin/events/registrations/[id]`

**Auth:** `withAuth({ role: 'admin' })`

**Request body:** `{ status: 'cancelled' }`

**Handler logic:**

```
1. DeregisterSchema.parse(body)
2. prisma.eventRegistration.update({
     where: { id },
     data: { status: 'cancelled', cancelledAt: new Date() }
   })
3. P2025 (not found) → 404
4. return 200 { registration: updated }
```

**Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 200 | `{ registration: object }` | Success |
| 400 | `{ error: object }` | Invalid body |
| 403 | `{ error: string }` | Not admin |
| 404 | `{ error: string }` | Registration not found |

---

## 7. Stripe Session Functions

File: `apps/web/lib/payments/stripe.ts` — add after `createDonationSession`. `BASE_URL` and `stripe` are already in scope.

### 7.1 `createEventRegistrationSession` (member)

```typescript
export async function createEventRegistrationSession(
  memberId: string,
  memberEmail: string,
  sanityEventId: string,
  eventTitle: string,
  slug: string,
  feeAmountDollars: number,
  guestCount: number = 0,
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    customer_email: memberEmail,
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: `OSA Event Registration — ${eventTitle}` },
        unit_amount: feeAmountDollars * 100,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${BASE_URL}/events/${slug}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${BASE_URL}/events/${slug}`,
    metadata: {
      paymentType:  'event_registration',
      memberId,
      sanityEventId,
      slug,
      guestCount:   String(guestCount),
    },
  })
  return session.url!
}
```

### 7.2 `createEventRegistrationGuestSession` (guest — no member account)

```typescript
export async function createEventRegistrationGuestSession(
  guestEmail: string,
  guestName: string,
  sanityEventId: string,
  eventTitle: string,
  slug: string,
  feeAmountDollars: number,
  guestCount: number = 0,
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    customer_email: guestEmail,
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: `OSA Event Registration — ${eventTitle}` },
        unit_amount: feeAmountDollars * 100,
      },
      quantity: 1,
    }],
    mode: 'payment',
    // &guest=1 tells success page to set the osa_reg_{id} cookie
    success_url: `${BASE_URL}/events/${slug}/success?session_id={CHECKOUT_SESSION_ID}&guest=1`,
    cancel_url:  `${BASE_URL}/events/${slug}`,
    metadata: {
      paymentType:  'event_registration',
      // memberId absent — webhook uses absence to identify guest path
      sanityEventId,
      slug,
      guestEmail,
      guestName,
      guestCount:   String(guestCount),
    },
  })
  return session.url!
}
```

**Stripe metadata contract:**

| Key | Member session | Guest session |
|-----|---------------|---------------|
| `paymentType` | `'event_registration'` | `'event_registration'` |
| `memberId` | present | absent |
| `sanityEventId` | present | present |
| `slug` | present (for debugging) | present (for debugging) |
| `guestEmail` | absent | present |
| `guestName` | absent | present |
| `guestCount` | string `"0"` | string `"0"` |

---

## 8. Webhook Handler Extension

File: `apps/web/lib/payments/webhook-handlers.ts`

### 8.1 New imports

```typescript
import { prisma }        from '@/lib/db/prisma'
import { sanityFetch }   from '@/sanity/lib/client'
import { EVENT_BY_ID_QUERY } from '@/sanity/lib/queries'
import type { SanityEvent }  from '@/types/sanity'
import { sendEventRegistrationConfirmation } from '@/lib/emails/event-registration-confirmation'
```

### 8.2 `handleCheckoutCompleted` — add branch

Insert before the existing `recordPayment` call:

```typescript
if (paymentType === 'event_registration') {
  await handleEventRegistrationCompleted(session)
  return
}
```

The existing membership/upgrade/donation paths are unchanged.

### 8.3 New private function `handleEventRegistrationCompleted`

```typescript
async function handleEventRegistrationCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const meta          = session.metadata ?? {}
  const memberId      = meta.memberId      || null
  const sanityEventId = meta.sanityEventId || null
  const guestEmail    = meta.guestEmail    || null
  const guestName     = meta.guestName     || null
  const guestCount    = parseInt(meta.guestCount ?? '0', 10)
  const amountCents   = session.amount_total ?? 0

  if (!sanityEventId) {
    console.error('handleEventRegistrationCompleted: missing sanityEventId in metadata', session.id)
    return
  }

  // 1. Record payment (memberId may be null for guests — PaymentRecord.memberId is nullable)
  try {
    await recordPayment({
      memberId,
      stripeSessionId:       session.id,
      stripeEventId:         session.id,
      stripePaymentIntentId: session.payment_intent as string | undefined,
      status:                'completed',
      paymentType:           'event_registration',
      // membershipType null → recordPayment skips membership side-effects
      amountCents,
    })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') return  // duplicate stripeEventId
    throw err
  }

  // 2. Upsert EventRegistration → confirmed
  try {
    if (memberId) {
      await prisma.eventRegistration.upsert({
        where:  { sanityEventId_memberId: { sanityEventId, memberId } },
        create: { sanityEventId, memberId, guestCount, status: 'confirmed', stripeSessionId: session.id },
        update: { status: 'confirmed', stripeSessionId: session.id },
      })
    } else if (guestEmail) {
      await prisma.eventRegistration.upsert({
        where:  { sanityEventId_guestEmail: { sanityEventId, guestEmail } },
        create: { sanityEventId, guestEmail, guestName, guestCount, status: 'confirmed', stripeSessionId: session.id },
        update: { status: 'confirmed', stripeSessionId: session.id },
      })
    } else {
      console.error('handleEventRegistrationCompleted: no memberId or guestEmail', session.id)
      return
    }
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') return
    throw err
  }

  // 3. Confirmation email — fire-and-forget
  sendEventRegistrationConfirmationBySession(session, memberId, sanityEventId, guestEmail, guestName)
    .catch((e) => console.error('handleEventRegistrationCompleted: email failed', e))
}
```

### 8.4 New private helper `sendEventRegistrationConfirmationBySession`

```typescript
async function sendEventRegistrationConfirmationBySession(
  session: Stripe.Checkout.Session,
  memberId: string | null,
  sanityEventId: string,
  guestEmail: string | null,
  guestName: string | null,
): Promise<void> {
  let toEmail: string
  let toName: string | null

  if (memberId) {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { email: true, fullName: true },
    })
    if (!member) return
    toEmail = member.email
    toName  = member.fullName
  } else if (guestEmail) {
    toEmail = guestEmail
    toName  = guestName
  } else {
    return
  }

  const event = await sanityFetch<SanityEvent>(EVENT_BY_ID_QUERY, { sanityId: sanityEventId })
    .catch(() => null)

  await sendEventRegistrationConfirmation({
    to:         toEmail,
    name:       toName,
    eventTitle: event?.title ?? 'OSA Event',
    eventDate:  event?.start_date ?? null,
    location:   event?.location ?? null,
    onlineLink: event?.onlineLink ?? null,
  })
}
```

---

## 9. Email Template

File: `apps/web/lib/emails/event-registration-confirmation.ts` — new file.

Pattern follows `apps/web/lib/payments/receipt.ts`.

```typescript
import { Resend } from 'resend'

const resend   = new Resend(process.env.RESEND_API_KEY)
const FROM     = process.env.RESEND_FROM_EMAIL ?? 'noreply@osa-americas.org'
const ORG_NAME = process.env.RESEND_ORG_NAME  ?? 'The Odisha Society of the Americas'

export interface EventRegistrationConfirmationInput {
  to:         string
  name:       string | null
  eventTitle: string
  eventDate:  string | null
  location:   string | null
  onlineLink: string | null
}

export async function sendEventRegistrationConfirmation(
  input: EventRegistrationConfirmationInput,
): Promise<void> {
  const greeting = input.name ? `Dear ${input.name},` : 'Dear Registrant,'
  const dateStr  = input.eventDate
    ? new Date(input.eventDate).toLocaleDateString('en-US', { dateStyle: 'full' })
    : null

  const lines = [
    greeting,
    '',
    `You are registered for: ${input.eventTitle}`,
    '',
    ...(dateStr          ? [`  Date       : ${dateStr}`]          : []),
    ...(input.location   ? [`  Location   : ${input.location}`]   : []),
    ...(input.onlineLink ? [`  Join online: ${input.onlineLink}`] : []),
    '',
    'We look forward to seeing you there!',
    '',
    'Thank you,',
    ORG_NAME,
  ]

  await resend.emails.send({
    from:    FROM,
    to:      input.to,
    subject: `Registration Confirmed — ${input.eventTitle}`,
    text:    lines.join('\n'),
  })
}
```

---

## 10. Event Detail Page

File: `apps/web/app/events/[slug]/page.tsx` — full replacement.

Key changes from current file:
- Remove `if (!result) redirect('/login')` — auth is now optional
- Remove `MembershipGate` component
- Add `prisma` imports and capacity/registration queries
- Add cookie read for guest "already registered" state
- Render `RegisterSection` when `registrationFee != null`

```typescript
import { notFound }            from 'next/navigation'
import { cookies }             from 'next/headers'
import { getCurrentMember }   from '@/lib/auth/get-current-member'
import { sanityFetch }        from '@/sanity/lib/client'
import { EVENT_BY_SLUG_QUERY } from '@/sanity/lib/queries'
import { prisma }              from '@/lib/db/prisma'
import { urlFor }              from '@/sanity/lib/image'
import type { SanityEvent }   from '@/types/sanity'
import RegisterSection         from './RegisterSection'

export const dynamic = 'force-dynamic'

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug }   = await params
  const authResult = await getCurrentMember()   // null when unauthenticated — no redirect
  const member     = authResult?.member ?? null

  const event = await sanityFetch<SanityEvent>(EVENT_BY_SLUG_QUERY, { slug })
  if (!event) notFound()

  const registrationUiEnabled = event.registrationFee != null

  let isSoldOut           = false
  let isAlreadyRegistered = false

  if (registrationUiEnabled) {
    if (event.registrationCapacity) {
      const confirmedCount = await prisma.eventRegistration.count({
        where: { sanityEventId: event._id, status: 'confirmed' },
      })
      isSoldOut = confirmedCount >= event.registrationCapacity
    }

    if (member) {
      const existing = await prisma.eventRegistration.findUnique({
        where: { sanityEventId_memberId: { sanityEventId: event._id, memberId: member.id } },
      })
      isAlreadyRegistered = existing?.status === 'confirmed'
    }

    if (!isAlreadyRegistered) {
      const cookieStore = await cookies()
      if (cookieStore.get(`osa_reg_${event._id}`)?.value === '1') {
        isAlreadyRegistered = true
      }
    }
  }

  return (
    <main>
      <h1>{event.title}</h1>
      <time>{event.start_date}</time>
      {event.end_date && <time>{event.end_date}</time>}
      <p>{event.location}</p>
      {event.onlineLink && (
        <p>Online: <a href={event.onlineLink}>{event.onlineLink}</a></p>
      )}
      <p>{event.description}</p>
      {event.flyer && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urlFor(event.flyer).url()} alt={`${event.title} flyer`} />
      )}

      {/* Legacy: events without registrationFee use old link */}
      {!registrationUiEnabled && event.registration_link && (
        <a href={event.registration_link}>Register</a>
      )}

      {registrationUiEnabled && (
        <RegisterSection
          sanityEventId={event._id}
          slug={slug}
          accessLevel={event.accessLevel ?? 'membersOnly'}
          registrationFee={event.registrationFee!}
          guestCountEnabled={event.guestCountEnabled ?? false}
          isSoldOut={isSoldOut}
          isAlreadyRegistered={isAlreadyRegistered}
          memberStatus={member?.memberStatus ?? null}
          isAuthenticated={member !== null}
        />
      )}
    </main>
  )
}
```

---

## 11. `RegisterSection` Client Component

File: `apps/web/app/events/[slug]/RegisterSection.tsx` — new file.

```typescript
'use client'

import { useState } from 'react'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'

export interface RegisterSectionProps {
  sanityEventId:      string
  slug:               string
  accessLevel:        'membersOnly' | 'openToAll'
  registrationFee:    number
  guestCountEnabled:  boolean
  isSoldOut:          boolean
  isAlreadyRegistered: boolean
  memberStatus:       string | null
  isAuthenticated:    boolean
}

function extractError(data: unknown): string {
  if (typeof data === 'string') return data
  if (data && typeof data === 'object' && 'error' in data) {
    const err = (data as { error: unknown }).error
    if (typeof err === 'string') return err
    if (err && typeof err === 'object' && 'formErrors' in err) {
      return (err as { formErrors: string[] }).formErrors.join(', ') || 'Check your inputs.'
    }
  }
  return 'Something went wrong.'
}

function GuestCountInput({
  value, onChange,
}: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label>
        Additional guests (beyond yourself)
        <input
          type="number" min={0} max={20} value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        />
      </label>
    </div>
  )
}

function MemberRegisterButton({
  sanityEventId, registrationFee, guestCountEnabled,
}: { sanityEventId: string; registrationFee: number; guestCountEnabled: boolean }) {
  const [guestCount, setGuestCount] = useState(0)
  const [error,      setError]      = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const supabase = createSupabaseBrowser()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Session expired. Please log in again.'); return }

      const res = await fetch(`/api/events/${sanityEventId}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ guestCount }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(extractError(data)); return }
      if (data.url)           window.location.href = data.url
      else if (data.redirect) window.location.href = data.redirect
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {guestCountEnabled && (
        <GuestCountInput value={guestCount} onChange={setGuestCount} />
      )}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting
          ? 'Registering...'
          : registrationFee > 0
          ? `Register — $${registrationFee}`
          : 'Register (Free)'}
      </button>
    </form>
  )
}

export default function RegisterSection({
  sanityEventId, slug, accessLevel, registrationFee,
  guestCountEnabled, isSoldOut, isAlreadyRegistered,
  memberStatus, isAuthenticated,
}: RegisterSectionProps) {
  const [guestCount, setGuestCount] = useState(0)
  const [guestName,  setGuestName]  = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [error,      setError]      = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (isSoldOut)           return <p>Sold Out</p>
  if (isAlreadyRegistered) return <p>You are registered.</p>

  if (accessLevel === 'membersOnly') {
    if (!isAuthenticated)          return <p><a href="/login">Log in to register</a></p>
    if (memberStatus !== 'active') return <p>Active membership required. <a href="/membership">Become a member</a></p>
    return (
      <MemberRegisterButton
        sanityEventId={sanityEventId}
        registrationFee={registrationFee}
        guestCountEnabled={guestCountEnabled}
      />
    )
  }

  // openToAll — authenticated active member uses the member endpoint
  if (isAuthenticated && memberStatus === 'active') {
    return (
      <MemberRegisterButton
        sanityEventId={sanityEventId}
        registrationFee={registrationFee}
        guestCountEnabled={guestCountEnabled}
      />
    )
  }

  // openToAll — unauthenticated or non-active → guest form
  async function handleGuestSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/events/${sanityEventId}/register/guest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestName, guestEmail, guestCount }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(extractError(data)); return }
      if (data.url) {
        window.location.href = data.url
      } else if (data.redirect) {
        // Append ?guest=1 so the success page sets the osa_reg_{id} cookie
        window.location.href = data.redirect + '?guest=1'
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleGuestSubmit}>
      <div>
        <label>Name<br />
          <input
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            required maxLength={100}
          />
        </label>
      </div>
      <div>
        <label>Email<br />
          <input
            type="email" value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            required maxLength={255}
          />
        </label>
      </div>
      {guestCountEnabled && (
        <GuestCountInput value={guestCount} onChange={setGuestCount} />
      )}
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting
          ? 'Registering...'
          : registrationFee > 0
          ? `Register — $${registrationFee}`
          : 'Register (Free)'}
      </button>
    </form>
  )
}
```

---

## 12. Success Page

File: `apps/web/app/events/[slug]/success/page.tsx` — new file.

The `?guest=1` query param is set by two paths:
- Free guest: `RegisterSection` appends `?guest=1` to `data.redirect` before navigating
- Paid guest: `createEventRegistrationGuestSession` embeds `&guest=1` in `success_url`

```typescript
import { cookies }             from 'next/headers'
import { sanityFetch }        from '@/sanity/lib/client'
import { EVENT_BY_SLUG_QUERY } from '@/sanity/lib/queries'
import type { SanityEvent }   from '@/types/sanity'

export const dynamic = 'force-dynamic'

export default async function EventSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ session_id?: string; guest?: string }>
}) {
  const { slug } = await params
  const sp       = await searchParams
  const isGuest  = sp.guest === '1'

  const event = await sanityFetch<SanityEvent>(EVENT_BY_SLUG_QUERY, { slug })

  if (event?._id && isGuest) {
    const cookieStore = await cookies()
    cookieStore.set(`osa_reg_${event._id}`, '1', {
      maxAge:   60 * 60 * 24 * 365,  // 1 year
      httpOnly: true,
      sameSite: 'lax',
      path:     '/',
    })
  }

  return (
    <main>
      <h1>Registration Confirmed</h1>
      <p>You are registered for {event?.title ?? 'this event'}.</p>
      <p>A confirmation email has been sent to you.</p>
      <p><a href={`/events/${slug}`}>Back to event</a></p>
      <p><a href="/events">All events</a></p>
    </main>
  )
}
```

---

## 13. Admin Events Page

File: `apps/web/app/admin/events/page.tsx` — full replacement.

Auth pattern from `apps/web/app/admin/services/page.tsx`: `getCurrentMember` + role check, no HTTP fetch.

```typescript
import { redirect }           from 'next/navigation'
import { getCurrentMember }  from '@/lib/auth/get-current-member'
import { sanityFetch }       from '@/sanity/lib/client'
import { ALL_EVENTS_QUERY }  from '@/sanity/lib/queries'
import { prisma }            from '@/lib/db/prisma'
import type { SanityEvent } from '@/types/sanity'

export const dynamic = 'force-dynamic'

export default async function AdminEventsPage() {
  const result = await getCurrentMember()
  if (!result || result.member.role !== 'admin') redirect('/dashboard')

  const events = (await sanityFetch<SanityEvent[]>(ALL_EVENTS_QUERY)) ?? []

  // Single aggregate query — no N+1 per event
  const counts = await prisma.eventRegistration.groupBy({
    by:    ['sanityEventId'],
    where: { status: 'confirmed' },
    _count: { id: true },
  })
  const countMap = new Map(counts.map((c) => [c.sanityEventId, c._count.id]))

  return (
    <main>
      <h1>Events</h1>
      <table border={1} cellPadding={4}>
        <thead>
          <tr>
            <th>Title</th><th>Date</th><th>Access</th><th>Fee</th>
            <th>Confirmed</th><th>Capacity</th><th></th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e._id}>
              <td>{e.title}</td>
              <td>{e.start_date}</td>
              <td>{e.accessLevel ?? 'membersOnly'}</td>
              <td>{e.registrationFee != null ? `$${e.registrationFee}` : '—'}</td>
              <td>{e.registrationFee != null ? (countMap.get(e._id) ?? 0) : '—'}</td>
              <td>{e.registrationCapacity ?? '\u221e'}</td>
              <td>
                {e.registrationFee != null && (
                  <a href={`/admin/events/${e._id}`}>Registrants</a>
                )}
              </td>
            </tr>
          ))}
          {events.length === 0 && (
            <tr><td colSpan={7}>No events found.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  )
}
```

---

## 14. Admin Event Registrants Page

File: `apps/web/app/admin/events/[sanityId]/page.tsx` — new file.

Uses HTTP fetch to the admin registrations API route (matching pattern from `apps/web/app/admin/members/[id]/page.tsx`).

```typescript
import { redirect }              from 'next/navigation'
import { revalidatePath }       from 'next/cache'
import { getCurrentMember }    from '@/lib/auth/get-current-member'
import { createSupabaseServer } from '@/lib/auth/supabase-server'
import { formatDate }           from '@/lib/utils/date'

export const dynamic = 'force-dynamic'

interface Registrant {
  id: string; memberId: string | null; memberName: string | null
  memberEmail: string | null; guestEmail: string | null; guestName: string | null
  guestCount: number; status: string; createdAt: string; cancelledAt: string | null
}

export default async function AdminEventRegistrantsPage({
  params,
}: {
  params: Promise<{ sanityId: string }>
}) {
  const result = await getCurrentMember()
  if (!result || result.member.role !== 'admin') redirect('/dashboard')

  const { sanityId } = await params

  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const headers = { Authorization: `Bearer ${session.access_token}` }

  const { registrations = [], total = 0, confirmedCount = 0 } = await fetch(
    `${baseUrl}/api/events/${sanityId}/registrations`,
    { headers, cache: 'no-store' }
  ).then((r) => r.json())

  async function deregister(formData: FormData) {
    'use server'
    const registrationId = formData.get('registrationId') as string
    const supabase2 = await createSupabaseServer()
    const { data: { session: s } } = await supabase2.auth.getSession()
    if (!s) return
    const base = process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const h = { Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }
    await fetch(`${base}/api/admin/events/registrations/${registrationId}`, {
      method: 'PATCH', headers: h, body: JSON.stringify({ status: 'cancelled' }),
    })
    revalidatePath(`/admin/events/${sanityId}`)
  }

  return (
    <main>
      <p><a href="/admin/events">Back to events</a></p>
      <h1>Registrants ({confirmedCount} confirmed / {total} total)</h1>
      <table border={1} cellPadding={4}>
        <thead>
          <tr>
            <th>Name</th><th>Email</th><th>+Guests</th><th>Status</th><th>Registered</th><th></th>
          </tr>
        </thead>
        <tbody>
          {(registrations as Registrant[]).map((r) => (
            <tr key={r.id}>
              <td>{r.memberName ?? r.guestName ?? '—'}</td>
              <td>{r.memberEmail ?? r.guestEmail ?? '—'}</td>
              <td>{r.guestCount}</td>
              <td>{r.status}</td>
              <td>{formatDate(r.createdAt, '—')}</td>
              <td>
                {r.status === 'confirmed' && (
                  <form action={deregister}>
                    <input type="hidden" name="registrationId" value={r.id} />
                    <button type="submit">Deregister</button>
                  </form>
                )}
              </td>
            </tr>
          ))}
          {registrations.length === 0 && (
            <tr><td colSpan={6}>No registrations yet.</td></tr>
          )}
        </tbody>
      </table>
    </main>
  )
}
```

---

## 15. Admin Layout Update

File: `apps/web/app/admin/layout.tsx`

Add Events link after the Payments link:

```typescript
{' | '}
<a href="/admin/events">Events</a>
```

---

## 16. Data Flow Diagrams

### 16.1 Free Member Registration

```
Browser (RegisterSection — MemberRegisterButton)
  POST /api/events/{sanityId}/register
  Authorization: Bearer {token}
  body: { guestCount: 0 }
     │
  withAuth → member row (memberStatus: 'active')
  sanityFetch(EVENT_BY_ID_QUERY) → { registrationFee: 0, accessLevel: 'membersOnly' }
  accessLevel check → pass (member is active)
  findUnique existing → null
  $transaction(Serializable):
    count confirmed → 0 < capacity (or no capacity)
    eventRegistration.upsert → { status: 'confirmed' }
  sendEventRegistrationConfirmation().catch()  ← fire-and-forget
  return 200 { redirect: '/events/annual-gala/success' }
     │
window.location.href = '/events/annual-gala/success'
     │
/events/annual-gala/success (server RSC)
  no ?guest=1 → no cookie set
  render "Registration Confirmed"
```

### 16.2 Paid Member Registration

```
Browser
  POST /api/events/{sanityId}/register
  body: { guestCount: 2 }
     │
  withAuth → member (active)
  sanityFetch → { registrationFee: 50 }
  eventRegistration.upsert → { status: 'pending' }
  createEventRegistrationSession() → Stripe session URL
  return 200 { url: 'https://checkout.stripe.com/...' }
     │
window.location.href = Stripe URL
     │
[user pays on Stripe]
     │
Stripe webhook → POST /api/webhooks/stripe
  handleCheckoutCompleted(session)
    paymentType === 'event_registration' → handleEventRegistrationCompleted
      recordPayment({ paymentType: 'event_registration', memberId, amountCents: 5000 })
      eventRegistration.upsert(sanityEventId_memberId) → { status: 'confirmed' }
      sendEventRegistrationConfirmationBySession().catch()
     │
Stripe redirects → /events/annual-gala/success?session_id=cs_xxx
  no ?guest=1 → no cookie set
  render "Registration Confirmed"
```

### 16.3 Free Guest Registration

```
Browser (RegisterSection — guest form, no auth)
  POST /api/events/{sanityId}/register/guest
  body: { guestName: 'Priya', guestEmail: 'p@example.com', guestCount: 0 }
     │
  GuestRegisterSchema.parse → valid
  sanityFetch → { accessLevel: 'openToAll', registrationFee: 0 }
  accessLevel check → pass
  $transaction(Serializable):
    count confirmed → 0 < capacity
    eventRegistration.create → { guestEmail, status: 'confirmed' }
  sendEventRegistrationConfirmation().catch()
  return 200 { redirect: '/events/summer-picnic/success', sanityEventId: 'abc123' }
     │
window.location.href = '/events/summer-picnic/success?guest=1'
     │
/events/summer-picnic/success?guest=1 (server RSC)
  sanityFetch(EVENT_BY_SLUG_QUERY) → event._id = 'abc123'
  cookies().set('osa_reg_abc123', '1', { maxAge: 1yr })
  render "Registration Confirmed"
```

### 16.4 Paid Guest Registration

```
Browser (guest form)
  POST /api/events/{sanityId}/register/guest
  body: { guestName: 'Priya', guestEmail: 'p@example.com', guestCount: 0 }
     │
  sanityFetch → { accessLevel: 'openToAll', registrationFee: 25 }
  createEventRegistrationGuestSession(guestEmail, guestName, ...)
    Stripe metadata: { paymentType: 'event_registration', guestEmail, guestName, sanityEventId }
    success_url: .../success?session_id={ID}&guest=1
  return 200 { url: 'https://checkout.stripe.com/...' }
     │
[user pays]
     │
Stripe webhook → handleEventRegistrationCompleted
  memberId = null → guest path
  recordPayment({ memberId: null, paymentType: 'event_registration', amountCents: 2500 })
  eventRegistration.upsert(sanityEventId_guestEmail) → { status: 'confirmed' }
  sendEventRegistrationConfirmationBySession().catch()
     │
Stripe → /events/summer-picnic/success?session_id=cs_xxx&guest=1
  cookie set: osa_reg_abc123=1
```

---

## 17. File-by-File Implementation Plan

| # | File | Action | Key details |
|---|------|--------|-------------|
| 1 | `apps/web/prisma/schema.prisma` | Modify | Add `event_registration` to `PaymentType`; add `EventRegistrationStatus` enum; add `EventRegistration` model; add `eventRegistrations` relation to `Member` |
| 2 | `apps/web/sanity/schemas/event.ts` | Modify | Append 5 `defineField` entries after `is_convention` |
| 3 | `apps/web/types/sanity.ts` | Modify | Add 5 optional fields to `SanityEvent` |
| 4 | `apps/web/sanity/lib/queries.ts` | Modify | Add 5 fields to `ALL_EVENTS_QUERY` + `EVENT_BY_SLUG_QUERY`; add `EVENT_BY_ID_QUERY` |
| 5 | `apps/web/lib/validation/event.schema.ts` | Create | `MemberRegisterSchema`, `GuestRegisterSchema`, `DeregisterSchema` |
| 6 | `apps/web/lib/validation/payment.schema.ts` | Modify | Add `event_registration` to `ListPaymentsQuerySchema.paymentType` |
| 7 | `apps/web/lib/payments/stripe.ts` | Modify | Add `createEventRegistrationSession`, `createEventRegistrationGuestSession` |
| 8 | `apps/web/lib/emails/event-registration-confirmation.ts` | Create | `sendEventRegistrationConfirmation` |
| 9 | `apps/web/lib/payments/webhook-handlers.ts` | Modify | Add branch + `handleEventRegistrationCompleted` + helper |
| 10 | `apps/web/app/api/events/[sanityId]/register/route.ts` | Create | `POST = withAuth(handler)` — member registration |
| 11 | `apps/web/app/api/events/[sanityId]/register/guest/route.ts` | Create | Plain `POST` — guest registration |
| 12 | `apps/web/app/api/events/[sanityId]/registrations/route.ts` | Create | `GET = withAuth(handler, { role: 'admin' })` |
| 13 | `apps/web/app/api/admin/events/registrations/[id]/route.ts` | Create | `PATCH = withAuth(handler, { role: 'admin' })` |
| 14 | `apps/web/app/events/[slug]/page.tsx` | Replace | Public, optional auth, capacity + cookie checks, `RegisterSection` |
| 15 | `apps/web/app/events/[slug]/RegisterSection.tsx` | Create | Client component, all FR-11 CTA states |
| 16 | `apps/web/app/events/[slug]/success/page.tsx` | Create | Cookie set for guests, static confirmation |
| 17 | `apps/web/app/admin/events/page.tsx` | Replace | Event list + groupBy counts |
| 18 | `apps/web/app/admin/events/[sanityId]/page.tsx` | Create | Registrant list + deregister server action |
| 19 | `apps/web/app/admin/layout.tsx` | Modify | Add Events nav link |

---

## 18. Test Cases (RED Tests for Phase 3)

### 18.1 Member register route — `apps/web/app/api/events/[sanityId]/register/route.test.ts`

```
REG-01: active member + free event → 200 { redirect }, EventRegistration.status === 'confirmed'
REG-02: active member + paid event → 200 { url } (Stripe URL), EventRegistration.status === 'pending'
REG-03: expired member + membersOnly event → 403
REG-04: event at capacity → 409 { error: 'Event is at capacity' }
REG-05: member already confirmed → 409 { error: 'Already registered' }
REG-06: event.registrationFee === null → 404
REG-07: no Authorization header → 401
REG-08: active member + openToAll event + non-active is NOT blocked (gate only for membersOnly)
REG-09: guestCount: 3 → EventRegistration.guestCount === 3
```

### 18.2 Guest register route — `apps/web/app/api/events/[sanityId]/register/guest/route.test.ts`

```
GUEST-01: open event + free → 200 { redirect, sanityEventId }, EventRegistration.status === 'confirmed'
GUEST-02: open event + paid → 200 { url }
GUEST-03: membersOnly event → 403
GUEST-04: duplicate guestEmail → 409
GUEST-05: event at capacity → 409
GUEST-06: missing guestName → 400
GUEST-07: invalid email format → 400
GUEST-08: event.registrationFee === null → 404
```

### 18.3 Admin deregister route — `apps/web/app/api/admin/events/registrations/[id]/route.test.ts`

```
DEREG-01: admin + confirmed registration → 200, status === 'cancelled', cancelledAt set
DEREG-02: member role (non-admin) → 403
DEREG-03: registration id not found → 404
DEREG-04: body { status: 'confirmed' } → 400 (literal schema rejects non-'cancelled')
```

### 18.4 Webhook additions — additions to `apps/web/lib/payments/webhook-handlers.test.ts`

```
WEBHOOK-01: event_registration + memberId → upserts EventRegistration by memberId, creates PaymentRecord
WEBHOOK-02: event_registration + guestEmail (no memberId) → upserts EventRegistration by guestEmail, PaymentRecord.memberId === null
WEBHOOK-03: duplicate stripeEventId (P2002 on recordPayment) → returns without throwing (idempotent)
WEBHOOK-04: missing sanityEventId in metadata → logs error, returns without throwing
WEBHOOK-05: paymentType === 'membership' → does NOT call handleEventRegistrationCompleted (existing test unchanged)
```

### 18.5 Zod schema unit tests — `apps/web/lib/validation/event.schema.test.ts`

```
ZOD-01: MemberRegisterSchema with no body → { guestCount: 0 } (default)
ZOD-02: GuestRegisterSchema with valid fields → passes
ZOD-03: GuestRegisterSchema with invalid email → fails with 'Valid email is required'
ZOD-04: GuestRegisterSchema missing guestName → fails
ZOD-05: DeregisterSchema { status: 'cancelled' } → passes
ZOD-06: DeregisterSchema { status: 'confirmed' } → fails
```

### 18.6 Playwright E2E — `apps/web/e2e/event-registration.spec.ts`

```
E2E-01: active member registers for free membersOnly event → success page visible, "You are registered" shown on return
E2E-02: guest registers for free openToAll event → success page visible, cookie osa_reg_{id} set, "You are registered" shown on return
E2E-03: unauthenticated user visits membersOnly event detail → sees "Log in to register" (no event body gate)
E2E-04: unauthenticated user visits openToAll event detail → sees guest registration form
```

---

## 19. Build Sequence (TDD Checklist)

- [ ] **1** — Add `event_registration` to `PaymentType` enum + `EventRegistrationStatus` enum + `EventRegistration` model + `Member.eventRegistrations` relation; run `prisma db push && prisma generate`
- [ ] **2** — Write ZOD-01–06 tests; create `lib/validation/event.schema.ts`; green
- [ ] **3** — Update `lib/validation/payment.schema.ts` (add `event_registration`); write test that `ListPaymentsQuerySchema` accepts `event_registration`; green
- [ ] **4** — Add Sanity schema fields (manual Sanity Studio verification)
- [ ] **5** — Add TypeScript fields to `SanityEvent`; add `EVENT_BY_ID_QUERY` to `queries.ts`; TS compilation is the test
- [ ] **6** — Write test for `createEventRegistrationSession` metadata shape; add both Stripe functions to `stripe.ts`; green
- [ ] **7** — Write test for `sendEventRegistrationConfirmation` email subject/body; create `lib/emails/event-registration-confirmation.ts`; green
- [ ] **8** — Write REG-07 (401 unauthenticated); create `app/api/events/[sanityId]/register/route.ts` with `withAuth` shell; green
- [ ] **9** — Write REG-01 (free member → 200); implement free path with serializable transaction; green
- [ ] **10** — Write REG-03 (non-active → 403); implement membership gate; green
- [ ] **11** — Write REG-04 (capacity → 409); implement `CapacityError` sentinel in transaction; green
- [ ] **12** — Write REG-05 (already registered → 409); implement existing-row check; green
- [ ] **13** — Write REG-02 (paid → 200 + url); implement pending row + Stripe session; green
- [ ] **14** — Write GUEST-03 (membersOnly → 403); create `app/api/events/[sanityId]/register/guest/route.ts`; green
- [ ] **15** — Write GUEST-01 (free guest → 200); implement free guest path; green
- [ ] **16** — Write GUEST-04 (duplicate email → 409); verify P2002 catch; green
- [ ] **17** — Write GUEST-02 (paid guest → 200); implement paid guest path; green
- [ ] **18** — Write admin registrations GET test (403 for non-admin; 200 with list for admin); create `app/api/events/[sanityId]/registrations/route.ts`; green
- [ ] **19** — Write DEREG-01–04 tests; create `app/api/admin/events/registrations/[id]/route.ts`; green
- [ ] **20** — Write WEBHOOK-01–05 tests; update `lib/payments/webhook-handlers.ts`; green
- [ ] **21** — Replace `app/events/[slug]/page.tsx`; manual browser test: public visibility, all FR-11 states
- [ ] **22** — Create `app/events/[slug]/RegisterSection.tsx`; manual browser test: form submits, Stripe redirect works
- [ ] **23** — Create `app/events/[slug]/success/page.tsx`; manual browser test: cookie set on `?guest=1`
- [ ] **24** — Replace `app/admin/events/page.tsx`; manual browser test: counts correct
- [ ] **25** — Create `app/admin/events/[sanityId]/page.tsx`; manual browser test: deregister works
- [ ] **26** — Update `app/admin/layout.tsx` with Events nav link
- [ ] **27** — Write E2E-01 and E2E-02 Playwright specs; run `pnpm test:e2e --filter=web`; green
- [ ] **28** — Run full test suite: `pnpm --filter=web test`; all pass

---

## 20. Critical Details

### 20.1 `accessLevel` Gate Logic

In the member register route: use `event.accessLevel !== 'openToAll'` for the membership gate. This treats `undefined` (legacy events) the same as `'membersOnly'` — closed by default.

In the guest register route: use strict `event.accessLevel === 'openToAll'`. `undefined` blocks guests. This is the safe default.

### 20.2 `CapacityError` Sentinel Pattern

Both register routes use this pattern to communicate capacity violations from inside the serializable transaction:

```typescript
class CapacityError extends Error {
  constructor() { super('Event is at capacity'); this.name = 'CapacityError' }
}

try {
  await prisma.$transaction(async (tx) => {
    if (event.registrationCapacity) {
      const count = await tx.eventRegistration.count({
        where: { sanityEventId, status: 'confirmed' },
      })
      if (count >= event.registrationCapacity) throw new CapacityError()
    }
    // ... create/upsert
  }, { isolationLevel: 'Serializable' })
} catch (err) {
  if (err instanceof CapacityError) return jsonResponse(409, { error: err.message })
  if ((err as { code?: string }).code === 'P2002') return jsonResponse(409, { error: 'Already registered for this event' })
  throw err
}
```

### 20.3 `guestCount` Semantics

`guestCount` = additional attendees beyond the registrant. `0` = registrant only. UI label: "How many additional guests are joining you?". Capacity enforcement counts `EventRegistration` rows (one per registrant), not total headcount.

### 20.4 Null Safety on `registrationFee`

The gate check `event.registrationFee != null` (double-equals) catches both `null` and `undefined`. Sanity returns `null` for a number field that has been explicitly cleared; GROQ returns `undefined` for a field that has never been set (legacy events before the schema addition). Both must be treated as "no registration UI". Do NOT use `=== 0` as the free check — `0` means free with registration; `null`/`undefined` means legacy.

### 20.5 Webhook Imports

`webhook-handlers.ts` currently imports only from `payment-service`. After this change it needs `prisma`, `sanityFetch`, `EVENT_BY_ID_QUERY`, `SanityEvent`, and `sendEventRegistrationConfirmation`. This is the most significant import surface change in the spec.

### 20.6 `recordPayment` with `event_registration`

`recordPayment`'s side-effect guard at line 222 of `payment-service.ts`:

```typescript
if (input.status === 'completed' && input.memberId && membershipType) {
  // activate/upgrade membership
}
```

For `event_registration`, `membershipType` is `undefined` (not passed in the call) — the guard evaluates to `false` and no membership side-effects occur. No changes to `recordPayment` are needed.

### 20.7 Prisma Unique Index Names for `upsert`

Prisma generates composite unique index names from the field names. The `where` clause in `upsert` calls must use these names:

| Constraint | Prisma where key |
|------------|-----------------|
| `@@unique([sanityEventId, memberId])` | `sanityEventId_memberId` |
| `@@unique([sanityEventId, guestEmail])` | `sanityEventId_guestEmail` |

These are the generated names based on Prisma's `fieldA_fieldB` convention.

### 20.8 `event_registration` in `PaymentType` Enum at Build Time

The `stripe.ts` file uses `MembershipType` from `@prisma/client`. After `prisma generate`, `PaymentType` will include `event_registration`. Existing references to `PaymentType` in TypeScript code will need to handle the new value — the `handlePaymentFailed` fallback `paymentType ?? 'membership'` is a pre-existing issue that is out of scope.

### 20.9 Sanity `_id` Format

Published Sanity document IDs are bare UUIDs — no `drafts.` prefix. The `[sanityId]` URL segments use these bare IDs directly. No stripping is needed.

### 20.10 Email Failure Handling

- Free registration path: email is called with `.catch(console.error)` — failure does not block the 200 response
- Paid registration (webhook) path: `sendEventRegistrationConfirmationBySession().catch(...)` — failure does not block the webhook 200 response
- Sanity unavailable in webhook: `sanityFetch(...).catch(() => null)` — email sends with fallback text `'OSA Event'`

---

*Phase 2 Design complete. Awaiting human approval before Phase 3 (Implementation).*
agentId: ae4d7a0041725e67e (use SendMessage with to: 'ae4d7a0041725e67e' to continue this agent)
<usage>subagent_tokens: 123340
