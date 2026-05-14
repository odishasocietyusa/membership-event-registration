import { withAuth } from '@/lib/auth/with-auth'
import { listFamilyMembers, addFamilyMember } from '@/lib/members/member-service'
import { CreateFamilyMemberSchema } from '@/lib/validation/member.schema'

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
  const familyMembers = await listFamilyMembers(user.id)
  return jsonResponse(200, { familyMembers })
})

export const POST = withAuth(async (req, { user }) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = CreateFamilyMemberSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(400, { error: parsed.error.flatten() })
  }

  try {
    const created = await addFamilyMember(user.id, parsed.data)
    return jsonResponse(201, { familyMember: created })
  } catch (err) {
    return serviceErrorToResponse(err)
  }
})
