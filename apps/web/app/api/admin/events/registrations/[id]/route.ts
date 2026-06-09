import { withAuth } from '@/lib/auth/with-auth'
import { prisma }   from '@/lib/db/prisma'
import { DeregisterSchema } from '@/lib/validation/event.schema'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params

  return withAuth(async (request) => {
    let body: unknown
    try { body = await request.json() } catch { body = {} }
    const parsed = DeregisterSchema.safeParse(body)
    if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

    const existing = await prisma.eventRegistration.findUnique({ where: { id } })
    if (!existing) return jsonResponse(404, { error: 'Registration not found' })

    const updated = await prisma.eventRegistration.update({
      where: { id },
      data:  { status: 'cancelled', cancelledAt: new Date() },
    })

    return jsonResponse(200, { registration: updated })
  }, { role: 'admin' })(req)
}
