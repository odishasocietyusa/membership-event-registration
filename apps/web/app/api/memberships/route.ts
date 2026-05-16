import { withAuth } from '@/lib/auth/with-auth'
import {
  applyForMembership,
  listAllMemberships,
} from '@/lib/memberships/membership-service'
import {
  ApplyMembershipSchema,
  ListMembershipsQuerySchema,
} from '@/lib/validation/membership.schema'

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

// Member: apply for a membership
export const POST = withAuth(async (req, { user }) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = ApplyMembershipSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  try {
    const membership = await applyForMembership(user.id, parsed.data.membershipType)
    return jsonResponse(201, { membership })
  } catch (err) {
    return serviceErrorToResponse(err)
  }
})

// Admin: list all memberships with pagination + optional filters
export const GET = withAuth(async (req) => {
  const url = new URL(req.url)
  const queryParams = Object.fromEntries(url.searchParams)
  const parsed = ListMembershipsQuerySchema.safeParse(queryParams)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  const { page, limit, memberStatus, membershipType } = parsed.data

  try {
    const result = await listAllMemberships(page, limit, { memberStatus, membershipType })
    return jsonResponse(200, result)
  } catch (err) {
    return serviceErrorToResponse(err)
  }
}, { role: 'admin' })
