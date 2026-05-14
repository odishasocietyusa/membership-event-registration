// app/api/admin/link-member/route.test.ts
// Route handler tests MEM-41 through MEM-47

// ── Control variable for withAuth behaviour ───────────────────────────────────
type WithAuthMode =
  | { mode: 'admin'; user: Record<string, unknown> }
  | { mode: 'forbidden' } // member role trying admin endpoint

let withAuthMode: WithAuthMode = { mode: 'admin', user: {} }

// ── Fixtures ──────────────────────────────────────────────────────────────────

const adminMember = {
  id: 'admin-1',
  userId: 'admin-uid-1',
  stripeCustomerId: null,
  email: 'admin@test.com',
  fullName: 'Admin User',
  phone: null,
  address: null,
  chapterId: null,
  membershipType: null,
  memberStatus: null,
  joinDate: null,
  expiryDate: null,
  profileVisibility: null,
  role: 'admin' as const,
  souvenirPreference: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  deletedAt: null,
}

const targetMember = {
  id: 'mem-1',
  userId: null,
  stripeCustomerId: null,
  email: 'target@test.com',
  fullName: 'Target Member',
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
  withAuth: (handler: Function, opts?: { role?: string }) =>
    async (req: Request, ctx?: unknown) => {
      if (withAuthMode.mode === 'forbidden' && opts?.role === 'admin') {
        return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403 })
      }
      return handler(req, { user: withAuthMode.mode === 'admin' ? withAuthMode.user : {} }, ctx)
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

import { POST } from '@/app/api/admin/link-member/route'
import * as service from '@/lib/members/member-service'

const mockLinkMemberAccount = service.linkMemberAccount as jest.Mock

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/admin/link-member', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin.token' },
    body: JSON.stringify(body),
  })
}

const VALID_UUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'

describe('POST /api/admin/link-member', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withAuthMode = { mode: 'admin', user: adminMember }
  })

  // MEM-41: POST valid email+userId, userId null → 200 userId written
  it('MEM-41: returns 200 and links userId to member', async () => {
    const linked = { ...targetMember, userId: VALID_UUID }
    mockLinkMemberAccount.mockResolvedValueOnce(linked)

    const res = await POST(makeRequest({ email: 'target@test.com', userId: VALID_UUID }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.member.userId).toBe(VALID_UUID)
    expect(mockLinkMemberAccount).toHaveBeenCalledWith('target@test.com', VALID_UUID)
  })

  // MEM-42: POST same userId already set → 200 idempotent
  it('MEM-42: returns 200 when same userId is already linked (idempotent)', async () => {
    const alreadyLinked = { ...targetMember, userId: VALID_UUID }
    mockLinkMemberAccount.mockResolvedValueOnce(alreadyLinked)

    const res = await POST(makeRequest({ email: 'target@test.com', userId: VALID_UUID }))

    expect(res.status).toBe(200)
    expect(mockLinkMemberAccount).toHaveBeenCalledTimes(1)
  })

  // MEM-43: POST different userId already set → 409
  it('MEM-43: returns 409 when a different userId is already linked', async () => {
    mockLinkMemberAccount.mockRejectedValueOnce(
      Object.assign(new Error('Member already linked to a different account'), { code: 'CONFLICT' })
    )

    const res = await POST(makeRequest({ email: 'target@test.com', userId: VALID_UUID }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('Conflict')
  })

  // MEM-44: POST email not found → 404
  it('MEM-44: returns 404 when email does not match any member', async () => {
    mockLinkMemberAccount.mockRejectedValueOnce(
      Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
    )

    const res = await POST(makeRequest({ email: 'unknown@test.com', userId: VALID_UUID }))

    expect(res.status).toBe(404)
  })

  // MEM-45: POST invalid email → 400
  it('MEM-45: returns 400 when email is invalid', async () => {
    const res = await POST(makeRequest({ email: 'not-an-email', userId: VALID_UUID }))

    expect(res.status).toBe(400)
    expect(mockLinkMemberAccount).not.toHaveBeenCalled()
  })

  // MEM-46: POST invalid userId (not UUID) → 400
  it('MEM-46: returns 400 when userId is not a valid UUID', async () => {
    const res = await POST(makeRequest({ email: 'target@test.com', userId: 'not-a-uuid' }))

    expect(res.status).toBe(400)
    expect(mockLinkMemberAccount).not.toHaveBeenCalled()
  })

  // MEM-47: POST by member role → 403
  it('MEM-47: returns 403 when a member (non-admin) attempts to link accounts', async () => {
    withAuthMode = { mode: 'forbidden' }

    const res = await POST(makeRequest({ email: 'target@test.com', userId: VALID_UUID }))

    expect(res.status).toBe(403)
    expect(mockLinkMemberAccount).not.toHaveBeenCalled()
  })
})
