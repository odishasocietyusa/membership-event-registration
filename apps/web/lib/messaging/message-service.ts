import { prisma } from '@/lib/db/prisma'
import { getMemberById } from '@/lib/members/member-service'
import { sendRelayEmail } from '@/lib/messaging/resend'
import type { CreateMessageInput } from '@/lib/validation/message.schema'
import type { PaginatedResult } from '@/lib/members/member-service'

export interface MessageRow {
  id: string
  senderMemberId: string
  recipientMemberId: string
  subject: string
  body: string
  sentAt: Date
}

const MESSAGE_SELECT = {
  id: true,
  senderMemberId: true,
  recipientMemberId: true,
  subject: true,
  body: true,
  sentAt: true,
} as const

export async function sendMessage(
  senderMemberId: string,
  senderFullName: string | null,
  input: CreateMessageInput
): Promise<MessageRow> {
  if (senderMemberId === input.recipientMemberId) {
    throw Object.assign(new Error('Cannot send a message to yourself'), { code: 'BAD_REQUEST' })
  }

  const recipient = await getMemberById(input.recipientMemberId)
  if (!recipient) {
    throw Object.assign(new Error('Recipient not found'), { code: 'NOT_FOUND' })
  }

  const message = await prisma.message.create({
    data: {
      senderMemberId,
      recipientMemberId: input.recipientMemberId,
      subject: input.subject,
      body: input.body,
    },
    select: MESSAGE_SELECT,
  })

  // Best-effort relay — never propagate transport errors to the caller
  try {
    const sender = await prisma.member.findUnique({
      where: { id: senderMemberId },
      select: { address: true },
    })
    const address = sender?.address as { city?: string; state?: string } | null

    await sendRelayEmail({
      to: recipient.email,
      subject: input.subject,
      senderName: senderFullName ?? recipient.email.split('@')[0],
      senderCity: address?.city ?? null,
      senderState: address?.state ?? null,
      body: input.body,
    })
  } catch (e) {
    console.error('Resend relay failed', { messageId: message.id, error: e })
  }

  return message
}

export async function listMessagesForMember(
  memberId: string,
  type: 'sent' | 'received',
  page: number,
  limit: number
): Promise<PaginatedResult<MessageRow>> {
  const effectiveLimit = Math.min(limit, 100)
  const skip = (page - 1) * effectiveLimit

  const where =
    type === 'sent'
      ? { senderMemberId: memberId }
      : { recipientMemberId: memberId }

  const [data, total] = await Promise.all([
    prisma.message.findMany({
      where,
      select: MESSAGE_SELECT,
      orderBy: { sentAt: 'desc' },
      skip,
      take: effectiveLimit,
    }),
    prisma.message.count({ where }),
  ])

  return { data, total, page, limit: effectiveLimit }
}

export async function getMessageForViewer(
  messageId: string,
  viewer: { id: string; role: string }
): Promise<MessageRow> {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    select: MESSAGE_SELECT,
  })

  if (!message) {
    throw Object.assign(new Error('Message not found'), { code: 'NOT_FOUND' })
  }

  if (
    viewer.role !== 'admin' &&
    message.senderMemberId !== viewer.id &&
    message.recipientMemberId !== viewer.id
  ) {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })
  }

  return message
}
