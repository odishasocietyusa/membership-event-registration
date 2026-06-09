// lib/payments/webhook-handlers.test.ts

jest.mock('@/lib/payments/payment-service', () => ({
  recordPayment: jest.fn(),
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    paymentRecord: {
      upsert: jest.fn(),
    },
    eventRegistration: {
      upsert: jest.fn(),
    },
    member: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/sanity/lib/client', () => ({
  sanityFetch: jest.fn().mockResolvedValue(null),
}))

jest.mock('@/lib/emails/event-registration-confirmation', () => ({
  sendEventRegistrationConfirmation: jest.fn().mockResolvedValue(undefined),
}))

import { handleCheckoutCompleted, handlePaymentFailed } from './webhook-handlers'
import { recordPayment } from '@/lib/payments/payment-service'
import { prisma } from '@/lib/db/prisma'

const mockRecordPayment      = recordPayment as jest.Mock
const mockUpsert             = prisma.paymentRecord.upsert as jest.Mock
const mockEventRegUpsert     = prisma.eventRegistration.upsert as jest.Mock
const mockMemberFindUnique   = prisma.member.findUnique as jest.Mock

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

// ── event_registration branch ─────────────────────────────────────────────

describe('handleCheckoutCompleted() — event_registration', () => {
  function makeEventRegSession(overrides: object = {}) {
    return {
      id: 'cs_evt_1',
      amount_total: 5000,
      payment_intent: 'pi_evt_1',
      metadata: {
        paymentType:  'event_registration',
        memberId:     'mem-1',
        sanityEventId: 'sanity-evt-1',
        guestCount:   '2',
      },
      ...overrides,
    }
  }

  beforeEach(() => {
    mockRecordPayment.mockResolvedValue(undefined)
    mockEventRegUpsert.mockResolvedValue({})
    mockMemberFindUnique.mockResolvedValue({ email: 'member@test.com', fullName: 'Test Member' })
  })

  it('WEBHOOK-01: member session → upserts EventRegistration by memberId, calls recordPayment', async () => {
    await handleCheckoutCompleted(makeEventRegSession() as never)

    expect(mockRecordPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentType: 'event_registration', memberId: 'mem-1' }),
    )
    expect(mockEventRegUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sanityEventId_memberId: { sanityEventId: 'sanity-evt-1', memberId: 'mem-1' } },
        create: expect.objectContaining({ status: 'confirmed', memberId: 'mem-1' }),
        update: expect.objectContaining({ status: 'confirmed' }),
      }),
    )
  })

  it('WEBHOOK-02: guest session (no memberId) → upserts by guestEmail, memberId null on PaymentRecord', async () => {
    await handleCheckoutCompleted(makeEventRegSession({
      metadata: {
        paymentType:   'event_registration',
        sanityEventId: 'sanity-evt-1',
        guestEmail:    'guest@example.com',
        guestName:     'Priya Das',
        guestCount:    '0',
      },
    }) as never)

    expect(mockRecordPayment).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: null }),
    )
    expect(mockEventRegUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sanityEventId_guestEmail: { sanityEventId: 'sanity-evt-1', guestEmail: 'guest@example.com' } },
      }),
    )
  })

  it('WEBHOOK-03: duplicate stripeEventId (P2002 on recordPayment) → returns without throwing', async () => {
    const duplicate = Object.assign(new Error('Unique'), { code: 'P2002' })
    mockRecordPayment.mockRejectedValueOnce(duplicate)

    await expect(handleCheckoutCompleted(makeEventRegSession() as never)).resolves.toBeUndefined()
    expect(mockEventRegUpsert).not.toHaveBeenCalled()
  })

  it('WEBHOOK-04: missing sanityEventId → logs error, returns without throwing', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    await handleCheckoutCompleted(makeEventRegSession({
      metadata: { paymentType: 'event_registration', memberId: 'mem-1' },
    }) as never)
    expect(consoleSpy).toHaveBeenCalled()
    expect(mockEventRegUpsert).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('WEBHOOK-05: membership paymentType does NOT call handleEventRegistrationCompleted', async () => {
    mockRecordPayment.mockResolvedValueOnce(undefined)
    await handleCheckoutCompleted(makeSession() as never)
    expect(mockEventRegUpsert).not.toHaveBeenCalled()
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
