// lib/payments/webhook-handlers.test.ts

jest.mock('@/lib/payments/payment-service', () => ({
  recordPayment: jest.fn(),
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    paymentRecord: {
      upsert: jest.fn(),
    },
  },
}))

import { handleCheckoutCompleted, handlePaymentFailed } from './webhook-handlers'
import { recordPayment } from '@/lib/payments/payment-service'
import { prisma } from '@/lib/db/prisma'

const mockRecordPayment = recordPayment as jest.Mock
const mockUpsert = prisma.paymentRecord.upsert as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeSession(overrides: object = {}) {
  return {
    id: 'cs_test_123',
    amount_total: 2500,
    payment_intent: 'pi_test_456',
    metadata: {
      memberId:      'mem-1',
      paymentType:   'membership',
      membershipType: 'annualSingle',
    },
    ...overrides,
  }
}

// ── handleCheckoutCompleted ────────────────────────────────────────────────

describe('handleCheckoutCompleted()', () => {
  it('calls recordPayment with correct arguments', async () => {
    mockRecordPayment.mockResolvedValueOnce(undefined)

    await handleCheckoutCompleted(makeSession() as never)

    expect(mockRecordPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        memberId:     'mem-1',
        status:       'completed',
        paymentType:  'membership',
        membershipType: 'annualSingle',
        amountCents:  2500,
      })
    )
  })

  it('is idempotent — silently ignores P2002 unique constraint error', async () => {
    const duplicate = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    mockRecordPayment.mockRejectedValueOnce(duplicate)

    await expect(handleCheckoutCompleted(makeSession() as never)).resolves.toBeUndefined()
  })

  it('rethrows non-P2002 errors', async () => {
    const unexpected = new Error('DB connection lost')
    mockRecordPayment.mockRejectedValueOnce(unexpected)

    await expect(handleCheckoutCompleted(makeSession() as never)).rejects.toThrow('DB connection lost')
  })

  it('returns early when paymentType metadata is missing', async () => {
    await handleCheckoutCompleted(makeSession({ metadata: {} }) as never)
    expect(mockRecordPayment).not.toHaveBeenCalled()
  })

  it('sets memberId to null when missing from metadata', async () => {
    mockRecordPayment.mockResolvedValueOnce(undefined)

    await handleCheckoutCompleted(
      makeSession({ metadata: { paymentType: 'donation' } }) as never
    )

    expect(mockRecordPayment).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: null })
    )
  })
})

// ── handlePaymentFailed ────────────────────────────────────────────────────

describe('handlePaymentFailed()', () => {
  it('upserts a failed payment record', async () => {
    mockUpsert.mockResolvedValueOnce({})

    await handlePaymentFailed(makeSession() as never)

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeEventId: 'cs_test_123' },
        update: { status: 'failed' },
        create: expect.objectContaining({ status: 'failed' }),
      })
    )
  })
})
