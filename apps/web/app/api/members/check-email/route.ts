import { prisma } from '@/lib/db/prisma'

export const dynamic = 'force-dynamic'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email')
  if (!email) {
    return json(400, { error: 'email is required' })
  }

  const member = await prisma.member.findUnique({ where: { email }, select: { id: true } })
  return json(200, { exists: member !== null })
}
