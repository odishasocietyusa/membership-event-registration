import { withAuth } from '@/lib/auth/with-auth'
import { exportMemberData } from '@/lib/members/member-service'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  return withAuth(async () => {
    try {
      const data = await exportMemberData(id)
      return jsonResponse(200, data)
    } catch (err) {
      const code = (err as { code?: string }).code
      if (code === 'NOT_FOUND') return jsonResponse(404, { error: 'Not found' })
      console.error(err)
      return jsonResponse(500, { error: 'Internal server error' })
    }
  }, { role: 'admin' })(req)
}
