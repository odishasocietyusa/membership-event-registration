import { withAuth } from '@/lib/auth/with-auth'
import {
  getMembershipById,
  adminCancelMembership,
} from '@/lib/memberships/membership-service'

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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  return withAuth(async () => {
    try {
      const membership = await getMembershipById(id)
      return jsonResponse(200, { membership })
    } catch (err) {
      return serviceErrorToResponse(err)
    }
  }, { role: 'admin' })(req)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  return withAuth(async (_req, { user: admin }) => {
    try {
      const membership = await adminCancelMembership(id, admin.id)
      return jsonResponse(200, { membership })
    } catch (err) {
      return serviceErrorToResponse(err)
    }
  }, { role: 'admin' })(req)
}
