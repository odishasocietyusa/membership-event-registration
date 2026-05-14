import { withAuth } from '@/lib/auth/with-auth'
import { linkMemberAccount } from '@/lib/members/member-service'
import { LinkMemberSchema } from '@/lib/validation/member.schema'

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

export const POST = withAuth(async (req) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = LinkMemberSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(400, { error: parsed.error.flatten() })
  }

  try {
    const member = await linkMemberAccount(parsed.data.email, parsed.data.userId)
    return jsonResponse(200, { member })
  } catch (err) {
    return serviceErrorToResponse(err)
  }
}, { role: 'admin' })
