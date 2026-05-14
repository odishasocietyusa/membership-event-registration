import type Stripe from 'stripe'
import { prisma } from '@/lib/db/prisma'
import { recordPayment } from './payment-service'
import type { MembershipType, PaymentType } from '@prisma/client'

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const meta = session.metadata ?? {}
  const memberId      = meta.memberId      || null
  const paymentType   = meta.paymentType   as PaymentType | undefined
  const membershipType = meta.membershipType as MembershipType | undefined

  if (!paymentType) return

  const amountCents = session.amount_total ?? 0
  const stripeEventId = session.id // session ID is the idempotency key at this stage;
  // the webhook handler passes the Stripe Event ID separately (see route)

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
