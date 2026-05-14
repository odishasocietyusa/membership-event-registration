// lib/members/member-service.test.ts
// Unit tests for member-service — SVC-01 through SVC-08

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    member: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    familyMember: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    paymentRecord: {
      findMany: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
    },
    chapter: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  },
}))

import { prisma } from '@/lib/db/prisma'
import {
  softDeleteMember,
  linkMemberAccount,
  softDeleteFamilyMember,
  exportMemberData,
  listMembers,
} from '@/lib/members/member-service'

const mockMember = prisma.member as jest.Mocked<typeof prisma.member>
const mockFamilyMember = prisma.familyMember as jest.Mocked<typeof prisma.familyMember>
const mockPaymentRecord = prisma.paymentRecord as jest.Mocked<typeof prisma.paymentRecord>

const baseMember = {
  id: 'mem-1',
  userId: 'uid-1',
  stripeCustomerId: null,
  email: 'user@test.com',
  fullName: 'Test User',
  phone: null,
  address: null,
  chapterId: null,
  membershipType: null,
  memberStatus: null,
  joinDate: null,
  expiryDate: null,
  profileVisibility: null,
  profileData: null,
  role: 'member' as const,
  souvenirPreference: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  deletedAt: null,
}

const baseFamilyMember = {
  id: 'fm-1',
  primaryMemberId: 'mem-1',
  fullName: 'Spouse Name',
  relation: 'spouse' as const,
  dateOfBirth: null,
  highSchoolGraduationYear: null,
  deletedAt: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
}

describe('member-service', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // SVC-01: softDeleteMember also soft-deletes all family rows
  describe('softDeleteMember', () => {
    it('SVC-01: sets deletedAt on member AND calls familyMember.updateMany with deletedAt', async () => {
      mockMember.findUnique.mockResolvedValueOnce(baseMember)
      mockMember.update.mockResolvedValueOnce({ ...baseMember, deletedAt: new Date() })
      mockFamilyMember.updateMany.mockResolvedValueOnce({ count: 2 })

      await softDeleteMember('mem-1')

      expect(mockMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mem-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        })
      )

      expect(mockFamilyMember.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { primaryMemberId: 'mem-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        })
      )
    })

    it('throws NOT_FOUND when member does not exist', async () => {
      mockMember.findUnique.mockResolvedValueOnce(null)

      await expect(softDeleteMember('nonexistent')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })

  // SVC-02: linkMemberAccount — same userId already set → idempotent, no update called
  describe('linkMemberAccount', () => {
    it('SVC-02: returns member without calling update when same userId already set', async () => {
      mockMember.findUnique.mockResolvedValueOnce(baseMember) // userId = 'uid-1'

      const result = await linkMemberAccount('user@test.com', 'uid-1')

      expect(result).toEqual(baseMember)
      expect(mockMember.update).not.toHaveBeenCalled()
    })

    // SVC-03: linkMemberAccount — different userId → throws CONFLICT
    it('SVC-03: throws CONFLICT when a different userId is already linked', async () => {
      mockMember.findUnique.mockResolvedValueOnce({ ...baseMember, userId: 'uid-other' })

      await expect(linkMemberAccount('user@test.com', 'uid-new')).rejects.toMatchObject({
        code: 'CONFLICT',
      })
      expect(mockMember.update).not.toHaveBeenCalled()
    })

    // SVC-04: linkMemberAccount — email not found → throws NOT_FOUND
    it('SVC-04: throws NOT_FOUND when email does not match any member', async () => {
      mockMember.findUnique.mockResolvedValueOnce(null)

      await expect(linkMemberAccount('unknown@test.com', 'uid-1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('links userId when member has no userId yet', async () => {
      const unlinked = { ...baseMember, userId: null }
      const linked = { ...baseMember, userId: 'uid-new' }
      mockMember.findUnique.mockResolvedValueOnce(unlinked)
      mockMember.update.mockResolvedValueOnce(linked)

      const result = await linkMemberAccount('user@test.com', 'uid-new')

      expect(mockMember.update).toHaveBeenCalledWith({
        where: { id: 'mem-1' },
        data: { userId: 'uid-new' },
      })
      expect(result).toEqual(linked)
    })
  })

  // SVC-05: softDeleteFamilyMember — wrong owner → throws FORBIDDEN
  describe('softDeleteFamilyMember', () => {
    it('SVC-05: throws FORBIDDEN when requestingMemberId does not match primaryMemberId', async () => {
      mockFamilyMember.findUnique.mockResolvedValueOnce({
        ...baseFamilyMember,
        primaryMemberId: 'mem-1',
      })

      await expect(softDeleteFamilyMember('fm-1', 'mem-other')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      })
      expect(mockFamilyMember.update).not.toHaveBeenCalled()
    })

    it('soft-deletes family member when owner matches', async () => {
      mockFamilyMember.findUnique.mockResolvedValueOnce(baseFamilyMember)
      mockFamilyMember.update.mockResolvedValueOnce({ ...baseFamilyMember, deletedAt: new Date() })

      await softDeleteFamilyMember('fm-1', 'mem-1')

      expect(mockFamilyMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'fm-1' },
          data: expect.objectContaining({ deletedAt: expect.any(Date) }),
        })
      )
    })

    it('throws NOT_FOUND when family member does not exist', async () => {
      mockFamilyMember.findUnique.mockResolvedValueOnce(null)

      await expect(softDeleteFamilyMember('nonexistent', 'mem-1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })

    it('throws NOT_FOUND for already soft-deleted family member', async () => {
      // findUnique with deletedAt: null filter returns null for deleted rows
      mockFamilyMember.findUnique.mockResolvedValueOnce(null)

      await expect(softDeleteFamilyMember('fm-deleted', 'mem-1')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })

  // SVC-06: exportMemberData — full GDPR bundle including messages
  describe('exportMemberData', () => {
    it('SVC-06: export bundle includes member, family, payments, sentMessages, receivedMessages', async () => {
      mockMember.findUnique.mockResolvedValueOnce(baseMember)
      mockFamilyMember.findMany.mockResolvedValueOnce([baseFamilyMember])
      mockPaymentRecord.findMany.mockResolvedValueOnce([])
      ;(prisma.message.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      const result = await exportMemberData('mem-1')

      expect(result).toHaveProperty('member', baseMember)
      expect(result).toHaveProperty('familyMembers')
      expect(result).toHaveProperty('paymentRecords')
      expect(result).toHaveProperty('sentMessages')
      expect(result).toHaveProperty('receivedMessages')
      expect(result).toHaveProperty('exportDate')
    })

    it('throws NOT_FOUND when member does not exist', async () => {
      mockMember.findUnique.mockResolvedValueOnce(null)

      await expect(exportMemberData('nonexistent')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      })
    })
  })

  // SVC-07: listMembers — default call excludes soft-deleted rows
  describe('listMembers', () => {
    it('SVC-07: default call uses where.deletedAt: null to exclude soft-deleted', async () => {
      mockMember.findMany.mockResolvedValueOnce([baseMember])
      mockMember.count.mockResolvedValueOnce(1)

      await listMembers(1, 20)

      expect(mockMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
        })
      )
      expect(mockMember.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } })
      )
    })

    // SVC-08: listMembers — includeDeleted=true omits the deletedAt filter
    it('SVC-08: includeDeleted=true uses empty where object (no deletedAt filter)', async () => {
      mockMember.findMany.mockResolvedValueOnce([baseMember])
      mockMember.count.mockResolvedValueOnce(1)

      await listMembers(1, 20, true)

      expect(mockMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {},
        })
      )
      expect(mockMember.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      )
    })

    it('returns paginated result with correct structure', async () => {
      mockMember.findMany.mockResolvedValueOnce([baseMember])
      mockMember.count.mockResolvedValueOnce(42)

      const result = await listMembers(2, 10)

      expect(result.data).toEqual([baseMember])
      expect(result.total).toBe(42)
      expect(result.page).toBe(2)
      expect(result.limit).toBe(10)
    })

    it('caps limit at 100', async () => {
      mockMember.findMany.mockResolvedValueOnce([])
      mockMember.count.mockResolvedValueOnce(0)

      const result = await listMembers(1, 200)

      expect(result.limit).toBe(100)
      expect(mockMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 })
      )
    })
  })
})
