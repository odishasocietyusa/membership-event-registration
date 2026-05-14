import { withAuth } from '@/lib/auth/with-auth'
import { createUpgradeSession } from '@/lib/payments/stripe'
import { calculateUpgradeCost, recordPayment } from '@/lib/payments/payment-service'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST = withAuth(async (_req, { user }) => {
  const result = await calculateUpgradeCost(user.id)

  if (!result.eligible) {
    return jsonResponse(400, { error: result.reason })
  }

  if (result.autoActivate) {
    await recordPayment({
      memberId:         user.id,
      status:           'completed',
      paymentType:      'upgrade',
      membershipType:   'life',
      amountCents:      0,
      isAdminInitiated: false,
    })
    return jsonResponse(200, { activated: true })
  }

  const url = await createUpgradeSession(user.id, user.email, result.costCents)
  return jsonResponse(200, { url })
})
