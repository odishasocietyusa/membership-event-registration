let mockUser: {
  id: string
  role: 'member' | 'admin'
  fullName: string | null
  email: string
  memberStatus: 'active' | 'expired' | 'suspended' | null
  membershipType: string | null
  deletedAt: null
} = {
  id: 'mem-1',
  role: 'member',
  fullName: 'Test Member',
  email: 'member@test.com',
  memberStatus: 'active',
  membershipType: 'life',
  deletedAt: null,
}

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function, _opts?: unknown) =>
    (req: Request) => {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 401 })
        )
      }
      return handler(req, { user: mockUser })
    },
}))

jest.mock('@/lib/expertise/expertise-profile-service', () => ({
  listExpertiseProfiles: jest.fn(),
  createExpertiseProfile: jest.fn(),
  getExpertiseProfileByMemberId: jest.fn(),
}))

import { GET, POST } from './route'
import {
  listExpertiseProfiles,
  createExpertiseProfile,
  getExpertiseProfileByMemberId,
} from '@/lib/expertise/expertise-profile-service'

const mockList = listExpertiseProfiles as jest.Mock
const mockCreate = createExpertiseProfile as jest.Mock
const mockGetByMember = getExpertiseProfileByMemberId as jest.Mock

function makeReq(body?: unknown, qs = '') {
  return new Request(`http://localhost/api/expertise${qs}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json', Authorization: 'Bearer tok' } : { Authorization: 'Bearer tok' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const PROFILE = {
  id: 'exp-1',
  memberId: 'mem-1',
  fullName: 'Test Member',
  organization: 'OSA',
  categories: ['Technology'],
  blurb: 'I build web apps for the community.',
  isHidden: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  jest.resetAllMocks()
  mockUser = {
    id: 'mem-1',
    role: 'member',
    fullName: 'Test Member',
    email: 'member@test.com',
    memberStatus: 'active',
    membershipType: 'life',
    deletedAt: null,
  }
})

// T-01: GET 401 if unauthenticated
test('T-01: GET 401 if unauthenticated', async () => {
  const req = new Request('http://localhost/api/expertise')
  const res = await GET(req)
  expect(res.status).toBe(401)
})

// T-02: GET 403 if member is expired
test('T-02: GET 403 if member is expired', async () => {
  mockUser.memberStatus = 'expired'
  const res = await GET(makeReq())
  expect(res.status).toBe(403)
})

// T-03: GET 403 if member is suspended
test('T-03: GET 403 if member is suspended', async () => {
  mockUser.memberStatus = 'suspended'
  const res = await GET(makeReq())
  expect(res.status).toBe(403)
})

// T-04: GET 200 returns paginated results without isHidden/memberId
test('T-04: GET 200 returns paginated results without isHidden/memberId', async () => {
  mockList.mockResolvedValueOnce({ results: [PROFILE], total: 1, page: 1, pageSize: 25 })
  const res = await GET(makeReq())
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data.results).toHaveLength(1)
  expect(data.results[0].id).toBe('exp-1')
  expect(data.total).toBe(1)
  expect(data.page).toBe(1)
  expect(data.pageSize).toBe(25)
  expect(JSON.stringify(data)).not.toContain('isHidden')
  expect(JSON.stringify(data)).not.toContain('memberId')
})

// T-05: GET passes category filter to listExpertiseProfiles
test('T-05: GET passes category filter to listExpertiseProfiles', async () => {
  mockList.mockResolvedValueOnce({ results: [], total: 0, page: 1, pageSize: 25 })
  const res = await GET(makeReq(undefined, '?category=Technology'))
  expect(res.status).toBe(200)
  expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ category: 'Technology' }))
})

// T-06: GET passes page param to listExpertiseProfiles
test('T-06: GET passes page param to listExpertiseProfiles', async () => {
  mockList.mockResolvedValueOnce({ results: [], total: 0, page: 2, pageSize: 25 })
  const res = await GET(makeReq(undefined, '?page=2'))
  expect(res.status).toBe(200)
  expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }))
})

// T-07: POST 403 if member is not active
test('T-07: POST 403 if member is not active', async () => {
  mockUser.memberStatus = 'expired'
  const res = await POST(makeReq({ categories: ['Technology'], blurb: 'I build web apps for the community.' }))
  expect(res.status).toBe(403)
})

// T-08: POST 403 if membership tier is not eligible
test('T-08: POST 403 if membership tier is not eligible', async () => {
  mockUser.membershipType = 'annualSingle'
  const res = await POST(makeReq({ categories: ['Technology'], blurb: 'I build web apps for the community.' }))
  expect(res.status).toBe(403)
})

// T-09: POST 409 if member already has an entry
test('T-09: POST 409 if member already has an entry', async () => {
  mockGetByMember.mockResolvedValueOnce(PROFILE)
  const res = await POST(makeReq({ categories: ['Technology'], blurb: 'I build web apps for the community.' }))
  expect(res.status).toBe(409)
})

// T-10: POST 400 on validation failure
test('T-10: POST 400 on validation failure', async () => {
  mockGetByMember.mockResolvedValueOnce(null)
  const res = await POST(makeReq({ categories: [], blurb: 'short' }))
  expect(res.status).toBe(400)
})

// T-11: POST 201 creates profile for eligible active member
test('T-11: POST 201 creates profile for eligible active member', async () => {
  mockGetByMember.mockResolvedValueOnce(null)
  mockCreate.mockResolvedValueOnce(PROFILE)
  const res = await POST(makeReq({ categories: ['Technology'], blurb: 'I build web apps for the community.' }))
  expect(res.status).toBe(201)
  const data = await res.json()
  expect(data.profile.id).toBe('exp-1')
})
