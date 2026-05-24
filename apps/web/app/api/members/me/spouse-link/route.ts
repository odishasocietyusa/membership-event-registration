import { withAuth } from '@/lib/auth/with-auth'
import { revokeSpouseLink } from '@/lib/members/member-service'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const DELETE = withAuth(async (_req, { user }) => {
  try {
    await revokeSpouseLink(user.id)
    return jsonResponse(200, { message: 'Spouse link revoked.' })
  } catch {
    return jsonResponse(500, { error: 'Internal server error' })
  }
})
