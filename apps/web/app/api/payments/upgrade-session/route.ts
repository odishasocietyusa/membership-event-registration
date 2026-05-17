import { z } from 'zod'
import { withAuth } from '@/lib/auth/with-auth'
import { createUpgradeSession } from '@/lib/payments/stripe'
import { calculateUpgradeCost, recordPayment } from '@/lib/payments/payment-service'
import type { MembershipType } from '@prisma/client'

export const dynamic = 'force-dynamic'

const UpgradeSessionSchema = z.object({
  targetType: z.enum(['life', 'patron', 'benefactor']).default('life'),
})

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST = withAuth(async (req, { user }) => {
  let body: unknown
  try { body = await req.json() } catch { body = {} }

  const parsed = UpgradeSessionSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  const { targetType } = parsed.data
  const result = await calculateUpgradeCost(user.id, targetType)

  if (!result.eligible) {
    return jsonResponse(400, { error: result.reason })
  }

  if (result.autoActivate) {
    await recordPayment({
      memberId:         user.id,
      status:           'completed',
      paymentType:      'upgrade',
      membershipType:   targetType as MembershipType,
      amountCents:      0,
      isAdminInitiated: false,
    })
    return jsonResponse(200, { activated: true })
  }

  const url = await createUpgradeSession(user.id, user.email, result.costCents, targetType)
  return jsonResponse(200, { url })
})
