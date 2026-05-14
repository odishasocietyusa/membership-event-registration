import { withAuth } from '@/lib/auth/with-auth'
import { prisma } from '@/lib/db/prisma'
import { ListPaymentsQuerySchema } from '@/lib/validation/payment.schema'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET = withAuth(async (req) => {
  const url = new URL(req.url)
  const parsed = ListPaymentsQuerySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  const { page, limit, memberId, status, paymentType } = parsed.data
  const skip = (page - 1) * limit

  const where = {
    ...(memberId    ? { memberId }    : {}),
    ...(status      ? { status }      : {}),
    ...(paymentType ? { paymentType } : {}),
  }

  const [records, total] = await Promise.all([
    prisma.paymentRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.paymentRecord.count({ where }),
  ])

  // Mask anonymous donor identity
  const data = (records as Array<{ isAnonymous: boolean; memberId: string | null } & Record<string, unknown>>).map((r) =>
    r.isAnonymous ? { ...r, memberId: null } : r
  )

  return jsonResponse(200, { data, total, page, limit })
}, { role: 'admin' })
