// app/api/members/check-email/route.test.ts
// Tests REG-CE-01 through REG-CE-03

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    member: { findUnique: jest.fn() },
  },
}))

import { GET } from '@/app/api/members/check-email/route'
import { prisma } from '@/lib/db/prisma'

const mockFindUnique = prisma.member.findUnique as jest.Mock

function makeRequest(email?: string): Request {
  const base = 'http://localhost:3000/api/members/check-email'
  const url = email ? `${base}?email=${encodeURIComponent(email)}` : base
  return new Request(url)
}

describe('GET /api/members/check-email', () => {
  beforeEach(() => jest.clearAllMocks())

  // REG-CE-01: unknown email → exists: false
  it('REG-CE-01: returns { exists: false } for an unregistered email', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const res = await GET(makeRequest('new@test.com'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.exists).toBe(false)
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { email: 'new@test.com' }, select: { id: true } })
  })

  // REG-CE-02: known email → exists: true
  it('REG-CE-02: returns { exists: true } for a registered email', async () => {
    mockFindUnique.mockResolvedValueOnce({ id: 'mem-1' })

    const res = await GET(makeRequest('existing@test.com'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.exists).toBe(true)
  })

  // REG-CE-03: missing email param → 400
  it('REG-CE-03: returns 400 when email query param is absent', async () => {
    const res = await GET(makeRequest())

    expect(res.status).toBe(400)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })
})
