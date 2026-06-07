import { prisma } from '@/lib/db/prisma'
import type { Prisma } from '@prisma/client'
import type { MemberSearchResult, MemberSearchResponse } from '@/lib/validation/member.schema'
import type { MemberSearchInput } from '../member-service'

const SEARCH_PAGE_SIZE = 25
const SEARCH_RESULT_CAP = 1000

function nameMatch(term: string): Prisma.MemberWhereInput {
  return {
    OR: [
      { fullName: { contains: term, mode: 'insensitive' } },
      { familyMembers: { some: { relation: 'spouse', deletedAt: null, fullName: { contains: term, mode: 'insensitive' } } } },
    ],
  }
}

export async function searchMembers(input: MemberSearchInput): Promise<MemberSearchResponse> {
  const { name, city, state, country, page } = input
  const skip = (page - 1) * SEARCH_PAGE_SIZE

  if (skip >= SEARCH_RESULT_CAP) {
    return { results: [], total: SEARCH_RESULT_CAP, page, pageSize: SEARCH_PAGE_SIZE, truncated: true }
  }

  const AND: Prisma.MemberWhereInput[] = [
    { deletedAt: null },
    ...(name ? [nameMatch(name)] : []),
    ...(city      ? [{ address: { path: ['city'],    string_contains: city,    mode: 'insensitive' as const } } as Prisma.MemberWhereInput] : []),
    ...(state     ? [{ address: { path: ['state'],   string_contains: state,   mode: 'insensitive' as const } } as Prisma.MemberWhereInput] : []),
    ...(country   ? [{ address: { path: ['country'], string_contains: country, mode: 'insensitive' as const } } as Prisma.MemberWhereInput] : []),
  ]

  const take = Math.min(SEARCH_PAGE_SIZE, SEARCH_RESULT_CAP - skip)

  const [rawCount, rows] = await Promise.all([
    prisma.member.count({ where: { AND } }),
    prisma.member.findMany({
      where:   { AND },
      select: {
        id:             true,
        fullName:       true,
        address:        true,
        chapterId:      true,
        joinDate:       true,
        membershipType: true,
        memberStatus:   true,
        familyMembers: {
          where:  { relation: 'spouse', deletedAt: null },
          select: { fullName: true },
          take:   1,
        },
      },
      orderBy: [{ fullName: 'asc' }],
      skip,
      take,
    }),
  ])

  const truncated = rawCount > SEARCH_RESULT_CAP
  const total     = Math.min(rawCount, SEARCH_RESULT_CAP)

  const results: MemberSearchResult[] = rows.map((row) => {
    const addr = row.address as Record<string, string> | null
    const { firstName: fn, lastName: ln } = parseName(row.fullName)
    return {
      memberId:       row.id,
      firstName:      fn,
      lastName:       ln,
      city:           addr?.city           ?? null,
      state:          addr?.state          ?? null,
      chapterId:      row.chapterId        ?? null,
      memberSince:    row.joinDate ? row.joinDate.toISOString().slice(0, 10) : null,
      membershipType: row.membershipType   ?? null,
      memberStatus:   row.memberStatus     ?? null,
    }
  })

  return { results, total, page, pageSize: SEARCH_PAGE_SIZE, truncated }
}
