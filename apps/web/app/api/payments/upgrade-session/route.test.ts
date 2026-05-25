// app/api/payments/upgrade-session/route.test.ts

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function) =>
    (req: Request) => handler(req, { user: { id: 'mem-1', email: 'user@test.com', role: 'member' } }),
}))

jest.mock('@/lib/payments/payment-service', () => ({
  calculateUpgradeCost: jest.fn(),
  recordPayment:        jest.fn(),
}))

jest.mock('@/lib/payments/stripe', () => ({
  createUpgradeSession: jest.fn(),
}))

import { POST } from './route'
import { calculateUpgradeCost, recordPayment } from '@/lib/payments/payment-service'
import { createUpgradeSession } from '@/lib/payments/stripe'

const mockCalculate    = calculateUpgradeCost as jest.Mock
const mockRecord       = recordPayment        as jest.Mock
const mockCreateSession = createUpgradeSession as jest.Mock

beforeEach(() => jest.clearAllMocks())

const req = new Request('http://test/api/payments/upgrade-session', {
  method: 'POST',
  headers: { Authorization: 'Bearer token' },
})

describe('POST /api/payments/upgrade-session', () => {
  it('returns Stripe checkout URL when upgrade cost > 0', async () => {
    mockCalculate.mockResolvedValueOnce({ eligible: true, costCents: 15000, autoActivate: false })
    mockCreateSession.mockResolvedValueOnce('https://checkout.stripe.com/upgrade')

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.url).toBe('https://checkout.stripe.com/upgrade')
    expect(mockCreateSession).toHaveBeenCalledWith('mem-1', 'user@test.com', 15000, 'life')
    expect(mockRecord).not.toHaveBeenCalled()
  })

  it('auto-activates life membership when cost is $0', async () => {
    mockCalculate.mockResolvedValueOnce({ eligible: true, costCents: 0, autoActivate: true })
    mockRecord.mockResolvedValueOnce(undefined)

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.activated).toBe(true)
    expect(mockRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId:      'mem-1',
        status:        'completed',
        paymentType:   'upgrade',
        membershipType: 'life',
        amountCents:   0,
      })
    )
    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('returns 400 when member is ineligible', async () => {
    mockCalculate.mockResolvedValueOnce({
      eligible: false,
      reason: 'Upgrade window expired. Membership expired more than 1 year ago.',
      costCents: 0,
      autoActivate: false,
    })

    const res = await POST(req)
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toMatch(/upgrade window expired/i)
  })
})
