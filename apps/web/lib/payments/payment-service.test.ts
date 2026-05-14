// lib/payments/payment-service.test.ts

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    paymentRecord: {
      findMany: jest.fn(),
      create:   jest.fn(),
    },
    membershipFee: {
      findUnique: jest.fn(),
      findMany:   jest.fn(),
    },
    member: {
      findUnique: jest.fn(),
      update:     jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

import { calculateCumulativePaid, calculateUpgradeCost, activateMembership, recordPayment } from './payment-service'
import { prisma } from '@/lib/db/prisma'

const mockPaymentRecord = prisma.paymentRecord as jest.Mocked<typeof prisma.paymentRecord>
const mockMembershipFee = prisma.membershipFee as jest.Mocked<typeof prisma.membershipFee>
const mockMember        = prisma.member        as jest.Mocked<typeof prisma.member>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockTransaction   = prisma.$transaction  as jest.Mock

beforeEach(() => jest.clearAllMocks())

// ── calculateCumulativePaid ────────────────────────────────────────────────

describe('calculateCumulativePaid()', () => {
  it('returns 0 when member has no completed payments', async () => {
    mockPaymentRecord.findMany.mockResolvedValueOnce([])
    mockMembershipFee.findMany.mockResolvedValueOnce([])

    const result = await calculateCumulativePaid('mem-1')
    expect(result).toBe(0)
  })

  it('sums only upgrade-path tier payments', async () => {
    mockPaymentRecord.findMany.mockResolvedValueOnce([
      { membershipType: 'annualSingle', amountCents: 2500 },
      { membershipType: 'annualFamily', amountCents: 4000 },
      { membershipType: 'patron',       amountCents: 50000 }, // excluded
    ])
    mockMembershipFee.findMany.mockResolvedValueOnce([
      { membershipType: 'annualSingle' },
      { membershipType: 'annualFamily' },
      // patron is NOT returned because isUpgradePath=false
    ])

    const result = await calculateCumulativePaid('mem-1')
    expect(result).toBe(6500) // 2500 + 4000, patron excluded
  })

  it('excludes patron and benefactor tiers from cumulative total', async () => {
    mockPaymentRecord.findMany.mockResolvedValueOnce([
      { membershipType: 'patron',      amountCents: 50000 },
      { membershipType: 'benefactor',  amountCents: 100000 },
    ])
    mockMembershipFee.findMany.mockResolvedValueOnce([]) // neither is upgrade-path

    const result = await calculateCumulativePaid('mem-1')
    expect(result).toBe(0)
  })
})

// ── calculateUpgradeCost ───────────────────────────────────────────────────

describe('calculateUpgradeCost()', () => {
  const activeMember = {
    id: 'mem-1',
    memberStatus: 'active',
    expiryDate: null,
  }
  const lifeFee = { amountDollars: 200 }

  it('returns eligible=true and correct cost for active member with prior payments', async () => {
    mockMember.findUnique.mockResolvedValueOnce(activeMember)
    mockMembershipFee.findUnique.mockResolvedValueOnce(lifeFee)
    // calculateCumulativePaid internals
    mockPaymentRecord.findMany.mockResolvedValueOnce([
      { membershipType: 'annualSingle', amountCents: 4000 },
    ])
    mockMembershipFee.findMany.mockResolvedValueOnce([
      { membershipType: 'annualSingle' },
    ])

    const result = await calculateUpgradeCost('mem-1')

    expect(result.eligible).toBe(true)
    expect(result.costCents).toBe(16000) // 20000 - 4000
    expect(result.autoActivate).toBe(false)
  })

  it('returns autoActivate=true when cumulative >= life fee', async () => {
    mockMember.findUnique.mockResolvedValueOnce(activeMember)
    mockMembershipFee.findUnique.mockResolvedValueOnce(lifeFee)
    mockPaymentRecord.findMany.mockResolvedValueOnce([
      { membershipType: 'annualSingle', amountCents: 20000 },
    ])
    mockMembershipFee.findMany.mockResolvedValueOnce([
      { membershipType: 'annualSingle' },
    ])

    const result = await calculateUpgradeCost('mem-1')

    expect(result.eligible).toBe(true)
    expect(result.costCents).toBe(0)
    expect(result.autoActivate).toBe(true)
  })

  it('returns eligible=true for member expired within 1 year', async () => {
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
    mockMember.findUnique.mockResolvedValueOnce({
      id: 'mem-1',
      memberStatus: 'expired',
      expiryDate: sixMonthsAgo,
    })
    mockMembershipFee.findUnique.mockResolvedValueOnce(lifeFee)
    mockPaymentRecord.findMany.mockResolvedValueOnce([])
    mockMembershipFee.findMany.mockResolvedValueOnce([])

    const result = await calculateUpgradeCost('mem-1')

    expect(result.eligible).toBe(true)
    expect(result.costCents).toBe(20000)
  })

  it('returns eligible=false for member expired more than 1 year ago', async () => {
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    mockMember.findUnique.mockResolvedValueOnce({
      id: 'mem-1',
      memberStatus: 'expired',
      expiryDate: twoYearsAgo,
    })

    const result = await calculateUpgradeCost('mem-1')

    expect(result.eligible).toBe(false)
    expect(result.reason).toMatch(/upgrade window expired/i)
  })

  it('returns eligible=false for member not found', async () => {
    mockMember.findUnique.mockResolvedValueOnce(null)

    const result = await calculateUpgradeCost('mem-unknown')

    expect(result.eligible).toBe(false)
    expect(result.reason).toMatch(/not found/i)
  })
})

// ── activateMembership ─────────────────────────────────────────────────────

describe('activateMembership()', () => {
  it('sets expiryDate for annual membership type', async () => {
    mockMember.update.mockResolvedValueOnce({})

    await activateMembership('mem-1', 'annualSingle')

    const call = mockMember.update.mock.calls[0][0]
    expect(call.data.memberStatus).toBe('active')
    expect(call.data.membershipType).toBe('annualSingle')
    expect(call.data.expiryDate).toBeInstanceOf(Date)
  })

  it('sets expiryDate=null for life membership', async () => {
    mockMember.update.mockResolvedValueOnce({})

    await activateMembership('mem-1', 'life')

    const call = mockMember.update.mock.calls[0][0]
    expect(call.data.expiryDate).toBeNull()
  })

  it('sets expiryDate=null for lifeWard membership', async () => {
    mockMember.update.mockResolvedValueOnce({})

    await activateMembership('mem-1', 'lifeWard')

    const call = mockMember.update.mock.calls[0][0]
    expect(call.data.expiryDate).toBeNull()
  })
})

// ── recordPayment ──────────────────────────────────────────────────────────

describe('recordPayment()', () => {
  it('creates payment record and activates membership in a transaction', async () => {
    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        paymentRecord: { create: jest.fn().mockResolvedValueOnce({}) },
        member: { update: jest.fn().mockResolvedValueOnce({}) },
      }
      await fn(tx)
    })

    await recordPayment({
      memberId:      'mem-1',
      status:        'completed',
      paymentType:   'membership',
      membershipType: 'annualSingle',
      amountCents:   2500,
    })

    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  it('does not call activateMembership when status is not completed', async () => {
    const txMock = {
      paymentRecord: { create: jest.fn().mockResolvedValueOnce({}) },
      member: { update: jest.fn() },
    }
    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<void>) => {
      await fn(txMock)
    })

    await recordPayment({
      memberId:      'mem-1',
      status:        'failed',
      paymentType:   'membership',
      membershipType: 'annualSingle',
      amountCents:   2500,
    })

    expect(txMock.member.update).not.toHaveBeenCalled()
  })

  it('does not call activateMembership for donation (no membershipType)', async () => {
    const txMock = {
      paymentRecord: { create: jest.fn().mockResolvedValueOnce({}) },
      member: { update: jest.fn() },
    }
    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<void>) => {
      await fn(txMock)
    })

    await recordPayment({
      status:      'completed',
      paymentType: 'donation',
      amountCents: 5000,
    })

    expect(txMock.member.update).not.toHaveBeenCalled()
  })
})
