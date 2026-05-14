import { withAuth } from '@/lib/auth/with-auth'
import { assignHonoraryMembership } from '@/lib/memberships/membership-service'
import { AssignHonorarySchema } from '@/lib/validation/membership.schema'

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
  console.error(err)
  return jsonResponse(500, { error: 'Internal server error' })
}

export const POST = withAuth(async (req, { user: admin }) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = AssignHonorarySchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  try {
    const membership = await assignHonoraryMembership(parsed.data.memberId, admin.id, parsed.data.note)
    return jsonResponse(200, { membership })
  } catch (err) {
    return serviceErrorToResponse(err)
  }
}, { role: 'admin' })
