import { withAuth } from '@/lib/auth/with-auth'
import { deleteComment } from '@/lib/obituaries/comment-service'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ slug: string; id: string }> }
): Promise<Response> {
  const { id } = await params
  return withAuth(async () => {
    const deleted = await deleteComment(id)
    if (!deleted) return jsonResponse(404, { error: 'Comment not found' })
    return new Response(null, { status: 204 })
  }, { role: 'admin' })(req)
}
