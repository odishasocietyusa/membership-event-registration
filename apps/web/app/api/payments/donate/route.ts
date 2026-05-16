import { prisma } from '@/lib/db/prisma'
import { getSupabaseAdmin } from '@/lib/auth/supabase-admin'
import { createDonationSession } from '@/lib/payments/stripe'
import { DonateSchema } from '@/lib/validation/payment.schema'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function POST(req: Request): Promise<Response> {
  let body: unknown
  try { body = await req.json() } catch { return jsonResponse(400, { error: 'Invalid JSON body' }) }

  const parsed = DonateSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  const { amountCents, isAnonymous } = parsed.data

  // Optionally attach member identity if a valid token is present
  let memberId: string | null = null
  let memberEmail: string | null = null
  const authHeader = req.headers.get('Authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (token) {
    const { data: { user } } = await getSupabaseAdmin().auth.getUser(token)
    if (user?.email) {
      const member = await prisma.member.findUnique({ where: { email: user.email } })
      if (member) {
        memberId = isAnonymous ? null : member.id
        memberEmail = isAnonymous ? null : member.email
      }
    }
  }

  const url = await createDonationSession(amountCents, memberId, memberEmail)
  return jsonResponse(200, { url })
}
