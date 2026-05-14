// app/api/payments/checkout-session/route.test.ts

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function, _opts?: unknown) =>
    (req: Request) => handler(req, { user: { id: 'mem-1', email: 'user@test.com', role: 'member' } }),
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    membershipFee: { findUnique: jest.fn() },
  },
}))

jest.mock('@/lib/payments/stripe', () => ({
  createCheckoutSession: jest.fn(),
}))

import { POST } from './route'
import { prisma } from '@/lib/db/prisma'
import { createCheckoutSession } from '@/lib/payments/stripe'

const mockFindUnique = prisma.membershipFee.findUnique as jest.Mock
const mockCreateSession = createCheckoutSession as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeRequest(body: unknown) {
  return new Request('http://test/api/payments/checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/payments/checkout-session', () => {
  it('returns 200 with Stripe URL for valid membership type', async () => {
    mockFindUnique.mockResolvedValueOnce({ membershipType: 'annualSingle', amountDollars: 25, isAdminOnly: false })
    mockCreateSession.mockResolvedValueOnce('https://checkout.stripe.com/test')

    const res = await POST(makeRequest({ membershipType: 'annualSingle' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.url).toBe('https://checkout.stripe.com/test')
    expect(mockCreateSession).toHaveBeenCalledWith('mem-1', 'user@test.com', 'annualSingle', 25)
  })

  it('returns 400 for invalid membership type', async () => {
    const res = await POST(makeRequest({ membershipType: 'invalid-type' }))
    expect(res.status).toBe(400)
  })

  it('returns 403 for admin-only membership type (honoraryNoVote)', async () => {
    // honoraryNoVote is excluded from CheckoutSessionSchema so it returns 400 at validation
    // Test the isAdminOnly DB check path with a type that passes schema but is admin-only
    mockFindUnique.mockResolvedValueOnce({ membershipType: 'annualSingle', amountDollars: 0, isAdminOnly: true })

    const res = await POST(makeRequest({ membershipType: 'annualSingle' }))
    expect(res.status).toBe(403)
  })

  it('returns 400 when fee not found in DB', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const res = await POST(makeRequest({ membershipType: 'annualSingle' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON body', async () => {
    const req = new Request('http://test/api/payments/checkout-session', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: 'not json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
