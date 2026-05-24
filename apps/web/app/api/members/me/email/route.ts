import { withAuth } from '@/lib/auth/with-auth'
import { changePrimaryEmail } from '@/lib/members/member-service'
import { ChangeEmailSchema } from '@/lib/validation/member.schema'

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
  if (code === 'CONFLICT')  return jsonResponse(409, { error: (err as Error).message })
  console.error(err)
  return jsonResponse(500, { error: 'Internal server error' })
}

export const PUT = withAuth(async (req, { user, isSpouseSession }) => {
  if (isSpouseSession) {
    return jsonResponse(403, { error: 'Spouse sessions cannot change the primary login email.' })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = ChangeEmailSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(400, { error: parsed.error.flatten() })
  }

  try {
    await changePrimaryEmail(user.id, parsed.data.newEmail)
    return jsonResponse(200, { message: 'Email updated. Please log in again with your new email.' })
  } catch (err) {
    return serviceErrorToResponse(err)
  }
})
