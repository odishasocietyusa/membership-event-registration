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
  withAuth: (handler: Function, opts?: { role?: string }) =>
    (req: Request) => {
      if (opts?.role === 'admin' && mockUser.role !== 'admin') {
        return Promise.resolve(new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403 }))
      }
      return handler(req, { user: mockUser })
    },
}))

jest.mock('@/lib/services/service-provider-service', () => ({
  getProviderById: jest.fn(),
  updateProvider: jest.fn(),
  deleteProvider: jest.fn(),
}))

import { PATCH, DELETE } from './route'
import { getProviderById, updateProvider, deleteProvider } from '@/lib/services/service-provider-service'

const mockGet = getProviderById as jest.Mock
const mockUpdate = updateProvider as jest.Mock
const mockDelete = deleteProvider as jest.Mock

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

function makeReq(method: string, body?: unknown) {
  return new Request('http://localhost/api/services/prov-1', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const PARAMS = Promise.resolve({ id: 'prov-1' })

beforeEach(() => {
  jest.resetAllMocks()
  mockUser = { id: 'mem-1', role: 'member', fullName: 'Test Member', email: 'member@test.com', memberStatus: 'active', deletedAt: null }
})

// T-08: PATCH 404 if provider not found
test('T-08: PATCH 404 if provider not found', async () => {
  mockGet.mockResolvedValueOnce(null)
  const res = await PATCH(makeReq('PATCH', { bio: 'Updated bio with ten chars.' }), { params: PARAMS })
  expect(res.status).toBe(404)
})

// T-09: PATCH 403 if non-owner non-admin
test('T-09: PATCH 403 if non-owner non-admin', async () => {
  mockUser.id = 'other-member'
  mockGet.mockResolvedValueOnce(PROVIDER)
  const res = await PATCH(makeReq('PATCH', { bio: 'Updated bio with ten chars.' }), { params: PARAMS })
  expect(res.status).toBe(403)
})

// T-10: PATCH 200 for owner
test('T-10: PATCH 200 for owner', async () => {
  mockGet.mockResolvedValueOnce(PROVIDER)
  mockUpdate.mockResolvedValueOnce({ ...PROVIDER, bio: 'Updated bio with ten chars.' })
  const res = await PATCH(makeReq('PATCH', { bio: 'Updated bio with ten chars.' }), { params: PARAMS })
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data.provider.bio).toBe('Updated bio with ten chars.')
})

// T-11: PATCH 200 admin can set status
test('T-11: PATCH 200 admin can set status', async () => {
  mockUser.role = 'admin'
  mockGet.mockResolvedValueOnce(PROVIDER)
  mockUpdate.mockResolvedValueOnce({ ...PROVIDER, status: 'inactive' as const })
  const res = await PATCH(makeReq('PATCH', { status: 'inactive' }), { params: PARAMS })
  expect(res.status).toBe(200)
  expect(mockUpdate).toHaveBeenCalledWith('prov-1', expect.objectContaining({ status: 'inactive' }))
})

// T-12: PATCH non-admin cannot set status
test('T-12: PATCH non-admin cannot set status', async () => {
  mockGet.mockResolvedValueOnce(PROVIDER)
  mockUpdate.mockResolvedValueOnce(PROVIDER)
  await PATCH(makeReq('PATCH', { status: 'inactive' }), { params: PARAMS })
  expect(mockUpdate).toHaveBeenCalledWith('prov-1', expect.not.objectContaining({ status: 'inactive' }))
})

// T-13: DELETE 403 if non-owner non-admin
test('T-13: DELETE 403 if non-owner non-admin', async () => {
  mockUser.id = 'other-member'
  mockGet.mockResolvedValueOnce(PROVIDER)
  const res = await DELETE(makeReq('DELETE'), { params: PARAMS })
  expect(res.status).toBe(403)
})

// T-14: DELETE 204 for owner
test('T-14: DELETE 204 for owner', async () => {
  mockGet.mockResolvedValueOnce(PROVIDER)
  mockDelete.mockResolvedValueOnce(undefined)
  const res = await DELETE(makeReq('DELETE'), { params: PARAMS })
  expect(res.status).toBe(204)
})

// T-15: DELETE 204 for admin
test('T-15: DELETE 204 for admin', async () => {
  mockUser.role = 'admin'
  mockUser.id = 'admin-id'
  mockGet.mockResolvedValueOnce(PROVIDER)
  mockDelete.mockResolvedValueOnce(undefined)
  const res = await DELETE(makeReq('DELETE'), { params: PARAMS })
  expect(res.status).toBe(204)
})
