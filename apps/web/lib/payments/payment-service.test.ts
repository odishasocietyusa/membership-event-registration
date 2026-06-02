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

import {
  calculateCumulativePaid,
  calculateUpgradeCost,
  activateMembership,
  recordPayment,
  applyUpgrade,
} from './payment-service'
import { prisma } from '@/lib/db/prisma'

const mockPaymentRecord = prisma.paymentRecord as jest.Mocked<typeof prisma.paymentRecord>
const mockMembershipFee = prisma.membershipFee as jest.Mocked<typeof prisma.membershipFee>
const mockMember        = prisma.member        as jest.Mocked<typeof prisma.member>
const mockTransaction   = prisma.$transaction  as jest.Mock

beforeEach(() => jest.clearAllMocks())

// ── calculateCumulativePaid ────────────────────────────────────────────────

describe('calculateCumulativePaid()', () => {
  it('returns 0 when member has no completed payments', async () => {
    mockMember.findUnique.mockResolvedValueOnce({ consecutiveSince: null } as any)
    mockPaymentRecord.findMany.mockResolvedValueOnce([])
    mockMembershipFee.findMany.mockResolvedValueOnce([])

    const result = await calculateCumulativePaid('mem-1')
    expect(result).toBe(0)
  })

  it('sums only upgrade-path tier payments', async () => {
    mockMember.findUnique.mockResolvedValueOnce({ consecutiveSince: null } as any)
    mockPaymentRecord.findMany.mockResolvedValueOnce([
      { membershipType: 'annualSingle', amountCents: 2500 },
      { membershipType: 'annualFamily', amountCents: 4000 },
    ] as any)
    mockMembershipFee.findMany.mockResolvedValueOnce([
      { membershipType: 'annualSingle' },
      { membershipType: 'annualFamily' },
    ] as any)

    const result = await calculateCumulativePaid('mem-1')
    expect(result).toBe(6500)
  })

  it('excludes patron and benefactor when isUpgradePath=false', async () => {
    mockMember.findUnique.mockResolvedValueOnce({ consecutiveSince: null } as any)
    mockPaymentRecord.findMany.mockResolvedValueOnce([
      { membershipType: 'patron',     amountCents: 50000 },
      { membershipType: 'benefactor', amountCents: 100000 },
    ] as any)
    mockMembershipFee.findMany.mockResolvedValueOnce([]) // neither returned — isUpgradePath=false

    const result = await calculateCumulativePaid('mem-1')
    expect(result).toBe(0)
  })

  it('filters payments by consecutiveSince when set', async () => {
    const since = new Date('2025-01-01')
    mockMember.findUnique.mockResolvedValueOnce({ consecutiveSince: since } as any)
    mockPaymentRecord.findMany.mockResolvedValueOnce([
      { membershipType: 'annualSingle', amountCents: 2500 },
    ] as any)
    mockMembershipFee.findMany.mockResolvedValueOnce([
      { membershipType: 'annualSingle' },
    ] as any)

    const result = await calculateCumulativePaid('mem-1')
    expect(result).toBe(2500)
    // Verify createdAt filter was passed
    const findManyCall = mockPaymentRecord.findMany.mock.calls[0]?.[0]
    expect(findManyCall?.where?.createdAt).toEqual({ gte: since })
  })
})

// ── calculateUpgradeCost ───────────────────────────────────────────────────

describe('calculateUpgradeCost()', () => {
  const activeMember = { id: 'mem-1', memberStatus: 'active', expiryDate: null }
  const lifeFee = { amountDollars: 200 }

  it('returns eligible=true and correct cost for active member with prior payments', async () => {
    mockMember.findUnique
      .mockResolvedValueOnce(activeMember as any)           // calculateUpgradeCost fetch
      .mockResolvedValueOnce({ consecutiveSince: null } as any) // calculateCumulativePaid fetch
    mockMembershipFee.findUnique.mockResolvedValueOnce(lifeFee as any)
    mockPaymentRecord.findMany.mockResolvedValueOnce([
      { membershipType: 'annualSingle', amountCents: 4000 },
    ] as any)
    mockMembershipFee.findMany.mockResolvedValueOnce([
      { membershipType: 'annualSingle' },
    ] as any)

    const result = await calculateUpgradeCost('mem-1', 'life')

    expect(result.eligible).toBe(true)
    expect(result.costCents).toBe(16000) // 20000 - 4000
    expect(result.autoActivate).toBe(false)
  })

  it('returns autoActivate=true when cumulative >= target fee', async () => {
    mockMember.findUnique
      .mockResolvedValueOnce(activeMember as any)
      .mockResolvedValueOnce({ consecutiveSince: null } as any)
    mockMembershipFee.findUnique.mockResolvedValueOnce(lifeFee as any)
    mockPaymentRecord.findMany.mockResolvedValueOnce([
      { membershipType: 'annualSingle', amountCents: 20000 },
    ] as any)
    mockMembershipFee.findMany.mockResolvedValueOnce([
      { membershipType: 'annualSingle' },
    ] as any)

    const result = await calculateUpgradeCost('mem-1', 'life')

    expect(result.eligible).toBe(true)
    expect(result.costCents).toBe(0)
    expect(result.autoActivate).toBe(true)
  })

  it('returns eligible=false for expired member', async () => {
    mockMember.findUnique.mockResolvedValueOnce({
      id: 'mem-1',
      memberStatus: 'expired',
      expiryDate: new Date(),
    } as any)

    const result = await calculateUpgradeCost('mem-1', 'life')

    expect(result.eligible).toBe(false)
    expect(result.reason).toMatch(/only active members/i)
  })

  it('returns eligible=false for member not found', async () => {
    mockMember.findUnique.mockResolvedValueOnce(null)

    const result = await calculateUpgradeCost('mem-unknown', 'life')

    expect(result.eligible).toBe(false)
    expect(result.reason).toMatch(/not found/i)
  })

  it('returns eligible=false for unknown targetType', async () => {
    mockMember.findUnique.mockResolvedValueOnce(activeMember as any)
    mockMembershipFee.findUnique.mockResolvedValueOnce(null)

    const result = await calculateUpgradeCost('mem-1', 'life')

    expect(result.eligible).toBe(false)
    expect(result.reason).toMatch(/unknown/i)
  })
})

// ── applyUpgrade ───────────────────────────────────────────────────────────

describe('applyUpgrade()', () => {
  it('sets expiryDate=null when upgrading to life', async () => {
    mockMember.findUnique.mockResolvedValueOnce({ expiryDate: new Date('2027-01-01') } as any)
    mockMember.update.mockResolvedValueOnce({} as any)

    await applyUpgrade('mem-1', 'life')

    const call = mockMember.update.mock.calls[0][0]
    expect(call.data.membershipType).toBe('life')
    expect(call.data.expiryDate).toBeNull()
  })

  it('sets expiryDate=null when upgrading to patron', async () => {
    mockMember.findUnique.mockResolvedValueOnce({ expiryDate: new Date('2027-01-01') } as any)
    mockMember.update.mockResolvedValueOnce({} as any)

    await applyUpgrade('mem-1', 'patron')

    const call = mockMember.update.mock.calls[0][0]
    expect(call.data.expiryDate).toBeNull()
  })

  it('sets expiryDate=null when upgrading to benefactor', async () => {
    mockMember.findUnique.mockResolvedValueOnce({ expiryDate: null } as any)
    mockMember.update.mockResolvedValueOnce({} as any)

    await applyUpgrade('mem-1', 'benefactor')

    const call = mockMember.update.mock.calls[0][0]
    expect(call.data.expiryDate).toBeNull()
  })

  it('sets expiryDate ~60 months out when upgrading to fiveYearFamily', async () => {
    mockMember.findUnique.mockResolvedValueOnce({ expiryDate: new Date('2027-01-01') } as any)
    mockMember.update.mockResolvedValueOnce({} as any)

    const before = new Date()
    await applyUpgrade('mem-1', 'fiveYearFamily')
    const after = new Date()

    const call = mockMember.update.mock.calls[0][0]
    const expiry = call.data.expiryDate as Date
    expect(expiry).toBeInstanceOf(Date)
    // Should be ~60 months from now — check year range
    const expectedYear = before.getFullYear() + 5
    expect(expiry.getFullYear()).toBeGreaterThanOrEqual(expectedYear)
    expect(expiry.getFullYear()).toBeLessThanOrEqual(after.getFullYear() + 5)
  })

  it('preserves expiryDate when upgrading between annual tiers', async () => {
    const existingExpiry = new Date('2027-06-15')
    mockMember.findUnique.mockResolvedValueOnce({ expiryDate: existingExpiry } as any)
    mockMember.update.mockResolvedValueOnce({} as any)

    await applyUpgrade('mem-1', 'annualFamily')

    const call = mockMember.update.mock.calls[0][0]
    expect(call.data.expiryDate).toEqual(existingExpiry)
  })

  it('throws when member not found', async () => {
    mockMember.findUnique.mockResolvedValueOnce(null)

    await expect(applyUpgrade('mem-unknown', 'life')).rejects.toThrow('applyUpgrade')
  })
})

// ── activateMembership ─────────────────────────────────────────────────────

describe('activateMembership()', () => {
  it('sets expiryDate for annual membership type', async () => {
    mockMember.findUnique.mockResolvedValueOnce({ memberStatus: 'active', consecutiveSince: new Date() } as any)
    mockMember.update.mockResolvedValueOnce({} as any)

    await activateMembership('mem-1', 'annualSingle')

    const call = mockMember.update.mock.calls[0][0]
    expect(call.data.memberStatus).toBe('active')
    expect(call.data.membershipType).toBe('annualSingle')
    expect(call.data.expiryDate).toBeInstanceOf(Date)
  })

  it('sets expiryDate=null for life membership', async () => {
    mockMember.findUnique.mockResolvedValueOnce({ memberStatus: 'active', consecutiveSince: new Date() } as any)
    mockMember.update.mockResolvedValueOnce({} as any)

    await activateMembership('mem-1', 'life')

    const call = mockMember.update.mock.calls[0][0]
    expect(call.data.expiryDate).toBeNull()
  })

  it('sets expiryDate=null for patron membership', async () => {
    mockMember.findUnique.mockResolvedValueOnce({ memberStatus: 'active', consecutiveSince: new Date() } as any)
    mockMember.update.mockResolvedValueOnce({} as any)

    await activateMembership('mem-1', 'patron')

    const call = mockMember.update.mock.calls[0][0]
    expect(call.data.expiryDate).toBeNull()
  })

  it('resets consecutiveSince when member was expired', async () => {
    mockMember.findUnique.mockResolvedValueOnce({ memberStatus: 'expired', consecutiveSince: new Date('2020-01-01') } as any)
    mockMember.update.mockResolvedValueOnce({} as any)

    await activateMembership('mem-1', 'annualSingle')

    const call = mockMember.update.mock.calls[0][0]
    expect(call.data.consecutiveSince).toBeInstanceOf(Date)
  })

  it('preserves consecutiveSince when member was already active (renewal)', async () => {
    const since = new Date('2023-06-01')
    mockMember.findUnique.mockResolvedValueOnce({ memberStatus: 'active', consecutiveSince: since } as any)
    mockMember.update.mockResolvedValueOnce({} as any)

    await activateMembership('mem-1', 'annualSingle')

    const call = mockMember.update.mock.calls[0][0]
    expect(call.data.consecutiveSince).toBeUndefined()
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
      memberId:       'mem-1',
      status:         'completed',
      paymentType:    'membership',
      membershipType: 'annualSingle',
      amountCents:    2500,
    })

    expect(mockTransaction).toHaveBeenCalledTimes(1)
  })

  it('does not call activate or applyUpgrade when status is not completed', async () => {
    const txMock = {
      paymentRecord: { create: jest.fn().mockResolvedValueOnce({}) },
      member: { update: jest.fn() },
    }
    mockTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<void>) => {
      await fn(txMock)
    })

    await recordPayment({
      memberId:       'mem-1',
      status:         'failed',
      paymentType:    'membership',
      membershipType: 'annualSingle',
      amountCents:    2500,
    })

    expect(txMock.member.update).not.toHaveBeenCalled()
  })

  it('does not activate for donation (no membershipType)', async () => {
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
