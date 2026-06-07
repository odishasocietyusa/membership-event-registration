jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    member: {
      findMany: jest.fn(),
    },
  },
}))

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ id: 'email-1' }) },
  })),
}))

import { GET } from './route'
import { prisma } from '@/lib/db/prisma'
import { Resend } from 'resend'

const mockFindMany = prisma.member.findMany as jest.Mock
const mockResendInstance = { emails: { send: jest.fn().mockResolvedValue({ id: 'email-1' }) } }
;(Resend as jest.Mock).mockImplementation(() => mockResendInstance)

function makeRequest(secret?: string) {
  const headers: Record<string, string> = {}
  if (secret) headers.Authorization = `Bearer ${secret}`
  return new Request('http://test/api/cron/membership-digest', { headers })
}

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@test.com'
  mockResendInstance.emails.send.mockResolvedValue({ id: 'email-1' })
})

describe('GET /api/cron/membership-digest', () => {
  it('returns 401 for bad or missing secret', async () => {
    const res = await GET(makeRequest('wrong'))
    expect(res.status).toBe(401)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it('returns 200 with memberCount:0 when no members expiring', async () => {
    mockFindMany.mockResolvedValue([])

    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.memberCount).toBe(0)
    expect(mockResendInstance.emails.send).not.toHaveBeenCalled()
  })

  it('sends admin email listing expiring members', async () => {
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + 10)

    mockFindMany.mockResolvedValue([
      { fullName: 'Alice', email: 'alice@test.com', expiryDate },
      { fullName: null,   email: 'bob@test.com',   expiryDate },
    ])

    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.memberCount).toBe(2)
    expect(mockResendInstance.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@test.com',
        subject: expect.stringContaining('2'),
      })
    )
  })

  it('skips email when ADMIN_NOTIFICATION_EMAIL is not set', async () => {
    delete process.env.ADMIN_NOTIFICATION_EMAIL

    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.skipped).toBe(true)
    expect(mockFindMany).not.toHaveBeenCalled()
    expect(mockResendInstance.emails.send).not.toHaveBeenCalled()
  })
})
