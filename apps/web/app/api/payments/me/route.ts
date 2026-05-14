import { withAuth } from '@/lib/auth/with-auth'
import { prisma } from '@/lib/db/prisma'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET = withAuth(async (_req, { user }) => {
  const records = await prisma.paymentRecord.findMany({
    where: { memberId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  return jsonResponse(200, { data: records })
})
