import { withAuth } from '@/lib/auth/with-auth'
import { prisma }   from '@/lib/db/prisma'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sanityId: string }> },
): Promise<Response> {
  const { sanityId: sanityEventId } = await params

  return withAuth(async () => {
    const registrations = await prisma.eventRegistration.findMany({
      where:   { sanityEventId },
      orderBy: { createdAt: 'asc' },
      include: {
        member: { select: { id: true, fullName: true, email: true } },
      },
    })

    const confirmedCount = registrations.filter((r) => r.status === 'confirmed').length

    const rows = registrations.map((r) => ({
      id:          r.id,
      memberId:    r.memberId,
      memberName:  r.member?.fullName ?? null,
      memberEmail: r.member?.email ?? null,
      guestEmail:  r.guestEmail,
      guestName:   r.guestName,
      guestCount:  r.guestCount,
      status:      r.status,
      createdAt:   r.createdAt,
      cancelledAt: r.cancelledAt,
    }))

    return jsonResponse(200, { registrations: rows, total: rows.length, confirmedCount })
  }, { role: 'admin' })(req)
}
