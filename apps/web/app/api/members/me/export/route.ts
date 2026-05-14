import { withAuth } from '@/lib/auth/with-auth'
import { exportMemberData } from '@/lib/members/member-service'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET = withAuth(async (_req, { user }) => {
  const exportData = await exportMemberData(user.id)
  return jsonResponse(200, exportData)
})
