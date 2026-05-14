import { withAuth } from '@/lib/auth/with-auth'
import { getMembershipHistory } from '@/lib/memberships/membership-service'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET = withAuth(async (_req, { user }) => {
  try {
    const history = await getMembershipHistory(user.id)
    return jsonResponse(200, { history })
  } catch (err) {
    console.error(err)
    return jsonResponse(500, { error: 'Internal server error' })
  }
})
