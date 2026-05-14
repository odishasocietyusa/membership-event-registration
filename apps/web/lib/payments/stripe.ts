import Stripe from 'stripe'
import type { MembershipType } from '@prisma/client'

if (!process.env.STRIPE_SECRET_KEY && process.env.NODE_ENV !== 'test') {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2025-04-30.basil',
})

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export async function createCheckoutSession(
  memberId: string,
  memberEmail: string,
  membershipType: MembershipType,
  feeAmountDollars: number,
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    customer_email: memberEmail,
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `OSA ${membershipType} Membership` },
          unit_amount: feeAmountDollars * 100,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${BASE_URL}/membership/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/membership`,
    metadata: {
      memberId,
      paymentType: 'membership',
      membershipType,
    },
  })
  return session.url!
}

export async function createUpgradeSession(
  memberId: string,
  memberEmail: string,
  upgradeCostCents: number,
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    customer_email: memberEmail,
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: 'OSA Life Membership Upgrade' },
          unit_amount: upgradeCostCents,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${BASE_URL}/membership/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/membership`,
    metadata: {
      memberId,
      paymentType: 'upgrade',
      membershipType: 'life',
    },
  })
  return session.url!
}

export async function createDonationSession(
  amountCents: number,
  memberId?: string | null,
  memberEmail?: string | null,
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    ...(memberEmail ? { customer_email: memberEmail } : {}),
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: 'Donation to OSA' },
          unit_amount: amountCents,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${BASE_URL}/donate/thank-you?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${BASE_URL}/donate`,
    metadata: {
      paymentType: 'donation',
      ...(memberId ? { memberId } : {}),
    },
  })
  return session.url!
}

export async function issueRefund(
  stripePaymentIntentId: string,
  refundAmountCents: number,
): Promise<Stripe.Refund> {
  return stripe.refunds.create({
    payment_intent: stripePaymentIntentId,
    amount: refundAmountCents,
  })
}
