import { withAuth } from '@/lib/auth/with-auth'
import { searchMembers } from '@/lib/members/member-service'
import { MemberSearchQuerySchema } from '@/lib/validation/member.schema'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET = withAuth(async (req, { user }) => {
  if (user.memberStatus !== 'active') {
    return jsonResponse(403, { error: 'Member search is available to active members only.' })
  }

  const url    = new URL(req.url)
  const params = Object.fromEntries(url.searchParams)
  const parsed = MemberSearchQuerySchema.safeParse(params)

  if (!parsed.success) {
    return jsonResponse(400, { error: parsed.error.flatten() })
  }

  const result = await searchMembers(parsed.data)
  return jsonResponse(200, result)
})
