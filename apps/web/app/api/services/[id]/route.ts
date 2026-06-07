import { withAuth } from '@/lib/auth/with-auth'
import {
  getProviderById,
  updateProvider,
  deleteProvider,
} from '@/lib/services/service-provider-service'
import { UpdateProviderSchema } from '@/lib/validation/service-provider.schema'

export const dynamic = 'force-dynamic'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return withAuth(async (innerReq, ctx) => {
    const { id } = await params
    const provider = await getProviderById(id)
    if (!provider) return json(404, { error: 'Provider not found' })

    const isOwner = provider.memberId === ctx.user.id
    const isAdmin = ctx.user.role === 'admin'
    if (!isOwner && !isAdmin) return json(403, { error: 'Forbidden' })

    let body: unknown
    try {
      body = await innerReq.json()
    } catch {
      return json(400, { error: 'Invalid JSON' })
    }

    const parsed = UpdateProviderSchema.safeParse(body)
    if (!parsed.success) return json(400, { error: parsed.error.flatten() })

    // Strip status from non-admin callers — only admins can approve/deactivate
    const data = { ...parsed.data }
    if (!isAdmin) delete data.status

    const updated = await updateProvider(id, data)
    return json(200, { provider: updated })
  })(req)
}

export function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return withAuth(async (_req, ctx) => {
    const { id } = await params
    const provider = await getProviderById(id)
    if (!provider) return json(404, { error: 'Provider not found' })

    const isOwner = provider.memberId === ctx.user.id
    const isAdmin = ctx.user.role === 'admin'
    if (!isOwner && !isAdmin) return json(403, { error: 'Forbidden' })

    await deleteProvider(id)
    return new Response(null, { status: 204 })
  })(req)
}
