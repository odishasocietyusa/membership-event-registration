import { withAuth } from '@/lib/auth/with-auth'
import { getUpgradeOptions } from '@/lib/payments/payment-service'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET = withAuth(async (_req, { user }) => {
  try {
    const result = await getUpgradeOptions(user.id)
    return jsonResponse(200, result)
  } catch (err) {
    console.error('[upgrade-options] error:', err)
    return jsonResponse(500, { error: 'Internal server error' })
  }
})
