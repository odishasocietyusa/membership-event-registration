import { prisma } from '@/lib/db/prisma'
import { expireOverdueMemberships } from '@/lib/memberships/membership-service'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

const CHECKPOINTS = [
  { days: 180, noticeType: 'six_month',   label: 'approximately 6 months' },
  { days: 90,  noticeType: 'three_month', label: 'approximately 3 months' },
  { days: 30,  noticeType: 'one_month',   label: 'approximately 1 month'  },
  { days: 7,   noticeType: 'one_week',    label: 'approximately 1 week'   },
] as const

function utcDayOffset(baseMs: number, days: number): Date {
  return new Date(baseMs + days * 86_400_000)
}

export async function GET(req: Request): Promise<Response> {
  const authHeader = req.headers.get('Authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const FROM = process.env.RESEND_FROM_EMAIL ?? 'noreply@odishasociety.org'
  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://odishasociety.org'

  await expireOverdueMemberships()

  const now = new Date()
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  let emailsSent = 0
  let processed = 0

  for (const checkpoint of CHECKPOINTS) {
    const windowStart = utcDayOffset(todayMs, checkpoint.days)
    const windowEnd   = utcDayOffset(todayMs, checkpoint.days + 2)

    const members = await prisma.member.findMany({
      where: {
        memberStatus: 'active',
        expiryDate: { gte: windowStart, lt: windowEnd },
      },
      select: { id: true, email: true, fullName: true, expiryDate: true },
    })

    processed += members.length

    for (const member of members) {
      if (!member.expiryDate) continue

      const existing = await prisma.expiryNotice.findUnique({
        where: {
          memberId_noticeType_expiryDate: {
            memberId:   member.id,
            noticeType: checkpoint.noticeType,
            expiryDate: member.expiryDate,
          },
        },
      })
      if (existing) continue

      const expiryStr = member.expiryDate.toLocaleDateString('en-US', { dateStyle: 'long' })

      await resend.emails.send({
        from: FROM,
        to: member.email,
        subject: `Your OSA membership expires in ${checkpoint.label}`,
        text: [
          `Dear ${member.fullName ?? 'Member'},`,
          '',
          `Your OSA membership is set to expire on ${expiryStr}.`,
          '',
          `Renew or upgrade your membership at: ${SITE_URL}/membership`,
          '',
          'If you have already renewed, please disregard this notice.',
          '',
          '—',
          'Odisha Society of the Americas',
        ].join('\n'),
      })

      emailsSent++

      try {
        await prisma.expiryNotice.create({
          data: {
            memberId:   member.id,
            noticeType: checkpoint.noticeType,
            expiryDate: member.expiryDate,
          },
        })
      } catch (err) {
        console.error(`[expiry-reminders] Failed to record ExpiryNotice for member ${member.id}:`, err)
      }
    }
  }

  return new Response(
    JSON.stringify({ processed, emailsSent }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  )
}
