let mockUser: {
  id: string
  role: 'member' | 'admin'
  fullName: string | null
  email: string
  memberStatus: 'active' | 'expired' | 'suspended' | null
  deletedAt: null
} = {
  id: 'mem-1',
  role: 'member',
  fullName: 'Test Member',
  email: 'member@test.com',
  memberStatus: 'active',
  deletedAt: null,
}

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function, _opts?: unknown) =>
    (req: Request) =>
      handler(req, { user: mockUser }),
}))

jest.mock('@/lib/services/service-provider-service', () => ({
  listProviders: jest.fn(),
  createProvider: jest.fn(),
  getProviderByMemberId: jest.fn(),
}))

import { GET, POST } from './route'
import { listProviders, createProvider, getProviderByMemberId } from '@/lib/services/service-provider-service'

const mockList = listProviders as jest.Mock
const mockCreate = createProvider as jest.Mock
const mockGetByMember = getProviderByMemberId as jest.Mock

function makeReq(body?: unknown, qs = '') {
  return new Request(`http://localhost/api/services${qs}`, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json', Authorization: 'Bearer tok' } : { Authorization: 'Bearer tok' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const PROVIDER = {
  id: 'prov-1',
  memberId: 'mem-1',
  fullName: 'Test Member',
  bio: 'Teaches Odissi dance for 10 years.',
  specializations: ['Odissi Dance'],
  onlineClasses: false,
  phone: null,
  websiteUrl: null,
  photoUrl: null,
  status: 'active' as const,
  isOsaMember: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  jest.resetAllMocks()
  mockUser = { id: 'mem-1', role: 'member', fullName: 'Test Member', email: 'member@test.com', memberStatus: 'active', deletedAt: null }
})

// T-01: GET returns provider list
test('T-01: GET returns provider list', async () => {
  mockList.mockResolvedValueOnce([PROVIDER])
  const res = await GET(makeReq())
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data.providers).toHaveLength(1)
  expect(data.providers[0].id).toBe('prov-1')
  // email must never be present
  expect(JSON.stringify(data)).not.toContain('@test.com')
  expect(JSON.stringify(data)).not.toContain('email')
})

// T-02: GET passes specialization filter
test('T-02: GET passes specialization filter', async () => {
  mockList.mockResolvedValueOnce([])
  const req = makeReq(undefined, '?specialization=Odissi+Dance')
  const res = await GET(req)
  expect(res.status).toBe(200)
  expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ specialization: 'Odissi Dance' }))
})

// T-03: GET passes onlineOnly filter
test('T-03: GET passes onlineOnly filter', async () => {
  mockList.mockResolvedValueOnce([])
  const req = makeReq(undefined, '?onlineOnly=true')
  const res = await GET(req)
  expect(res.status).toBe(200)
  expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ onlineOnly: true }))
})

// T-04: POST 403 for expired member
test('T-04: POST 403 for expired member', async () => {
  mockUser.memberStatus = 'expired'
  const res = await POST(makeReq({ bio: 'Ten years of Odissi dance.', specializations: ['Odissi Dance'], onlineClasses: false }))
  expect(res.status).toBe(403)
})

// T-05: POST 409 if member already has a profile
test('T-05: POST 409 if member already has a profile', async () => {
  mockGetByMember.mockResolvedValueOnce(PROVIDER)
  const res = await POST(makeReq({ bio: 'Ten years of Odissi dance.', specializations: ['Odissi Dance'], onlineClasses: false }))
  expect(res.status).toBe(409)
})

// T-06: POST 400 on validation failure
test('T-06: POST 400 on validation failure', async () => {
  mockGetByMember.mockResolvedValueOnce(null)
  const res = await POST(makeReq({ bio: 'short', specializations: [], onlineClasses: false }))
  expect(res.status).toBe(400)
})

// T-07: POST 201 creates provider
test('T-07: POST 201 creates provider', async () => {
  mockGetByMember.mockResolvedValueOnce(null)
  mockCreate.mockResolvedValueOnce(PROVIDER)
  const res = await POST(makeReq({ bio: 'Ten years of Odissi dance.', specializations: ['Odissi Dance'], onlineClasses: false }))
  expect(res.status).toBe(201)
  const data = await res.json()
  expect(data.provider.id).toBe('prov-1')
  expect(JSON.stringify(data)).not.toContain('email')
})
