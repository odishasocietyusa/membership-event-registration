// app/api/members/me/family/[id]/route.test.ts
// Route handler tests MEM-21 through MEM-24

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
  updateFamilyMember: jest.fn(),
  createChapter: jest.fn(),
  updateChapter: jest.fn(),
  listChapters: jest.fn(),
}))

import { DELETE, PUT } from '@/app/api/members/me/family/[id]/route'
import * as service from '@/lib/members/member-service'

const mockSoftDeleteFamilyMember = service.softDeleteFamilyMember as jest.Mock
const mockUpdateFamilyMember = service.updateFamilyMember as jest.Mock

function makeRequest(method: string, body?: unknown): Request {
  return new Request('http://localhost:3000/api/members/me/family/fm-1', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid.token' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

describe('DELETE /api/members/me/family/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // MEM-21: DELETE own family member returns 200
  it('MEM-21: returns 200 when deleting own family member', async () => {
    mockSoftDeleteFamilyMember.mockResolvedValueOnce(undefined)

    const res = await DELETE(makeRequest('DELETE'), makeParams('fm-1'))

    expect(res.status).toBe(200)
    expect(mockSoftDeleteFamilyMember).toHaveBeenCalledWith('fm-1', 'mem-1')
  })

  // MEM-22: DELETE another member's family member returns 403
  it('MEM-22: returns 403 when service throws FORBIDDEN', async () => {
    mockSoftDeleteFamilyMember.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })
    )

    const res = await DELETE(makeRequest('DELETE'), makeParams('fm-other'))

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Forbidden')
  })

  // MEM-23: DELETE non-existent id returns 404
  it('MEM-23: returns 404 when family member does not exist', async () => {
    mockSoftDeleteFamilyMember.mockRejectedValueOnce(
      Object.assign(new Error('Family member not found'), { code: 'NOT_FOUND' })
    )

    const res = await DELETE(makeRequest('DELETE'), makeParams('nonexistent'))

    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('Not found')
  })

  // MEM-24: DELETE already soft-deleted returns 404
  it('MEM-24: returns 404 when family member is already soft-deleted', async () => {
    mockSoftDeleteFamilyMember.mockRejectedValueOnce(
      Object.assign(new Error('Family member not found'), { code: 'NOT_FOUND' })
    )

    const res = await DELETE(makeRequest('DELETE'), makeParams('fm-deleted'))

    expect(res.status).toBe(404)
  })
})

describe('PUT /api/members/me/family/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // MEM-25: PUT valid update returns 200
  it('MEM-25: returns 200 with updated family member', async () => {
    const updated = { id: 'fm-1', primaryMemberId: 'mem-1', fullName: 'New Name', relation: 'spouse', deletedAt: null }
    mockUpdateFamilyMember.mockResolvedValueOnce(updated)

    const res = await PUT(makeRequest('PUT', { fullName: 'New Name' }), makeParams('fm-1'))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.familyMember.fullName).toBe('New Name')
    expect(mockUpdateFamilyMember).toHaveBeenCalledWith('fm-1', 'mem-1', expect.objectContaining({ fullName: 'New Name' }))
  })

  // MEM-26: PUT invalid body returns 400
  it('MEM-26: returns 400 for invalid body', async () => {
    const res = await PUT(makeRequest('PUT', { dateOfBirth: 'not-a-date' }), makeParams('fm-1'))

    expect(res.status).toBe(400)
    expect(mockUpdateFamilyMember).not.toHaveBeenCalled()
  })

  // MEM-27: PUT on another member's record returns 403
  it('MEM-27: returns 403 when service throws FORBIDDEN', async () => {
    mockUpdateFamilyMember.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })
    )

    const res = await PUT(makeRequest('PUT', { fullName: 'Hacked' }), makeParams('fm-other'))

    expect(res.status).toBe(403)
  })

  // MEM-28: PUT with duplicate spouse email returns 409 with message
  it('MEM-28: returns 409 with service message when spouse email is already registered', async () => {
    const conflictMessage = 'This email is already registered as a primary member and cannot be linked as a spouse.'
    mockUpdateFamilyMember.mockRejectedValueOnce(
      Object.assign(new Error(conflictMessage), { code: 'CONFLICT' })
    )

    const res = await PUT(makeRequest('PUT', { email: 'taken@test.com' }), makeParams('fm-1'))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe(conflictMessage)
  })
})
