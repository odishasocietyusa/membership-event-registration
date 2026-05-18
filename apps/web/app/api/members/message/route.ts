import { withAuth } from '@/lib/auth/with-auth'
import { prisma } from '@/lib/db/prisma'
import { sendRelayEmail } from '@/lib/messaging/resend'
import { SendMemberMessageSchema } from '@/lib/validation/member.schema'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST = withAuth(async (req, { user }) => {
  if (user.memberStatus !== 'active') {
    return jsonResponse(403, { error: 'Member messaging is available to active members only.' })
  }

  let body: unknown
  try { body = await req.json() }
  catch { return jsonResponse(400, { error: 'Invalid JSON body' }) }

  const parsed = SendMemberMessageSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(400, { error: parsed.error.flatten() })
  }

  const { toMemberId, message } = parsed.data

  if (toMemberId === user.id) {
    return jsonResponse(400, { error: 'You cannot send a message to yourself.' })
  }

  const recipient = await prisma.member.findUnique({
    where:  { id: toMemberId, deletedAt: null },
    select: { email: true },
  })
  if (!recipient) {
    return jsonResponse(404, { error: 'Recipient not found.' })
  }

  const senderName = user.fullName ?? user.email
  const address    = user.address as { city?: string; state?: string } | null

  try {
    await sendRelayEmail({
      to:          recipient.email,
      subject:     `${senderName} from OSA has sent you a message`,
      senderName,
      senderCity:  address?.city  ?? null,
      senderState: address?.state ?? null,
      body:        message,
    })
  } catch (err) {
    console.error('sendRelayEmail failed', err)
    return jsonResponse(500, { error: 'Failed to send message. Please try again.' })
  }

  return jsonResponse(200, { ok: true })
})
