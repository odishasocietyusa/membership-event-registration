import { prisma } from '@/lib/db/prisma'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

export async function GET(req: Request): Promise<Response> {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL
  if (!ADMIN_EMAIL) {
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@odishasociety.org'

  const now = new Date()
  const in30Days = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 30))

  const members = await prisma.member.findMany({
    where: {
      memberStatus: 'active',
      expiryDate: { gte: now, lt: in30Days },
    },
    select: { fullName: true, email: true, expiryDate: true },
    orderBy: { expiryDate: 'asc' },
  })

  if (members.length === 0) {
    return new Response(JSON.stringify({ memberCount: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const list = members
    .map((m) => `  - ${m.fullName ?? m.email} (expires ${m.expiryDate?.toLocaleDateString('en-US')})`)
    .join('\n')

  await resend.emails.send({
    from: FROM,
    to: ADMIN_EMAIL,
    subject: `OSA: ${members.length} membership(s) expiring in the next 30 days`,
    text: [
      `The following memberships are expiring within the next 30 days:\n`,
      list,
      `\nLog in to the admin panel to view full member details.`,
    ].join('\n'),
  })

  return new Response(JSON.stringify({ memberCount: members.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
