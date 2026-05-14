import { withAuth } from '@/lib/auth/with-auth'
import { getMessageForViewer } from '@/lib/messaging/message-service'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function serviceErrorToResponse(err: unknown): Response {
  const code = (err as { code?: string }).code
  if (code === 'NOT_FOUND') return jsonResponse(404, { error: 'Not found' })
  if (code === 'FORBIDDEN') return jsonResponse(403, { error: 'Forbidden' })
  console.error(err)
  return jsonResponse(500, { error: 'Internal server error' })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  return withAuth(async (_, ctx) => {
    try {
      const message = await getMessageForViewer(id, { id: ctx.user.id, role: ctx.user.role })
      return jsonResponse(200, { message })
    } catch (err) {
      return serviceErrorToResponse(err)
    }
  })(req)
}
