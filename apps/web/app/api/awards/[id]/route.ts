import { withAuth } from '@/lib/auth/with-auth'
import {
  getAwardById,
  updateAward,
  deleteAward,
} from '@/lib/awards/award-service'
import { UpdateAwardSchema } from '@/lib/validation/award.schema'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body?: unknown): Response {
  if (body === undefined) {
    return new Response(null, { status })
  }
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

// Public individual read
export async function GET(
  req: Request,
  props: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await props.params
    const award = await getAwardById(id)
    if (!award) {
      return jsonResponse(404, { error: 'Award not found' })
    }
    return jsonResponse(200, { award })
  } catch (err) {
    return serviceErrorToResponse(err)
  }
}

// Admin-only update
export async function PATCH(
  req: Request,
  props: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await props.params
  return withAuth(
    async (request) => {
      try {
        let body: unknown
        try {
          body = await request.json()
        } catch {
          body = {}
        }

        const parsed = UpdateAwardSchema.safeParse(body)
        if (!parsed.success) {
          return jsonResponse(400, { error: parsed.error.flatten() })
        }

        const award = await updateAward(id, parsed.data)
        return jsonResponse(200, { award })
      } catch (err) {
        return serviceErrorToResponse(err)
      }
    },
    { role: 'admin' }
  )(req)
}

// Admin-only delete
export async function DELETE(
  req: Request,
  props: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await props.params
  return withAuth(
    async () => {
      try {
        await deleteAward(id)
        return jsonResponse(204)
      } catch (err) {
        return serviceErrorToResponse(err)
      }
    },
    { role: 'admin' }
  )(req)
}
