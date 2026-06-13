import { withAuth } from '@/lib/auth/with-auth'
import {
  getExpertiseProfileById,
  updateExpertiseProfile,
  deleteExpertiseProfile,
} from '@/lib/expertise/expertise-profile-service'
import { UpdateExpertiseSchema } from '@/lib/validation/expertise-profile.schema'

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
    const profile = await getExpertiseProfileById(id)
    if (!profile) return json(404, { error: 'Expertise profile not found' })

    const isOwner = profile.memberId === ctx.user.id
    const isAdmin = ctx.user.role === 'admin'
    if (!isOwner && !isAdmin) return json(403, { error: 'Forbidden' })

    let body: unknown
    try {
      body = await innerReq.json()
    } catch {
      return json(400, { error: 'Invalid JSON' })
    }

    const parsed = UpdateExpertiseSchema.safeParse(body)
    if (!parsed.success) return json(400, { error: parsed.error.flatten() })

    // Strip isHidden from non-admin callers — only admins can moderate
    const data = { ...parsed.data }
    if (!isAdmin) delete data.isHidden

    const updated = await updateExpertiseProfile(id, data)
    return json(200, { profile: updated })
  })(req)
}

export function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return withAuth(async (_req, ctx) => {
    const { id } = await params
    const profile = await getExpertiseProfileById(id)
    if (!profile) return json(404, { error: 'Expertise profile not found' })

    const isOwner = profile.memberId === ctx.user.id
    const isAdmin = ctx.user.role === 'admin'
    if (!isOwner && !isAdmin) return json(403, { error: 'Forbidden' })

    await deleteExpertiseProfile(id)
    return new Response(null, { status: 204 })
  })(req)
}
