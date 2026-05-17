import Stripe from 'stripe'
import type { MembershipType } from '@prisma/client'

// Uses a placeholder key at build time; real requests require STRIPE_SECRET_KEY to be set
export const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder_build',
  { apiVersion: '2025-11-17.clover' },
)

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

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
    success_url: `${BASE_URL}/membership/success`,
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
  targetType: 'life' | 'patron' | 'benefactor' = 'life',
): Promise<string> {
  const label = targetType.charAt(0).toUpperCase() + targetType.slice(1)
  const session = await stripe.checkout.sessions.create({
    customer_email: memberEmail,
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: `OSA ${label} Membership Upgrade` },
          unit_amount: upgradeCostCents,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${BASE_URL}/membership/success`,
    cancel_url: `${BASE_URL}/membership`,
    metadata: {
      memberId,
      paymentType: 'upgrade',
      membershipType: targetType,
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
