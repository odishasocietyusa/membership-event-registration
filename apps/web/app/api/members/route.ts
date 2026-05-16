import { withAuth } from '@/lib/auth/with-auth'
import { listMembers } from '@/lib/members/member-service'
import { ListMembersQuerySchema } from '@/lib/validation/member.schema'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET = withAuth(async (req) => {
  const url = new URL(req.url)
  const parsed = ListMembersQuerySchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    return jsonResponse(400, { error: parsed.error.flatten() })
  }

  const result = await listMembers(
    parsed.data.page,
    parsed.data.limit,
    parsed.data.includeDeleted,
    parsed.data.search,
    parsed.data.status,
  )
  return jsonResponse(200, result)
}, { role: 'admin' })
