// app/api/members/me/family/route.test.ts
// Route handler tests MEM-13 through MEM-20

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

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function, _opts?: unknown) =>
    async (req: Request, ctx?: unknown) =>
      handler(req, { user: baseMember }, ctx),
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

import { GET, POST } from '@/app/api/members/me/family/route'
import * as service from '@/lib/members/member-service'

const mockListFamilyMembers = service.listFamilyMembers as jest.Mock
const mockAddFamilyMember = service.addFamilyMember as jest.Mock

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost:3000/api/members/me/family', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid.token' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('GET /api/members/me/family', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // MEM-13: GET returns 200 with 2 family members
  it('MEM-13: returns 200 with 2 family members', async () => {
    const fm2 = { ...baseFamilyMember, id: 'fm-2', fullName: 'Child Name', relation: 'child' as const }
    mockListFamilyMembers.mockResolvedValueOnce([baseFamilyMember, fm2])

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.familyMembers).toHaveLength(2)
    expect(mockListFamilyMembers).toHaveBeenCalledWith('mem-1')
  })

  // MEM-14: GET excludes soft-deleted family members (service already filters, returns non-deleted)
  it('MEM-14: excludes soft-deleted family members (service returns only active)', async () => {
    // Service already filters deletedAt: null — only returns active members
    mockListFamilyMembers.mockResolvedValueOnce([baseFamilyMember])

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    const body = await res.json()
    // The returned family members should all have deletedAt: null
    body.familyMembers.forEach((fm: { deletedAt: unknown }) => {
      expect(fm.deletedAt).toBeNull()
    })
  })

  // MEM-15: GET with no family members returns empty array
  it('MEM-15: returns empty array when member has no family members', async () => {
    mockListFamilyMembers.mockResolvedValueOnce([])

    const res = await GET(makeRequest('GET'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.familyMembers).toEqual([])
  })
})

describe('POST /api/members/me/family', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // MEM-16: POST valid spouse (no DOB) returns 201
  it('MEM-16: returns 201 when adding a spouse without dateOfBirth', async () => {
    mockAddFamilyMember.mockResolvedValueOnce(baseFamilyMember)

    const res = await POST(makeRequest('POST', { fullName: 'Spouse Name', relation: 'spouse' }))

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.familyMember).toBeDefined()
    expect(mockAddFamilyMember).toHaveBeenCalledWith(
      'mem-1',
      expect.objectContaining({ fullName: 'Spouse Name', relation: 'spouse' })
    )
  })

  // MEM-17: POST valid with dateOfBirth returns 201
  it('MEM-17: returns 201 when adding a child with dateOfBirth', async () => {
    const childFM = { ...baseFamilyMember, id: 'fm-2', fullName: 'Child', relation: 'child' as const }
    mockAddFamilyMember.mockResolvedValueOnce(childFM)

    const res = await POST(makeRequest('POST', {
      fullName: 'Child',
      relation: 'child',
      dateOfBirth: '2015-06-15',
    }))

    expect(res.status).toBe(201)
    expect(mockAddFamilyMember).toHaveBeenCalledWith(
      'mem-1',
      expect.objectContaining({ dateOfBirth: '2015-06-15' })
    )
  })

  // MEM-18: POST missing fullName returns 400
  it('MEM-18: returns 400 when fullName is missing', async () => {
    const res = await POST(makeRequest('POST', { relation: 'spouse' }))

    expect(res.status).toBe(400)
    expect(mockAddFamilyMember).not.toHaveBeenCalled()
  })

  // MEM-19: POST invalid relation value returns 400
  it('MEM-19: returns 400 when relation is an invalid value', async () => {
    const res = await POST(makeRequest('POST', { fullName: 'Person', relation: 'sibling' }))

    expect(res.status).toBe(400)
    expect(mockAddFamilyMember).not.toHaveBeenCalled()
  })

  // MEM-20: POST invalid dateOfBirth format returns 400
  it('MEM-20: returns 400 when dateOfBirth is not YYYY-MM-DD format', async () => {
    const res = await POST(makeRequest('POST', {
      fullName: 'Child',
      relation: 'child',
      dateOfBirth: '15-06-2015', // wrong format
    }))

    expect(res.status).toBe(400)
    expect(mockAddFamilyMember).not.toHaveBeenCalled()
  })

  // MEM-20a: POST spouse email already registered as primary member returns 409 with message
  it('MEM-20a: returns 409 with service message when spouse email is already a primary member', async () => {
    const conflictMessage = 'This email is already registered as a primary member and cannot be linked as a spouse.'
    mockAddFamilyMember.mockRejectedValueOnce(
      Object.assign(new Error(conflictMessage), { code: 'CONFLICT' })
    )

    const res = await POST(makeRequest('POST', { fullName: 'Spouse Name', relation: 'spouse', email: 'taken@test.com' }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe(conflictMessage)
  })

  // MEM-20b: POST spouse email already linked as spouse for another member returns 409 with message
  it('MEM-20b: returns 409 with service message when spouse email is already linked to another member', async () => {
    const conflictMessage = 'This email is already linked as a spouse for another member.'
    mockAddFamilyMember.mockRejectedValueOnce(
      Object.assign(new Error(conflictMessage), { code: 'CONFLICT' })
    )

    const res = await POST(makeRequest('POST', { fullName: 'Spouse Name', relation: 'spouse', email: 'other-spouse@test.com' }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe(conflictMessage)
  })
})
