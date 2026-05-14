import { withAuth } from '@/lib/auth/with-auth'
import { prisma } from '@/lib/db/prisma'
import { createCheckoutSession } from '@/lib/payments/stripe'
import { CheckoutSessionSchema } from '@/lib/validation/payment.schema'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST = withAuth(async (req, { user }) => {
  let body: unknown
  try { body = await req.json() } catch { return jsonResponse(400, { error: 'Invalid JSON body' }) }

  const parsed = CheckoutSessionSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  const { membershipType } = parsed.data

  const fee = await prisma.membershipFee.findUnique({ where: { membershipType } })
  if (!fee) return jsonResponse(400, { error: 'Unknown membership type' })
  if (fee.isAdminOnly) return jsonResponse(403, { error: 'This membership type requires admin assignment' })

  const url = await createCheckoutSession(user.id, user.email, membershipType, fee.amountDollars)
  return jsonResponse(200, { url })
})
