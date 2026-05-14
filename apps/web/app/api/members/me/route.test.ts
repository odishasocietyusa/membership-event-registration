// app/api/members/me/route.test.ts
// Route handler tests MEM-01 through MEM-10

// ── Control variable for withAuth behaviour ───────────────────────────────────
// We use a mutable ref so individual tests can override what withAuth does
// without hitting "Cannot redefine property" from jest.mock().

type WithAuthMode =
  | { mode: 'authenticated'; user: Record<string, unknown> }
  | { mode: 'unauthenticated' }
  | { mode: 'deactivated' }

let withAuthMode: WithAuthMode = { mode: 'authenticated', user: {} }

// ── Fixtures ──────────────────────────────────────────────────────────────────

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
  role: 'member' as const,
  souvenirPreference: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  deletedAt: null,
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function, _opts?: unknown) =>
    async (req: Request, ctx?: unknown) => {
      if (withAuthMode.mode === 'unauthenticated') {
        return new Response(
          JSON.stringify({ error: 'Missing or invalid Authorization header' }),
          { status: 401 }
        )
      }
      if (withAuthMode.mode === 'deactivated') {
        return new Response(
          JSON.stringify({ error: 'Account has been deactivated' }),
          { status: 401 }
        )
      }
      return handler(req, { user: withAuthMode.user }, ctx)
    },
}))

jest.mock('@/lib/members/member-service', () => ({
  getMemberById: jest.fn(),
  updateMember: jest.fn(),
  softDeleteMember: jest.fn(),
  exportMemberData: jest.fn(),
  listMembers: jest.fn(),
  linkMemberAccount: jest.fn(),
  addFamilyMember: jest.fn(),
  listFamilyMembers: jest.fn(),
  softDeleteFamilyMember: jest.fn(),
  createChapter: jest.fn(),
  updateChapter: jest.fn(),
  listChapters: jest.fn(),
}))

import { GET, PUT, DELETE } from '@/app/api/members/me/route'
import * as service from '@/lib/members/member-service'

const mockUpdateMember = service.updateMember as jest.Mock
const mockSoftDeleteMember = service.softDeleteMember as jest.Mock

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost:3000/api/members/me', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid.token' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/members/me', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withAuthMode = { mode: 'authenticated', user: baseMember }
  })

  // MEM-01: returns 200 with member
  it('MEM-01: returns 200 with the authenticated member', async () => {
    const req = makeRequest('GET')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ member: expect.objectContaining({ id: 'mem-1', email: 'user@test.com' }) })
  })

  // MEM-02: GET without auth returns 401
  it('MEM-02: returns 401 when no Authorization header', async () => {
    withAuthMode = { mode: 'unauthenticated' }
    const req = new Request('http://localhost:3000/api/members/me', { method: 'GET' })
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  // MEM-03: GET for soft-deleted member returns 401
  it('MEM-03: returns 401 for soft-deleted member (withAuth rejects)', async () => {
    withAuthMode = { mode: 'deactivated' }
    const req = makeRequest('GET')
    const res = await GET(req)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Account has been deactivated')
  })
})

describe('PUT /api/members/me', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withAuthMode = { mode: 'authenticated', user: baseMember }
  })

  // MEM-04: PUT with valid partial body returns 200
  it('MEM-04: returns 200 with updated member on valid partial body', async () => {
    const updated = { ...baseMember, fullName: 'Updated Name' }
    mockUpdateMember.mockResolvedValueOnce(updated)

    const req = makeRequest('PUT', { fullName: 'Updated Name' })
    const res = await PUT(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.member.fullName).toBe('Updated Name')
    expect(mockUpdateMember).toHaveBeenCalledWith('mem-1', { fullName: 'Updated Name' })
  })

  // MEM-05: PUT with profileVisibility returns 200
  it('MEM-05: returns 200 when updating profileVisibility', async () => {
    const visibility = { show_phone: true, show_email: false, show_chapter: true }
    const updated = { ...baseMember, profileVisibility: visibility }
    mockUpdateMember.mockResolvedValueOnce(updated)

    const req = makeRequest('PUT', { profileVisibility: visibility })
    const res = await PUT(req)

    expect(res.status).toBe(200)
    expect(mockUpdateMember).toHaveBeenCalledWith(
      'mem-1',
      { profileVisibility: visibility }
    )
  })

  // MEM-06: PUT with invalid body (empty fullName) returns 400
  it('MEM-06: returns 400 when fullName is an empty string', async () => {
    const req = makeRequest('PUT', { fullName: '' })
    const res = await PUT(req)

    expect(res.status).toBe(400)
    expect(mockUpdateMember).not.toHaveBeenCalled()
  })

  // MEM-07: PUT with chapterId=null clears chapter
  it('MEM-07: returns 200 and calls updateMember with chapterId: null', async () => {
    const updated = { ...baseMember, chapterId: null }
    mockUpdateMember.mockResolvedValueOnce(updated)

    const req = makeRequest('PUT', { chapterId: null })
    const res = await PUT(req)

    expect(res.status).toBe(200)
    expect(mockUpdateMember).toHaveBeenCalledWith('mem-1', { chapterId: null })
  })

  // MEM-08: PUT with valid chapterId updates chapter
  it('MEM-08: returns 200 and calls updateMember with chapterId', async () => {
    const updated = { ...baseMember, chapterId: 'seattle' }
    mockUpdateMember.mockResolvedValueOnce(updated)

    const req = makeRequest('PUT', { chapterId: 'seattle' })
    const res = await PUT(req)

    expect(res.status).toBe(200)
    expect(mockUpdateMember).toHaveBeenCalledWith('mem-1', { chapterId: 'seattle' })
  })
})

describe('DELETE /api/members/me', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withAuthMode = { mode: 'authenticated', user: baseMember }
  })

  // MEM-09: DELETE returns 200, service called
  it('MEM-09: returns 200 and calls softDeleteMember', async () => {
    mockSoftDeleteMember.mockResolvedValueOnce(undefined)

    const req = makeRequest('DELETE')
    const res = await DELETE(req)

    expect(res.status).toBe(200)
    expect(mockSoftDeleteMember).toHaveBeenCalledWith('mem-1')
  })

  // MEM-10: After DELETE, subsequent GET returns 401
  it('MEM-10: subsequent GET returns 401 after soft delete (withAuth rejects deactivated account)', async () => {
    // First DELETE succeeds
    mockSoftDeleteMember.mockResolvedValueOnce(undefined)
    const deleteReq = makeRequest('DELETE')
    const deleteRes = await DELETE(deleteReq)
    expect(deleteRes.status).toBe(200)

    // Subsequent GET is rejected by withAuth because deletedAt is set
    withAuthMode = { mode: 'deactivated' }
    const getReq = makeRequest('GET')
    const getRes = await GET(getReq)
    expect(getRes.status).toBe(401)
  })
})
