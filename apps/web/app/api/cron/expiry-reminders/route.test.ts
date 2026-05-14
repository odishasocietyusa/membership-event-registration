// app/api/cron/expiry-reminders/route.test.ts

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    member: { findMany: jest.fn() },
  },
}))

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: jest.fn().mockResolvedValue({ id: 'email-1' }) },
  })),
}))

import { GET } from './route'
import { prisma } from '@/lib/db/prisma'

const mockFindMany = prisma.member.findMany as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
  process.env.CRON_SECRET = 'test-secret'
  process.env.ADMIN_NOTIFICATION_EMAIL = 'admin@test.com'
})

function makeRequest(secret?: string) {
  const headers: Record<string, string> = {}
  if (secret) headers.Authorization = `Bearer ${secret}`
  return new Request('http://test/api/cron/expiry-reminders', { headers })
}

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

  it('returns 200 with processed count when no members are expiring', async () => {
    mockFindMany.mockResolvedValueOnce([])

    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.processed).toBe(0)
    expect(body.emailsSent).toBe(0)
  })

  it('sends member email and admin notification for expiring members', async () => {
    const in7Days = new Date()
    in7Days.setDate(in7Days.getDate() + 5)

    mockFindMany.mockResolvedValueOnce([
      { id: 'mem-1', email: 'member@test.com', fullName: 'Test Member', expiryDate: in7Days },
    ])

    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.processed).toBe(1)
    expect(body.emailsSent).toBe(1)
  })
})
