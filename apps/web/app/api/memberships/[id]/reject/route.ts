import { withAuth } from '@/lib/auth/with-auth'
import { rejectMembership } from '@/lib/memberships/membership-service'
import { RejectMembershipSchema } from '@/lib/validation/membership.schema'

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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  return withAuth(async (request, { user: admin }) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' })
    }

    const parsed = RejectMembershipSchema.safeParse(body)
    if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

    try {
      const membership = await rejectMembership(id, admin.id, parsed.data.reason)
      return jsonResponse(200, { membership })
    } catch (err) {
      return serviceErrorToResponse(err)
    }
  }, { role: 'admin' })(req)
}
