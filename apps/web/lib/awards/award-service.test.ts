// lib/awards/award-service.test.ts

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    award: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
    },
    awardName: {
      findUnique: jest.fn(),
    },
    member: {
      findUnique: jest.fn(),
    },
  },
}))

import { prisma } from '@/lib/db/prisma'
import {
  listAwards,
  getAwardById,
  createAward,
  updateAward,
  deleteAward,
} from './award-service'

const mockAward = prisma.award as jest.Mocked<typeof prisma.award>
const mockAwardName = prisma.awardName as jest.Mocked<typeof prisma.awardName>
const mockMember = prisma.member as jest.Mocked<typeof prisma.member>

beforeEach(() => jest.clearAllMocks())

describe('award-service', () => {
  describe('listAwards()', () => {
    it('should query all awards when no filters provided', async () => {
      mockAward.findMany.mockResolvedValueOnce([])
      const result = await listAwards({})
      expect(result).toEqual([])
      expect(mockAward.findMany).toHaveBeenCalledWith({
        where: {},
        include: { recipientMember: true, awardNameRef: true },
      })
    })

    it('should filter by year and category when provided', async () => {
      mockAward.findMany.mockResolvedValueOnce([])
      const result = await listAwards({ year: 2026, category: 'annualNominated' })
      expect(result).toEqual([])
      expect(mockAward.findMany).toHaveBeenCalledWith({
        where: { year: 2026, category: 'annualNominated' },
        include: { recipientMember: true, awardNameRef: true },
      })
    })
  })

  describe('getAwardById()', () => {
    it('should query unique award by ID', async () => {
      const mockResult = { id: 'aw-1', year: 2026 }
      mockAward.findUnique.mockResolvedValueOnce(mockResult as any)
      const result = await getAwardById('aw-1')
      expect(result).toEqual(mockResult)
      expect(mockAward.findUnique).toHaveBeenCalledWith({
        where: { id: 'aw-1' },
        include: { recipientMember: true, awardNameRef: true },
      })
    })
  })

  describe('createAward()', () => {
    it('should create award if input is valid', async () => {
      const mockResult = { id: 'aw-1', awardName: 'community-service', year: 2026 }
      mockAwardName.findUnique.mockResolvedValueOnce({ id: 'community-service', displayName: 'Community Service' } as any)
      mockAward.create.mockResolvedValueOnce(mockResult as any)

      const input = {
        awardName: 'community-service',
        year: 2026,
        category: 'communityService' as const,
        recipientName: 'Alice',
      }
      const result = await createAward(input)
      expect(result).toEqual(mockResult)
      expect(mockAward.create).toHaveBeenCalledWith({
        data: input,
      })
    })

    it('should throw BAD_REQUEST if awardName does not exist', async () => {
      mockAwardName.findUnique.mockResolvedValueOnce(null)

      const input = {
        awardName: 'invalid-award',
        year: 2026,
        category: 'communityService' as const,
        recipientName: 'Alice',
      }
      await expect(createAward(input)).rejects.toEqual(
        expect.objectContaining({ code: 'BAD_REQUEST', message: 'Invalid awardName: invalid-award' })
      )
    })

    it('should throw BAD_REQUEST if recipientMemberId does not exist', async () => {
      mockAwardName.findUnique.mockResolvedValueOnce({ id: 'community-service' } as any)
      mockMember.findUnique.mockResolvedValueOnce(null)

      const input = {
        awardName: 'community-service',
        year: 2026,
        category: 'communityService' as const,
        recipientMemberId: 'mem-99',
      }
      await expect(createAward(input)).rejects.toEqual(
        expect.objectContaining({ code: 'BAD_REQUEST', message: 'Invalid recipientMemberId: mem-99' })
      )
    })
  })

  describe('updateAward()', () => {
    it('should update award if valid', async () => {
      mockAward.findUnique.mockResolvedValueOnce({ id: 'aw-1' } as any)
      mockAward.update.mockResolvedValueOnce({ id: 'aw-1', citation: 'new citation' } as any)

      const result = await updateAward('aw-1', { citation: 'new citation' })
      expect(result.citation).toBe('new citation')
      expect(mockAward.update).toHaveBeenCalledWith({
        where: { id: 'aw-1' },
        data: { citation: 'new citation' },
      })
    })

    it('should throw NOT_FOUND if award does not exist', async () => {
      mockAward.findUnique.mockResolvedValueOnce(null)

      await expect(updateAward('aw-1', { citation: 'new' })).rejects.toEqual(
        expect.objectContaining({ code: 'NOT_FOUND', message: 'Award not found: aw-1' })
      )
    })
  })

  describe('deleteAward()', () => {
    it('should delete award if it exists', async () => {
      mockAward.findUnique.mockResolvedValueOnce({ id: 'aw-1' } as any)
      mockAward.delete.mockResolvedValueOnce({ id: 'aw-1' } as any)

      await deleteAward('aw-1')
      expect(mockAward.delete).toHaveBeenCalledWith({
        where: { id: 'aw-1' },
      })
    })

    it('should throw NOT_FOUND if award does not exist', async () => {
      mockAward.findUnique.mockResolvedValueOnce(null)

      await expect(deleteAward('aw-1')).rejects.toEqual(
        expect.objectContaining({ code: 'NOT_FOUND', message: 'Award not found: aw-1' })
      )
    })
  })
})
