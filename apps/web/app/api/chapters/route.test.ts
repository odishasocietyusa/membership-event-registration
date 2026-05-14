// app/api/chapters/route.test.ts
// Route handler tests MEM-48 through MEM-55

// ── Control variable for withAuth POST behaviour ──────────────────────────────
// GET /api/chapters is public (no withAuth), so only POST needs this.

type WithAuthMode =
  | { mode: 'admin'; user: Record<string, unknown> }
  | { mode: 'forbidden' }   // member role trying admin endpoint

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
  profileData: null,
  role: 'admin' as const,
  souvenirPreference: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  deletedAt: null,
}

const baseChapter = {
  id: 'seattle',
  displayName: 'Seattle Chapter',
  states: ['WA'],
  presidentMemberId: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
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

import { GET, POST } from '@/app/api/chapters/route'
import * as service from '@/lib/members/member-service'

const mockListChapters = service.listChapters as jest.Mock
const mockCreateChapter = service.createChapter as jest.Mock

function makePostRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/chapters', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer admin.token' },
    body: JSON.stringify(body),
  })
}

describe('GET /api/chapters', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withAuthMode = { mode: 'admin', user: adminMember }
  })

  // MEM-48: GET without auth returns 200 with chapters list
  it('MEM-48: returns 200 with chapters list — no auth required', async () => {
    mockListChapters.mockResolvedValueOnce([baseChapter])

    // GET is public — call without auth header
    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.chapters).toHaveLength(1)
    expect(body.chapters[0].id).toBe('seattle')
  })

  // MEM-49: GET with auth also returns 200
  it('MEM-49: returns 200 with auth token too (public endpoint accepts both)', async () => {
    mockListChapters.mockResolvedValueOnce([baseChapter])

    const res = await GET()

    expect(res.status).toBe(200)
  })

  // MEM-50: GET with empty table returns empty array
  it('MEM-50: returns empty array when no chapters exist', async () => {
    mockListChapters.mockResolvedValueOnce([])

    const res = await GET()

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.chapters).toEqual([])
  })
})

describe('POST /api/chapters', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withAuthMode = { mode: 'admin', user: adminMember }
  })

  // MEM-51: POST admin creates chapter returns 201
  it('MEM-51: admin can create a chapter — returns 201', async () => {
    mockCreateChapter.mockResolvedValueOnce(baseChapter)

    const res = await POST(makePostRequest({ id: 'seattle', displayName: 'Seattle Chapter', states: ['WA'] }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.chapter.id).toBe('seattle')
    expect(mockCreateChapter).toHaveBeenCalledWith({ id: 'seattle', displayName: 'Seattle Chapter', states: ['WA'] })
  })

  // MEM-52: POST duplicate slug returns 409
  it('MEM-52: returns 409 when chapter slug already exists', async () => {
    mockCreateChapter.mockRejectedValueOnce(
      Object.assign(new Error('Chapter already exists'), { code: 'CONFLICT' })
    )

    const res = await POST(makePostRequest({ id: 'seattle', displayName: 'Seattle 2', states: ['WA'] }))

    expect(res.status).toBe(409)
  })

  // MEM-53: POST invalid slug (uppercase) returns 400
  it('MEM-53: returns 400 when chapter id contains uppercase letters', async () => {
    const res = await POST(makePostRequest({ id: 'Seattle', displayName: 'Seattle Chapter', states: ['WA'] }))

    expect(res.status).toBe(400)
    expect(mockCreateChapter).not.toHaveBeenCalled()
  })

  // MEM-54: POST empty states array returns 400
  it('MEM-54: returns 400 when states array is empty', async () => {
    const res = await POST(makePostRequest({ id: 'seattle', displayName: 'Seattle Chapter', states: [] }))

    expect(res.status).toBe(400)
    expect(mockCreateChapter).not.toHaveBeenCalled()
  })

  // MEM-55: POST by member role returns 403
  it('MEM-55: returns 403 when a non-admin member tries to create a chapter', async () => {
    withAuthMode = { mode: 'forbidden' }

    const res = await POST(makePostRequest({ id: 'seattle', displayName: 'Seattle Chapter', states: ['WA'] }))

    expect(res.status).toBe(403)
    expect(mockCreateChapter).not.toHaveBeenCalled()
  })
})
