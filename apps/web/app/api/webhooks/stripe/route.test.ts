// app/api/webhooks/stripe/route.test.ts

jest.mock('@/lib/payments/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: jest.fn(),
    },
  },
}))

jest.mock('@/lib/payments/webhook-handlers', () => ({
  handleCheckoutCompleted: jest.fn(),
  handlePaymentFailed:     jest.fn(),
}))

import { POST } from './route'
import { stripe } from '@/lib/payments/stripe'
import { handleCheckoutCompleted, handlePaymentFailed } from '@/lib/payments/webhook-handlers'

const mockConstructEvent    = stripe.webhooks.constructEvent    as jest.Mock
const mockCheckoutCompleted = handleCheckoutCompleted           as jest.Mock
const mockPaymentFailed     = handlePaymentFailed               as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeRequest(body: string, sig?: string) {
  const headers: Record<string, string> = {}
  if (sig) headers['stripe-signature'] = sig
  return new Request('http://test/api/webhooks/stripe', {
    method: 'POST',
    headers,
    body,
  })
}

describe('POST /api/webhooks/stripe', () => {
  it('returns 400 when stripe-signature header is missing', async () => {
    const res = await POST(makeRequest('body'))
    expect(res.status).toBe(400)
    expect(mockConstructEvent).not.toHaveBeenCalled()
  })

  it('returns 400 when signature verification fails', async () => {
    mockConstructEvent.mockImplementationOnce(() => {
      throw new Error('Invalid signature')
    })

    const res = await POST(makeRequest('body', 'bad-sig'))
    expect(res.status).toBe(400)
  })

  it('routes checkout.session.completed to handleCheckoutCompleted', async () => {
    const session = { id: 'cs_123', metadata: {} }
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: { object: session },
    })
    mockCheckoutCompleted.mockResolvedValueOnce(undefined)

    const res = await POST(makeRequest('body', 'valid-sig'))

    expect(res.status).toBe(200)
    expect(mockCheckoutCompleted).toHaveBeenCalledWith(session)
    expect(mockPaymentFailed).not.toHaveBeenCalled()
  })

  it('routes checkout.session.async_payment_failed to handlePaymentFailed', async () => {
    const session = { id: 'cs_456', metadata: {} }
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.async_payment_failed',
      data: { object: session },
    })
    mockPaymentFailed.mockResolvedValueOnce(undefined)

    const res = await POST(makeRequest('body', 'valid-sig'))

    expect(res.status).toBe(200)
    expect(mockPaymentFailed).toHaveBeenCalledWith(session)
  })

  it('routes checkout.session.expired to handlePaymentFailed', async () => {
    const session = { id: 'cs_789', metadata: {} }
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.expired',
      data: { object: session },
    })
    mockPaymentFailed.mockResolvedValueOnce(undefined)

    const res = await POST(makeRequest('body', 'valid-sig'))

    expect(res.status).toBe(200)
    expect(mockPaymentFailed).toHaveBeenCalledWith(session)
  })

  it('returns 200 and ignores unknown event types', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'customer.created',
      data: { object: {} },
    })

    const res = await POST(makeRequest('body', 'valid-sig'))

    expect(res.status).toBe(200)
    expect(mockCheckoutCompleted).not.toHaveBeenCalled()
    expect(mockPaymentFailed).not.toHaveBeenCalled()
  })

  it('returns 500 when handler throws', async () => {
    mockConstructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: { object: {} },
    })
    mockCheckoutCompleted.mockRejectedValueOnce(new Error('DB error'))

    const res = await POST(makeRequest('body', 'valid-sig'))

    expect(res.status).toBe(500)
  })
})
