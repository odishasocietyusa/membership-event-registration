import { withAuth } from '@/lib/auth/with-auth'
import { prisma } from '@/lib/db/prisma'
import { issueRefund } from '@/lib/payments/stripe'
import { RefundSchema } from '@/lib/validation/payment.schema'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST = withAuth(async (req, { user }) => {
  const id = req.url.split('/payments/')[1]?.split('/')[0]
  if (!id) return jsonResponse(400, { error: 'Missing payment ID' })

  let body: unknown
  try { body = await req.json() } catch { return jsonResponse(400, { error: 'Invalid JSON body' }) }

  const parsed = RefundSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  const { refundAmountCents, refundReason } = parsed.data

  const payment = await prisma.paymentRecord.findUnique({ where: { id } })
  if (!payment) return jsonResponse(404, { error: 'Payment not found' })
  if (payment.status === 'refunded') return jsonResponse(409, { error: 'Payment already refunded' })
  if (refundAmountCents > payment.amountCents) {
    return jsonResponse(400, { error: 'Refund amount exceeds original payment amount' })
  }
  if (!payment.stripePaymentIntentId) {
    return jsonResponse(400, { error: 'No Stripe payment intent on record — cannot refund' })
  }

  await issueRefund(payment.stripePaymentIntentId, refundAmountCents)

  const updated = await prisma.paymentRecord.update({
    where: { id },
    data: {
      status:            'refunded',
      refundAmountCents,
      refundReason,
      approvedBy:        user.email,
    },
  })

  return jsonResponse(200, { payment: updated })
}, { role: 'admin' })
