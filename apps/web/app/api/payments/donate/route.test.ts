// app/api/payments/donate/route.test.ts

const mockGetUser = jest.fn()

jest.mock('@/lib/auth/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser: mockGetUser },
  }),
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    member: { findUnique: jest.fn() },
  },
}))

jest.mock('@/lib/payments/stripe', () => ({
  createDonationSession: jest.fn(),
}))

import { POST } from './route'
import { prisma } from '@/lib/db/prisma'
import { createDonationSession } from '@/lib/payments/stripe'

const mockFindUnique   = prisma.member.findUnique   as jest.Mock
const mockDonateSession = createDonationSession     as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeRequest(body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return new Request('http://test/api/payments/donate', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('POST /api/payments/donate', () => {
  it('returns checkout URL for unauthenticated donation', async () => {
    mockDonateSession.mockResolvedValueOnce('https://checkout.stripe.com/donate')

    const res = await POST(makeRequest({ amountCents: 5000 }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.url).toBe('https://checkout.stripe.com/donate')
    expect(mockDonateSession).toHaveBeenCalledWith(5000, null, null)
  })

  it('attaches memberId when authenticated member donates', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { email: 'user@test.com' } } })
    mockFindUnique.mockResolvedValueOnce({ id: 'mem-1', email: 'user@test.com' })
    mockDonateSession.mockResolvedValueOnce('https://checkout.stripe.com/donate-member')

    const res = await POST(makeRequest({ amountCents: 10000 }, 'valid-token'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(mockDonateSession).toHaveBeenCalledWith(10000, 'mem-1', 'user@test.com')
  })

  it('passes null memberId when isAnonymous=true even for authenticated user', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { email: 'user@test.com' } } })
    mockFindUnique.mockResolvedValueOnce({ id: 'mem-1', email: 'user@test.com' })
    mockDonateSession.mockResolvedValueOnce('https://checkout.stripe.com/anon')

    const res = await POST(makeRequest({ amountCents: 10000, isAnonymous: true }, 'valid-token'))

    expect(res.status).toBe(200)
    expect(mockDonateSession).toHaveBeenCalledWith(10000, null, null)
  })

  it('returns 400 when amountCents < 100 (less than $1)', async () => {
    const res = await POST(makeRequest({ amountCents: 50 }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing amountCents', async () => {
    const res = await POST(makeRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON', async () => {
    const req = new Request('http://test/api/payments/donate', {
      method: 'POST',
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
