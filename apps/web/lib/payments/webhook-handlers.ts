import type Stripe from 'stripe'
import { prisma }       from '@/lib/db/prisma'
import { sanityFetch }  from '@/sanity/lib/client'
import { EVENT_BY_ID_QUERY } from '@/sanity/lib/queries'
import { recordPayment } from './payment-service'
import { sendEventRegistrationConfirmation } from '@/lib/emails/event-registration-confirmation'
import type { MembershipType, PaymentType } from '@prisma/client'
import type { SanityEvent } from '@/types/sanity'

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const meta = session.metadata ?? {}
  const memberId      = meta.memberId      || null
  const paymentType   = meta.paymentType   as PaymentType | undefined
  const membershipType = meta.membershipType as MembershipType | undefined

  if (!paymentType) return

  // Branch: event registration is handled separately — does not touch membership state
  if (paymentType === 'event_registration') {
    await handleEventRegistrationCompleted(session)
    return
  }

  const amountCents = session.amount_total ?? 0
  const stripeEventId = session.id

  try {
    await recordPayment({
      memberId,
      stripeSessionId:       session.id,
      stripeEventId,
      stripePaymentIntentId: session.payment_intent as string | undefined,
      status:                'completed',
      paymentType,
      membershipType,
      amountCents,
    })
  } catch (err: unknown) {
    // P2002 = unique constraint violation → duplicate event, safe to ignore
    if ((err as { code?: string }).code === 'P2002') return
    throw err
  }
}

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

  // 1. Record payment (memberId may be null for guests)
  try {
    await recordPayment({
      memberId,
      stripeSessionId:       session.id,
      stripeEventId:         session.id,
      stripePaymentIntentId: session.payment_intent as string | undefined,
      status:                'completed',
      paymentType:           'event_registration',
      amountCents,
    })
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'P2002') return // duplicate stripeEventId
    throw err
  }

  // 2. Upsert EventRegistration → confirmed
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
    console.error('handleEventRegistrationCompleted: no memberId or guestEmail in metadata', session.id)
    return
  }

  // 3. Send confirmation email — fire-and-forget; Sanity unavailable → fallback title
  sendEventRegistrationBySessionId(session.id, memberId, guestEmail, guestName, sanityEventId).catch(console.error)
}

async function sendEventRegistrationBySessionId(
  _sessionId: string,
  memberId: string | null,
  guestEmail: string | null,
  guestName: string | null,
  sanityEventId: string,
): Promise<void> {
  // Fetch recipient details
  let toEmail: string | null = guestEmail
  let toName:  string | null = guestName

  if (memberId) {
    const member = await prisma.member.findUnique({
      where:  { id: memberId },
      select: { email: true, fullName: true },
    })
    toEmail = member?.email ?? null
    toName  = member?.fullName ?? null
  }

  if (!toEmail) return

  // Fetch event details from Sanity (best-effort)
  const event = await sanityFetch<SanityEvent>(EVENT_BY_ID_QUERY, { sanityId: sanityEventId })
    .catch(() => null)

  await sendEventRegistrationConfirmation({
    to:         toEmail,
    name:       toName,
    eventTitle: event?.title    ?? 'OSA Event',
    eventDate:  event?.start_date ?? null,
    location:   event?.location   ?? null,
    onlineLink: event?.onlineLink  ?? null,
  })
}

export async function handlePaymentFailed(session: Stripe.Checkout.Session): Promise<void> {
  const meta = session.metadata ?? {}
  const paymentType    = meta.paymentType   as PaymentType | undefined
  const membershipType = meta.membershipType as MembershipType | undefined

  await prisma.paymentRecord.upsert({
    where: { stripeEventId: session.id },
    update: { status: 'failed' },
    create: {
      memberId:        meta.memberId || null,
      stripeSessionId: session.id,
      stripeEventId:   session.id,
      status:          'failed',
      paymentType:     paymentType ?? 'membership',
      membershipType,
      amountCents:     session.amount_total ?? 0,
    },
  })
}
