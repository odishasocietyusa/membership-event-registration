import { withAuth } from '@/lib/auth/with-auth'
import { listChapters, createChapter } from '@/lib/members/member-service'
import { CreateChapterSchema } from '@/lib/validation/member.schema'

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

// Public — no withAuth
export async function GET(): Promise<Response> {
  const chapters = await listChapters()
  return jsonResponse(200, { chapters })
}

export const POST = withAuth(async (req) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = CreateChapterSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(400, { error: parsed.error.flatten() })
  }

  try {
    const chapter = await createChapter(parsed.data)
    return jsonResponse(201, { chapter })
  } catch (err) {
    return serviceErrorToResponse(err)
  }
}, { role: 'admin' })
