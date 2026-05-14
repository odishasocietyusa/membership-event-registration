// lib/auth/with-auth.test.ts
// TDD tests for WITHAUTH-01 through WITHAUTH-10

// Mock supabase-admin and prisma before importing withAuth
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
    },
  },
}))

import { withAuth } from '@/lib/auth/with-auth'
import { supabaseAdmin } from '@/lib/auth/supabase-admin'
import { prisma } from '@/lib/db/prisma'

const mockGetUser = supabaseAdmin.auth.getUser as jest.Mock
const mockUpsert = prisma.member.upsert as jest.Mock

// Helper to create a Request with optional Authorization header
function makeRequest(token?: string): Request {
  const headers: HeadersInit = token
    ? { Authorization: `Bearer ${token}` }
    : {}
  return new Request('http://test/api/me', { headers })
}

// Helper to parse JSON body from response
async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

// Baseline member fixture
const baseMember = {
  id: 'mem-1',
  userId: 'uid-1',
  stripeCustomerId: null,
  email: 'user@test.com',
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

describe('withAuth()', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // WITHAUTH-01: returns 401 when Authorization header is missing
  it('returns 401 when Authorization header is missing', async () => {
    const handler = jest.fn()
    const routeHandler = withAuth(handler)
    const req = new Request('http://test/api/me')

    const res = await routeHandler(req)

    expect(res.status).toBe(401)
    const body = await parseBody(res)
    expect((body as { error: string }).error).toBe(
      'Missing or invalid Authorization header'
    )
    expect(handler).not.toHaveBeenCalled()
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockUpsert).not.toHaveBeenCalled()
  })

  // WITHAUTH-02: returns 401 when Authorization scheme is not Bearer
  it('returns 401 when Authorization scheme is not Bearer', async () => {
    const handler = jest.fn()
    const routeHandler = withAuth(handler)
    const req = new Request('http://test/api/me', {
      headers: { Authorization: 'Basic dXNlcjpwYXNz' },
    })

    const res = await routeHandler(req)

    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  // WITHAUTH-03: returns 401 when Supabase rejects the token
  it('returns 401 when Supabase rejects the token', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid JWT' },
    })
    const handler = jest.fn()
    const routeHandler = withAuth(handler)
    const req = makeRequest('bad.token.here')

    const res = await routeHandler(req)

    expect(res.status).toBe(401)
    expect(handler).not.toHaveBeenCalled()
  })

  // WITHAUTH-04: calls prisma.member.upsert with correct create args on first login
  it('calls prisma.member.upsert with correct create args on first login', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'uid-1', email: 'new@test.com' } },
      error: null,
    })
    const upsertedMember = {
      ...baseMember,
      id: 'mem-1',
      email: 'new@test.com',
      userId: 'uid-1',
    }
    mockUpsert.mockResolvedValueOnce(upsertedMember)
    const handler = jest
      .fn()
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const routeHandler = withAuth(handler)
    const req = makeRequest('valid.token')

    const res = await routeHandler(req)

    expect(res.status).toBe(200)
    expect(mockUpsert).toHaveBeenCalledTimes(1)
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { email: 'new@test.com' },
      create: {
        email: 'new@test.com',
        userId: 'uid-1',
        role: 'member',
      },
      update: {
        userId: 'uid-1',
      },
    })
    expect(handler).toHaveBeenCalledWith(req, { user: upsertedMember })
  })

  // WITHAUTH-05: prisma upsert called exactly once per request invocation (idempotency check)
  it('prisma upsert called exactly once even on repeated invocations', async () => {
    const authUser = { id: 'uid-1', email: 'user@test.com' }
    mockGetUser.mockResolvedValue({
      data: { user: authUser },
      error: null,
    })
    mockUpsert.mockResolvedValue(baseMember)
    const handler = jest
      .fn()
      .mockResolvedValue(new Response('ok', { status: 200 }))

    const routeHandler = withAuth(handler)
    const req1 = makeRequest('valid.token')
    const req2 = makeRequest('valid.token')

    await routeHandler(req1)
    await routeHandler(req2)

    // Upsert called twice total — once per request (confirms upsert is always used)
    expect(mockUpsert).toHaveBeenCalledTimes(2)
  })

  // WITHAUTH-06: returns 401 for soft-deleted user
  it('returns 401 for soft-deleted user', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'uid-1', email: 'user@test.com' } },
      error: null,
    })
    mockUpsert.mockResolvedValueOnce({
      ...baseMember,
      deletedAt: new Date('2025-01-01T00:00:00Z'),
    })
    const handler = jest.fn()

    const routeHandler = withAuth(handler)
    const res = await routeHandler(makeRequest('valid.token'))

    expect(res.status).toBe(401)
    const body = await parseBody(res)
    expect((body as { error: string }).error).toBe(
      'Account has been deactivated'
    )
    expect(handler).not.toHaveBeenCalled()
  })

  // WITHAUTH-07: returns 403 when member role is insufficient for admin-only route
  it('returns 403 when member role is insufficient for admin-only route', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'uid-1', email: 'user@test.com' } },
      error: null,
    })
    mockUpsert.mockResolvedValueOnce({
      ...baseMember,
      role: 'member',
      deletedAt: null,
    })
    const handler = jest.fn()

    const routeHandler = withAuth(handler, { role: 'admin' })
    const res = await routeHandler(makeRequest('valid.token'))

    expect(res.status).toBe(403)
    const body = await parseBody(res)
    expect((body as { error: string }).error).toBe('Insufficient permissions')
    expect(handler).not.toHaveBeenCalled()
  })

  // WITHAUTH-08: calls handler when admin role satisfies admin requirement
  it('calls handler when admin role satisfies admin requirement', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'uid-1', email: 'admin@test.com' } },
      error: null,
    })
    const adminMember = { ...baseMember, role: 'admin' as const, deletedAt: null }
    mockUpsert.mockResolvedValueOnce(adminMember)
    const handler = jest
      .fn()
      .mockResolvedValueOnce(new Response('admin ok', { status: 200 }))

    const routeHandler = withAuth(handler, { role: 'admin' })
    const res = await routeHandler(makeRequest('valid.token'))

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  // WITHAUTH-09: calls handler when member role satisfies member requirement
  it('calls handler when member role satisfies member requirement', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'uid-1', email: 'user@test.com' } },
      error: null,
    })
    mockUpsert.mockResolvedValueOnce({ ...baseMember, role: 'member', deletedAt: null })
    const handler = jest
      .fn()
      .mockResolvedValueOnce(new Response('member ok', { status: 200 }))

    const routeHandler = withAuth(handler, { role: 'member' })
    const res = await routeHandler(makeRequest('valid.token'))

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  // WITHAUTH-10: calls handler with no role option for any authenticated member
  it('calls handler with no role option for any authenticated member', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'uid-1', email: 'user@test.com' } },
      error: null,
    })
    mockUpsert.mockResolvedValueOnce({ ...baseMember, role: 'member', deletedAt: null })
    const handler = jest
      .fn()
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const routeHandler = withAuth(handler) // no options
    const res = await routeHandler(makeRequest('valid.token'))

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
