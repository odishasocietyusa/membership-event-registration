jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    member: {
      findMany: jest.fn(),
    },
    expiryNotice: {
      findUnique: jest.fn(),
      create: jest.fn().mockResolvedValue({}),
    },
  },
}))

jest.mock('@/lib/memberships/membership-service', () => ({
  expireOverdueMemberships: jest.fn().mockResolvedValue(0),
}))

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ id: 'email-1' }) },
  })),
}))

import { GET } from './route'
import { prisma } from '@/lib/db/prisma'

const mockFindMany = prisma.member.findMany as jest.Mock
const mockFindUnique = prisma.expiryNotice.findUnique as jest.Mock
const mockCreate = prisma.expiryNotice.create as jest.Mock

function dayOffset(n: number): Date {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + n)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

function makeMember(expiryDaysOut: number) {
  return {
    id: 'mem-1',
    email: 'member@test.com',
    fullName: 'Test Member',
    expiryDate: dayOffset(expiryDaysOut),
  }
}

function makeRequest(secret?: string) {
  const headers: Record<string, string> = {}
  if (secret) headers.Authorization = `Bearer ${secret}`
  return new Request('http://test/api/cron/expiry-reminders', { headers })
}

type MemberStub = ReturnType<typeof makeMember>

// Resolve findMany with [] for all 4 checkpoints, except the target index (0=180,1=90,2=30,3=7)
function setupSingleCheckpointMember(targetIndex: number, expiryDaysOut: number) {
  const member = makeMember(expiryDaysOut)
  const calls: MemberStub[][] = [[], [], [], []]
  calls[targetIndex] = [member]
  mockFindMany
    .mockResolvedValueOnce(calls[0])
    .mockResolvedValueOnce(calls[1])
    .mockResolvedValueOnce(calls[2])
    .mockResolvedValueOnce(calls[3])
  return member
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@test.com'
  mockFindUnique.mockResolvedValue(null)
})

describe('GET /api/cron/expiry-reminders', () => {
  it('returns 401 when CRON_SECRET does not match', async () => {
    const res = await GET(makeRequest('wrong-secret'))
    expect(res.status).toBe(401)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('returns 401 when Authorization header is missing', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 200 with processed:0 and emailsSent:0 when no members in any window', async () => {
    mockFindMany.mockResolvedValue([])

    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.processed).toBe(0)
    expect(body.emailsSent).toBe(0)
  })

  it('sends email and creates ExpiryNotice for 7-day checkpoint', async () => {
    setupSingleCheckpointMember(3, 7) // index 3 = 7-day checkpoint

    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.emailsSent).toBe(1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ noticeType: 'one_week' }) })
    )
  })

  it('sends email and creates ExpiryNotice for 30-day checkpoint', async () => {
    setupSingleCheckpointMember(2, 30) // index 2 = 30-day checkpoint

    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.emailsSent).toBe(1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ noticeType: 'one_month' }) })
    )
  })

  it('sends email and creates ExpiryNotice for 90-day checkpoint', async () => {
    setupSingleCheckpointMember(1, 90) // index 1 = 90-day checkpoint

    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.emailsSent).toBe(1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ noticeType: 'three_month' }) })
    )
  })

  it('sends email and creates ExpiryNotice for 180-day checkpoint', async () => {
    setupSingleCheckpointMember(0, 180) // index 0 = 180-day checkpoint

    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.emailsSent).toBe(1)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ noticeType: 'six_month' }) })
    )
  })

  it('skips member when ExpiryNotice already exists (dedup)', async () => {
    setupSingleCheckpointMember(3, 7)
    mockFindUnique.mockResolvedValue({ id: 'existing-notice' })

    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.emailsSent).toBe(0)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('logs error and continues when ExpiryNotice.create throws', async () => {
    setupSingleCheckpointMember(3, 7)
    mockCreate.mockRejectedValueOnce(new Error('DB write failed'))
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.emailsSent).toBe(1)
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
