// app/api/payments/[id]/refund/route.test.ts

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function, _opts?: unknown) =>
    (req: Request) =>
      handler(req, { user: { id: 'admin-1', email: 'admin@test.com', role: 'admin' } }),
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    paymentRecord: {
      findUnique: jest.fn(),
      update:     jest.fn(),
    },
  },
}))

jest.mock('@/lib/payments/stripe', () => ({
  issueRefund: jest.fn(),
}))

import { POST } from './route'
import { prisma } from '@/lib/db/prisma'
import { issueRefund } from '@/lib/payments/stripe'

const mockFindUnique = prisma.paymentRecord.findUnique as jest.Mock
const mockUpdate     = prisma.paymentRecord.update     as jest.Mock
const mockIssueRefund = issueRefund                    as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeRequest(paymentId: string, body: unknown) {
  return new Request(`http://test/api/payments/${paymentId}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin-token' },
    body: JSON.stringify(body),
  })
}

const completedPayment = {
  id: 'pay-1',
  status: 'completed',
  amountCents: 5000,
  stripePaymentIntentId: 'pi_test_123',
}

describe('POST /api/payments/:id/refund', () => {
  it('issues a full refund successfully', async () => {
    mockFindUnique.mockResolvedValueOnce(completedPayment)
    mockIssueRefund.mockResolvedValueOnce({})
    mockUpdate.mockResolvedValueOnce({ ...completedPayment, status: 'refunded', refundAmountCents: 5000 })

    const res = await POST(makeRequest('pay-1', { refundAmountCents: 5000, refundReason: 'Member requested' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.payment.status).toBe('refunded')
    expect(mockIssueRefund).toHaveBeenCalledWith('pi_test_123', 5000)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'refunded',
          refundAmountCents: 5000,
          refundReason: 'Member requested',
          approvedBy: 'admin@test.com',
        }),
      })
    )
  })

  it('issues a partial refund', async () => {
    mockFindUnique.mockResolvedValueOnce(completedPayment)
    mockIssueRefund.mockResolvedValueOnce({})
    mockUpdate.mockResolvedValueOnce({ ...completedPayment, status: 'refunded', refundAmountCents: 2000 })

    const res = await POST(makeRequest('pay-1', { refundAmountCents: 2000, refundReason: 'Partial refund' }))

    expect(res.status).toBe(200)
    expect(mockIssueRefund).toHaveBeenCalledWith('pi_test_123', 2000)
  })

  it('returns 400 when refund amount exceeds original amount', async () => {
    mockFindUnique.mockResolvedValueOnce(completedPayment)

    const res = await POST(makeRequest('pay-1', { refundAmountCents: 9999, refundReason: 'Too much' }))

    expect(res.status).toBe(400)
    expect(mockIssueRefund).not.toHaveBeenCalled()
  })

  it('returns 400 when refundReason is missing', async () => {
    const res = await POST(makeRequest('pay-1', { refundAmountCents: 1000 }))
    expect(res.status).toBe(400)
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it('returns 400 when refundReason is empty string', async () => {
    const res = await POST(makeRequest('pay-1', { refundAmountCents: 1000, refundReason: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 404 when payment not found', async () => {
    mockFindUnique.mockResolvedValueOnce(null)

    const res = await POST(makeRequest('pay-missing', { refundAmountCents: 1000, refundReason: 'reason' }))

    expect(res.status).toBe(404)
    expect(mockIssueRefund).not.toHaveBeenCalled()
  })

  it('returns 409 when payment already refunded', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...completedPayment, status: 'refunded' })

    const res = await POST(makeRequest('pay-1', { refundAmountCents: 1000, refundReason: 'reason' }))

    expect(res.status).toBe(409)
    expect(mockIssueRefund).not.toHaveBeenCalled()
  })

  it('returns 400 when no Stripe payment intent on record', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...completedPayment, stripePaymentIntentId: null })

    const res = await POST(makeRequest('pay-1', { refundAmountCents: 1000, refundReason: 'reason' }))

    expect(res.status).toBe(400)
    expect(mockIssueRefund).not.toHaveBeenCalled()
  })
})
