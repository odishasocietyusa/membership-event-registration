// lib/messaging/message-service.test.ts

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
    member: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/members/member-service', () => ({
  getMemberById: jest.fn(),
}))

jest.mock('@/lib/messaging/resend', () => ({
  sendRelayEmail: jest.fn(),
}))

import { sendMessage, listMessagesForMember, getMessageForViewer } from './message-service'
import { prisma } from '@/lib/db/prisma'
import { getMemberById } from '@/lib/members/member-service'
import { sendRelayEmail } from '@/lib/messaging/resend'

const mockCreate = prisma.message.create as jest.Mock
const mockFindMany = prisma.message.findMany as jest.Mock
const mockCount = prisma.message.count as jest.Mock
const mockFindUnique = prisma.message.findUnique as jest.Mock
const mockMemberFindUnique = prisma.member.findUnique as jest.Mock
const mockGetMemberById = getMemberById as jest.Mock
const mockSendRelayEmail = sendRelayEmail as jest.Mock

const baseMessage = {
  id: 'msg-1',
  senderMemberId: 'mem-1',
  recipientMemberId: 'mem-2',
  subject: 'Hello',
  body: 'World',
  sentAt: new Date('2026-01-01T00:00:00Z'),
}

const baseMember = {
  id: 'mem-2',
  email: 'recipient@test.com',
  fullName: 'Jane Doe',
  deletedAt: null,
}

beforeEach(() => {
  jest.clearAllMocks()
})

// ── sendMessage ───────────────────────────────────────────────────────────────

describe('sendMessage()', () => {
  it('MSG-01: creates DB record and calls sendRelayEmail with recipient email', async () => {
    mockGetMemberById.mockResolvedValueOnce(baseMember)
    mockCreate.mockResolvedValueOnce(baseMessage)
    mockMemberFindUnique.mockResolvedValueOnce({ address: { city: 'Seattle', state: 'WA' } })
    mockSendRelayEmail.mockResolvedValueOnce(undefined)

    const result = await sendMessage('mem-1', 'Utkal Nayak', {
      recipientMemberId: 'mem-2',
      subject: 'Hello',
      body: 'World',
    })

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { senderMemberId: 'mem-1', recipientMemberId: 'mem-2', subject: 'Hello', body: 'World' },
        select: expect.objectContaining({ id: true, senderMemberId: true, recipientMemberId: true }),
      })
    )
    expect(mockSendRelayEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'recipient@test.com', senderName: 'Utkal Nayak' })
    )
    expect(result).toEqual(baseMessage)
  })

  it('MSG-08: throws BAD_REQUEST when sender === recipient', async () => {
    await expect(
      sendMessage('mem-1', 'Self', { recipientMemberId: 'mem-1', subject: 'S', body: 'B' })
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' })

    expect(mockGetMemberById).not.toHaveBeenCalled()
    expect(mockCreate).not.toHaveBeenCalled()
    expect(mockSendRelayEmail).not.toHaveBeenCalled()
  })

  it('MSG-07: throws NOT_FOUND when recipient does not exist', async () => {
    mockGetMemberById.mockResolvedValueOnce(null)

    await expect(
      sendMessage('mem-1', 'Sender', { recipientMemberId: 'mem-99', subject: 'S', body: 'B' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('MSG-09: returns DB record even when sendRelayEmail throws', async () => {
    mockGetMemberById.mockResolvedValueOnce(baseMember)
    mockCreate.mockResolvedValueOnce(baseMessage)
    mockMemberFindUnique.mockResolvedValueOnce(null)
    mockSendRelayEmail.mockRejectedValueOnce(new Error('Resend down'))

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const result = await sendMessage('mem-1', 'Sender', {
      recipientMemberId: 'mem-2',
      subject: 'S',
      body: 'B',
    })

    expect(result).toEqual(baseMessage)
    expect(consoleSpy).toHaveBeenCalledWith('Resend relay failed', expect.objectContaining({ messageId: 'msg-1' }))
    consoleSpy.mockRestore()
  })

  it('MSG-17: create select clause does not include email or member relation', async () => {
    mockGetMemberById.mockResolvedValueOnce(baseMember)
    mockCreate.mockResolvedValueOnce(baseMessage)
    mockMemberFindUnique.mockResolvedValueOnce(null)
    mockSendRelayEmail.mockResolvedValueOnce(undefined)

    await sendMessage('mem-1', 'Sender', { recipientMemberId: 'mem-2', subject: 'S', body: 'B' })

    const selectArg = mockCreate.mock.calls[0][0].select
    expect(selectArg).not.toHaveProperty('email')
    expect(selectArg).not.toHaveProperty('sender')
    expect(selectArg).not.toHaveProperty('recipient')
  })
})

// ── listMessagesForMember ─────────────────────────────────────────────────────

describe('listMessagesForMember()', () => {
  it('MSG-04: queries by senderMemberId for type=sent', async () => {
    mockFindMany.mockResolvedValueOnce([baseMessage])
    mockCount.mockResolvedValueOnce(1)

    const result = await listMessagesForMember('mem-1', 'sent', 1, 50)

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { senderMemberId: 'mem-1' } })
    )
    expect(result.data).toHaveLength(1)
    expect(result.total).toBe(1)
  })

  it('MSG-05: queries by recipientMemberId for type=received', async () => {
    mockFindMany.mockResolvedValueOnce([baseMessage])
    mockCount.mockResolvedValueOnce(1)

    await listMessagesForMember('mem-2', 'received', 1, 50)

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientMemberId: 'mem-2' } })
    )
  })

  it('MSG-16: passes orderBy sentAt desc and correct pagination', async () => {
    mockFindMany.mockResolvedValueOnce([])
    mockCount.mockResolvedValueOnce(0)

    await listMessagesForMember('mem-1', 'sent', 2, 10)

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { sentAt: 'desc' },
        skip: 10,
        take: 10,
      })
    )
  })
})

// ── getMessageForViewer ───────────────────────────────────────────────────────

describe('getMessageForViewer()', () => {
  it('returns message when viewer is the sender', async () => {
    mockFindUnique.mockResolvedValueOnce(baseMessage)

    const result = await getMessageForViewer('msg-1', { id: 'mem-1', role: 'member' })
    expect(result).toEqual(baseMessage)
  })

  it('returns message when viewer is the recipient', async () => {
    mockFindUnique.mockResolvedValueOnce(baseMessage)

    const result = await getMessageForViewer('msg-1', { id: 'mem-2', role: 'member' })
    expect(result).toEqual(baseMessage)
  })

  it('MSG-10: returns message when viewer is admin (not party to message)', async () => {
    mockFindUnique.mockResolvedValueOnce(baseMessage)

    const result = await getMessageForViewer('msg-1', { id: 'mem-admin', role: 'admin' })
    expect(result).toEqual(baseMessage)
  })

  it('MSG-06: throws FORBIDDEN when viewer is not sender, recipient, or admin', async () => {
    mockFindUnique.mockResolvedValueOnce(baseMessage)

    await expect(
      getMessageForViewer('msg-1', { id: 'mem-other', role: 'member' })
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  })

  it('throws NOT_FOUND when message does not exist', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    await expect(
      getMessageForViewer('msg-missing', { id: 'mem-1', role: 'member' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
