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
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))

import { withAuth } from '@/lib/auth/with-auth'
import { supabaseAdmin } from '@/lib/auth/supabase-admin'
import { prisma } from '@/lib/db/prisma'

const mockGetUser = supabaseAdmin.auth.getUser as jest.Mock
const mockFindUnique = prisma.member.findUnique as jest.Mock
const mockCreate = prisma.member.create as jest.Mock
const mockUpdate = prisma.member.update as jest.Mock

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
    expect(mockFindUnique).not.toHaveBeenCalled()
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

  // WITHAUTH-04: creates members row on first login (findUnique returns null → create)
  it('creates members row on first login', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'uid-1', email: 'new@test.com' } },
      error: null,
    })
    const newMember = {
      ...baseMember,
      id: 'mem-1',
      email: 'new@test.com',
      userId: 'uid-1',
    }
    mockFindUnique.mockResolvedValueOnce(null)
    mockCreate.mockResolvedValueOnce(newMember)
    const handler = jest
      .fn()
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const routeHandler = withAuth(handler)
    const req = makeRequest('valid.token')

    const res = await routeHandler(req)

    expect(res.status).toBe(200)
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { email: 'new@test.com' } })
    expect(mockCreate).toHaveBeenCalledWith({
      data: { email: 'new@test.com', userId: 'uid-1', role: 'member', fullName: null },
    })
    expect(handler).toHaveBeenCalledWith(req, { user: newMember })
  })

  // WITHAUTH-05: existing member — findUnique returns row, create is never called
  it('uses existing member row without calling create on repeated requests', async () => {
    const authUser = { id: 'uid-1', email: 'user@test.com' }
    mockGetUser.mockResolvedValue({
      data: { user: authUser },
      error: null,
    })
    mockFindUnique.mockResolvedValue(baseMember)
    const handler = jest
      .fn()
      .mockResolvedValue(new Response('ok', { status: 200 }))

    const routeHandler = withAuth(handler)
    await routeHandler(makeRequest('valid.token'))
    await routeHandler(makeRequest('valid.token'))

    expect(mockFindUnique).toHaveBeenCalledTimes(2)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  // WITHAUTH-05b: admin pre-created row (userId=null) gets userId populated on first login
  it('updates userId when admin-pre-created member has no userId', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'uid-new', email: 'user@test.com' } },
      error: null,
    })
    const preCreated = { ...baseMember, userId: null }
    const updated = { ...baseMember, userId: 'uid-new' }
    mockFindUnique.mockResolvedValueOnce(preCreated)
    mockUpdate.mockResolvedValueOnce(updated)
    const handler = jest.fn().mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const res = await withAuth(handler)(makeRequest('valid.token'))

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: baseMember.id },
      data: { userId: 'uid-new' },
    })
    expect(handler).toHaveBeenCalledWith(expect.anything(), { user: updated })
  })

  // WITHAUTH-05c: race condition — create throws unique violation, falls back to findUnique
  it('handles concurrent first-login race by retrying findUnique after create failure', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'uid-1', email: 'race@test.com' } },
      error: null,
    })
    mockFindUnique
      .mockResolvedValueOnce(null)          // first check: row doesn't exist yet
      .mockResolvedValueOnce(baseMember)    // retry after create fails
    mockCreate.mockRejectedValueOnce(new Error('Unique constraint failed'))
    const handler = jest.fn().mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const res = await withAuth(handler)(makeRequest('valid.token'))

    expect(res.status).toBe(200)
    expect(mockFindUnique).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenCalledWith(expect.anything(), { user: baseMember })
  })

  // WITHAUTH-06: returns 401 for soft-deleted user
  it('returns 401 for soft-deleted user', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'uid-1', email: 'user@test.com' } },
      error: null,
    })
    mockFindUnique.mockResolvedValueOnce({
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
    mockFindUnique.mockResolvedValueOnce({
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
    mockFindUnique.mockResolvedValueOnce(adminMember)
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
    mockFindUnique.mockResolvedValueOnce({ ...baseMember, role: 'member', deletedAt: null })
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
    mockFindUnique.mockResolvedValueOnce({ ...baseMember, role: 'member', deletedAt: null })
    const handler = jest
      .fn()
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))

    const routeHandler = withAuth(handler) // no options
    const res = await routeHandler(makeRequest('valid.token'))

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
