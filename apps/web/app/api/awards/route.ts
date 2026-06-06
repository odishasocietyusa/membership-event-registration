import { withAuth } from '@/lib/auth/with-auth'
import {
  listAwards,
  createAward,
} from '@/lib/awards/award-service'
import {
  ListAwardsQuerySchema,
  CreateAwardSchema,
} from '@/lib/validation/award.schema'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function serviceErrorToResponse(err: unknown): Response {
  const code = (err as { code?: string }).code
  if (code === 'BAD_REQUEST') return jsonResponse(400, { error: (err as Error).message })
  if (code === 'NOT_FOUND') return jsonResponse(404, { error: (err as Error).message })
  if (code === 'FORBIDDEN') return jsonResponse(403, { error: (err as Error).message })
  console.error(err)
  return jsonResponse(500, { error: 'Internal server error' })
}

// Public endpoint
export async function GET(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const queryParams = Object.fromEntries(url.searchParams.entries())
    const parsed = ListAwardsQuerySchema.safeParse(queryParams)
    if (!parsed.success) {
      return jsonResponse(400, { error: parsed.error.flatten() })
    }

    const awards = await listAwards(parsed.data)
    return jsonResponse(200, { awards })
  } catch (err) {
    return serviceErrorToResponse(err)
  }
}

// Admin-only write endpoint
export const POST = withAuth(
  async (req) => {
    try {
      let body: unknown
      try {
        body = await req.json()
      } catch {
        body = {}
      }

      const parsed = CreateAwardSchema.safeParse(body)
      if (!parsed.success) {
        return jsonResponse(400, { error: parsed.error.flatten() })
      }

      const award = await createAward(parsed.data)
      return jsonResponse(201, { award })
    } catch (err) {
      return serviceErrorToResponse(err)
    }
  },
  { role: 'admin' }
)
