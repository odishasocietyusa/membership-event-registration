import { withAuth } from '@/lib/auth/with-auth'
import { updateChapter } from '@/lib/members/member-service'
import { UpdateChapterSchema } from '@/lib/validation/member.schema'

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

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  return withAuth(async (request) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' })
    }

    const parsed = UpdateChapterSchema.safeParse(body)
    if (!parsed.success) {
      return jsonResponse(400, { error: parsed.error.flatten() })
    }

    try {
      const chapter = await updateChapter(id, parsed.data)
      return jsonResponse(200, { chapter })
    } catch (err) {
      return serviceErrorToResponse(err)
    }
  }, { role: 'admin' })(req)
}
