import { withAuth } from '@/lib/auth/with-auth'
import { approveMembership } from '@/lib/memberships/membership-service'
import { ApproveMembershipSchema } from '@/lib/validation/membership.schema'

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
  console.error(err)
  return jsonResponse(500, { error: 'Internal server error' })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  return withAuth(async (request, { user: admin }) => {
    let body: unknown = {}
    try {
      const text = await request.text()
      if (text) body = JSON.parse(text)
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' })
    }

    const parsed = ApproveMembershipSchema.safeParse(body)
    if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

    try {
      const membership = await approveMembership(id, admin.id, parsed.data.note)
      return jsonResponse(200, { membership })
    } catch (err) {
      return serviceErrorToResponse(err)
    }
  }, { role: 'admin' })(req)
}
