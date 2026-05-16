import { getPublicMembershipTypes } from '@/lib/memberships/membership-service'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function GET(): Promise<Response> {
  try {
    const types = await getPublicMembershipTypes()
    return jsonResponse(200, { types })
  } catch (err) {
    console.error(err)
    return jsonResponse(500, { error: 'Internal server error' })
  }
}
