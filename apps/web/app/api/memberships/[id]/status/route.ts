import { withAuth } from '@/lib/auth/with-auth'
import { overrideMembershipStatus } from '@/lib/memberships/membership-service'
import { OverrideStatusSchema } from '@/lib/validation/membership.schema'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function serviceErrorToResponse(err: unknown): Response {
  const code = (err as { code?: string }).code
  if (code === 'NOT_FOUND') return jsonResponse(404, { error: 'Not found' })
  console.error(err)
  return jsonResponse(500, { error: 'Internal server error' })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  return withAuth(async (request) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' })
    }

    const parsed = OverrideStatusSchema.safeParse(body)
    if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

    try {
      const membership = await overrideMembershipStatus(id, parsed.data.status, parsed.data.note)
      return jsonResponse(200, { membership })
    } catch (err) {
      return serviceErrorToResponse(err)
    }
  }, { role: 'admin' })(req)
}
