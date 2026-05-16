import { withAuth } from '@/lib/auth/with-auth'
import { updateMember, softDeleteMember } from '@/lib/members/member-service'
import { UpdateMemberSchema } from '@/lib/validation/member.schema'

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
  if (code === 'CONFLICT') return jsonResponse(409, { error: 'Conflict' })
  if (code === 'FORBIDDEN') return jsonResponse(403, { error: 'Forbidden' })
  console.error(err)
  return jsonResponse(500, { error: 'Internal server error' })
}

export const GET = withAuth(async (_req, { user }) => {
  return jsonResponse(200, { member: user })
})

export const PUT = withAuth(async (req, { user }) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = UpdateMemberSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(400, { error: parsed.error.flatten() })
  }

  try {
    const updated = await updateMember(user.id, parsed.data)
    return jsonResponse(200, { member: updated })
  } catch (err) {
    return serviceErrorToResponse(err)
  }
})

export const DELETE = withAuth(async (_req, { user }) => {
  await softDeleteMember(user.id)
  return jsonResponse(200, { message: 'Account deactivated' })
})
