import { prisma } from '@/lib/db/prisma'
import { expireOverdueMemberships } from '@/lib/memberships/membership-service'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@osa-americas.org'
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL ?? ''

export async function GET(req: Request): Promise<Response> {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  await expireOverdueMemberships()

  const now = new Date()
  const in30Days = new Date(now)
  in30Days.setDate(in30Days.getDate() + 30)

  const expiringMembers = await prisma.member.findMany({
    where: {
      memberStatus: 'active',
      expiryDate: {
        gte: now,
        lte: in30Days,
      },
    },
    select: { id: true, email: true, fullName: true, expiryDate: true },
  })

  let sent = 0

  for (const member of expiringMembers) {
    if (!member.expiryDate) continue

    const daysLeft = Math.ceil(
      (member.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    )

    const shouldNotify = daysLeft <= 7 || daysLeft <= 30
    if (!shouldNotify) continue

    const windowLabel = daysLeft <= 7 ? '7 days' : '30 days'
    const expiryStr = member.expiryDate.toLocaleDateString('en-US', { dateStyle: 'long' })

    await resend.emails.send({
      from: FROM,
      to: member.email,
      subject: `Your OSA membership expires in ${windowLabel}`,
      text: [
        `Dear ${member.fullName ?? 'Member'},`,
        '',
        `Your OSA membership is set to expire on ${expiryStr}.`,
        `Please renew your membership to continue enjoying member benefits.`,
        '',
        `Visit your membership dashboard to renew.`,
      ].join('\n'),
    })

    sent++
  }

  // Admin notification for all members expiring within 30 days
  if (ADMIN_EMAIL && expiringMembers.length > 0) {
    type ExpiringMember = { fullName: string | null; email: string; expiryDate: Date | null }
    const list = (expiringMembers as ExpiringMember[])
      .map((m) => `  - ${m.fullName ?? m.email} (expires ${m.expiryDate?.toLocaleDateString('en-US')})`)
      .join('\n')

    await resend.emails.send({
      from: FROM,
      to: ADMIN_EMAIL,
      subject: `OSA: ${expiringMembers.length} membership(s) expiring within 30 days`,
      text: `The following memberships are expiring within the next 30 days:\n\n${list}`,
    })
  }

  return new Response(
    JSON.stringify({ processed: expiringMembers.length, emailsSent: sent }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
