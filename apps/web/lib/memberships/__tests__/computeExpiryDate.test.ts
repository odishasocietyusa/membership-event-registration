import { computeExpiryDate } from '../expiry'
import type { MembershipType } from '@prisma/client'

describe('computeExpiryDate', () => {
  it('should return null for non-expiring tiers', () => {
    const paymentDate = new Date('2026-06-15T12:00:00Z')
    const nonExpiringTiers: MembershipType[] = ['life', 'lifeWard', 'honoraryNoVote', 'patron', 'benefactor']
    for (const type of nonExpiringTiers) {
      expect(computeExpiryDate(type, paymentDate)).toBeNull()
    }
  })

  it('should calculate exactly 12 months for annual tiers', () => {
    const paymentDate = new Date('2026-06-15T12:00:00.000Z')
    const annualTiers: MembershipType[] = ['annualStudentNoVote', 'annualSingle', 'annualFamily']
    for (const type of annualTiers) {
      const expiry = computeExpiryDate(type, paymentDate)
      expect(expiry).toBeInstanceOf(Date)
      expect(expiry?.toISOString()).toBe('2027-06-15T12:00:00.000Z')
    }
  })

  it('should calculate exactly 60 months for five-year tiers', () => {
    const paymentDate = new Date('2026-03-01T12:00:00.000Z')
    const expiry = computeExpiryDate('fiveYearFamily', paymentDate)
    expect(expiry).toBeInstanceOf(Date)
    expect(expiry?.toISOString()).toBe('2031-03-01T12:00:00.000Z')
  })

  it('should handle leap day payments correctly for annual tiers', () => {
    const paymentDate = new Date('2028-02-29T12:00:00.000Z')
    const expiry = computeExpiryDate('annualSingle', paymentDate)
    expect(expiry).toBeInstanceOf(Date)
    // 2029 is not a leap year, so it should clamp to Feb 28th
    expect(expiry?.toISOString()).toBe('2029-02-28T12:00:00.000Z')
  })

  it('should handle leap day payments correctly for five-year tiers', () => {
    const paymentDate = new Date('2028-02-29T12:00:00.000Z')
    const expiry = computeExpiryDate('fiveYearFamily', paymentDate)
    expect(expiry).toBeInstanceOf(Date)
    // 2033 is not a leap year, so it should clamp to Feb 28th
    expect(expiry?.toISOString()).toBe('2033-02-28T12:00:00.000Z')
  })

  it('should handle month-end boundary clamping (leap day to non-leap day)', () => {
    const paymentDate = new Date('2028-02-29T12:00:00.000Z')
    const expiry = computeExpiryDate('annualSingle', paymentDate)
    expect(expiry).toBeInstanceOf(Date)
    // Feb 29 + 12 months is Feb 28 in a non-leap year (2029)
    expect(expiry?.getUTCMonth()).toBe(1) // February (0-indexed)
    expect(expiry?.getUTCDate()).toBe(28)
  })


  it('should return null for invalid/unknown membership types', () => {
    const paymentDate = new Date('2026-06-15T12:00:00Z')
    expect(computeExpiryDate('invalidType' as MembershipType, paymentDate)).toBeNull()
  })
})
