import { withAuth } from '@/lib/auth/with-auth'
import { prisma } from '@/lib/db/prisma'
import { sendMembershipReceipt, sendDonationReceipt } from '@/lib/payments/receipt'

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

  const payment = await prisma.paymentRecord.findUnique({ where: { id } })
  if (!payment) return jsonResponse(404, { error: 'Payment not found' })
  if (payment.status !== 'completed') return jsonResponse(400, { error: 'Receipt only available for completed payments' })

  // Members can only request receipts for their own payments
  if (payment.memberId && payment.memberId !== user.id && user.role !== 'admin') {
    return jsonResponse(403, { error: 'Forbidden' })
  }

  if (payment.paymentType === 'donation') {
    await sendDonationReceipt(user.email, user.fullName, payment)
  } else {
    await sendMembershipReceipt(user, payment)
  }

  await prisma.paymentRecord.update({
    where: { id },
    data: { receiptRequestedAt: new Date() },
  })

  return jsonResponse(200, { sent: true })
})
