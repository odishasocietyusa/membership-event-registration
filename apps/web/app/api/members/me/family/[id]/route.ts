import { withAuth } from '@/lib/auth/with-auth'
import { softDeleteFamilyMember } from '@/lib/members/member-service'

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

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  return withAuth(async (_request, ctx) => {
    try {
      await softDeleteFamilyMember(id, ctx.user.id)
      return jsonResponse(200, { message: 'Family member removed' })
    } catch (err) {
      return serviceErrorToResponse(err)
    }
  })(req)
}
