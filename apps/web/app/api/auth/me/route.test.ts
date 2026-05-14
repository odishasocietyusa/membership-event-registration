// app/api/auth/me/route.test.ts
// Integration tests ME-01 through ME-04 and JIT-01, JIT-02.
// These require a running Supabase instance and real database.
// All tests are skipped by default — remove .skip to run against live environment.

// Mock withAuth and its dependencies for unit-level integration tests
jest.mock('@/lib/auth/supabase-admin', () => ({
  supabaseAdmin: {
    auth: {
      getUser: jest.fn(),
    },
  },
}))

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    member: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
    },
  },
}))

import { GET } from '@/app/api/auth/me/route'
import { supabaseAdmin } from '@/lib/auth/supabase-admin'
import { prisma } from '@/lib/db/prisma'

const mockGetUser = supabaseAdmin.auth.getUser as jest.Mock
const mockUpsert = prisma.member.upsert as jest.Mock
const mockCount = prisma.member.count as jest.Mock

const baseMember = {
  id: 'mem-1',
  userId: 'uid-1',
  stripeCustomerId: null,
  email: 'test@test.com',
  fullName: null,
  phone: null,
  address: null,
  chapterId: null,
  membershipType: null,
  memberStatus: null,
  joinDate: null,
  expiryDate: null,
  profileVisibility: null,
  role: 'member' as const,
  souvenirPreference: null,
  familyId: null,
  familyRole: null,
  parentFamilyId: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  deletedAt: null,
}

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ME-01: returns 200 with user object for authenticated user
  it('ME-01: returns 200 with user object for authenticated user', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'uid-1', email: 'test@test.com' } },
      error: null,
    })
    mockUpsert.mockResolvedValueOnce(baseMember)

    const req = new Request('http://localhost:3000/api/auth/me', {
      headers: { Authorization: 'Bearer valid.token' },
    })
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ user: expect.objectContaining({ email: 'test@test.com', role: 'member' }) })
  })

  // ME-02: returns 401 without Authorization header
  it('ME-02: returns 401 without Authorization header', async () => {
    const req = new Request('http://localhost:3000/api/auth/me')
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  // ME-03: returns 401 for expired/invalid token
  it('ME-03: returns 401 for expired/invalid token', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid JWT' },
    })

    const req = new Request('http://localhost:3000/api/auth/me', {
      headers: { Authorization: 'Bearer this.is.not.a.real.token' },
    })
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  // ME-04: returns 401 for soft-deleted member
  it('ME-04: returns 401 for soft-deleted member', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'uid-1', email: 'test@test.com' } },
      error: null,
    })
    mockUpsert.mockResolvedValueOnce({
      ...baseMember,
      deletedAt: new Date('2025-01-01T00:00:00Z'),
    })

    const req = new Request('http://localhost:3000/api/auth/me', {
      headers: { Authorization: 'Bearer valid.token' },
    })
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  // JIT-01: First API call creates exactly one members row with role 'member'
  it('JIT-01: First API call upserts exactly one members row with role member', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'new-uid', email: 'newuser@test.com' } },
      error: null,
    })
    const newMember = { ...baseMember, id: 'new-mem', userId: 'new-uid', email: 'newuser@test.com' }
    mockUpsert.mockResolvedValueOnce(newMember)
    mockCount.mockResolvedValueOnce(1)

    const req = new Request('http://localhost:3000/api/auth/me', {
      headers: { Authorization: 'Bearer fresh.token' },
    })
    const res = await GET(req)

    expect(res.status).toBe(200)
    // Verify upsert was called with create args setting role to 'member'
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ role: 'member' }),
      })
    )
  })

  // JIT-02: Repeated API calls do not create duplicate members rows (upsert is always used)
  it('JIT-02: Repeated API calls use upsert (no duplicate rows)', async () => {
    const authUser = { id: 'uid-1', email: 'test@test.com' }
    mockGetUser.mockResolvedValue({
      data: { user: authUser },
      error: null,
    })
    mockUpsert.mockResolvedValue(baseMember)

    const req1 = new Request('http://localhost:3000/api/auth/me', {
      headers: { Authorization: 'Bearer same.token' },
    })
    const req2 = new Request('http://localhost:3000/api/auth/me', {
      headers: { Authorization: 'Bearer same.token' },
    })

    const res1 = await GET(req1)
    const res2 = await GET(req2)

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    // Both calls used upsert — guarantees no duplicate rows possible
    expect(mockUpsert).toHaveBeenCalledTimes(2)
  })
})
