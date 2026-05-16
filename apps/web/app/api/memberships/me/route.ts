import { withAuth } from '@/lib/auth/with-auth'
import {
  getMyMembershipStatus,
  cancelMembership,
} from '@/lib/memberships/membership-service'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function serviceErrorToResponse(err: unknown): Response {
  const code = (err as { code?: string }).code
  if (code === 'NOT_FOUND') return jsonResponse(404, { error: 'Not found' })
  if (code === 'CONFLICT')  return jsonResponse(409, { error: 'Conflict' })
  if (code === 'FORBIDDEN') return jsonResponse(403, { error: 'Forbidden' })
  console.error(err)
  return jsonResponse(500, { error: 'Internal server error' })
}

export const GET = withAuth(async (_req, { user }) => {
  try {
    const membership = await getMyMembershipStatus(user.id)
    return jsonResponse(200, { membership })
  } catch (err) {
    return serviceErrorToResponse(err)
  }
})

export const DELETE = withAuth(async (_req, { user }) => {
  try {
    const membership = await cancelMembership(user.id)
    return jsonResponse(200, { membership })
  } catch (err) {
    return serviceErrorToResponse(err)
  }
})
