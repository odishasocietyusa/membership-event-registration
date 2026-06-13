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
    (req: Request) =>
      handler(req, { user: mockUser }),
}))

jest.mock('@/lib/expertise/expertise-profile-service', () => ({
  getExpertiseProfileById: jest.fn(),
  updateExpertiseProfile: jest.fn(),
  deleteExpertiseProfile: jest.fn(),
}))

import { PATCH, DELETE } from './route'
import {
  getExpertiseProfileById,
  updateExpertiseProfile,
  deleteExpertiseProfile,
} from '@/lib/expertise/expertise-profile-service'

const mockGet = getExpertiseProfileById as jest.Mock
const mockUpdate = updateExpertiseProfile as jest.Mock
const mockDelete = deleteExpertiseProfile as jest.Mock

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

function makeReq(method: string, body?: unknown) {
  return new Request('http://localhost/api/expertise/exp-1', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const PARAMS = Promise.resolve({ id: 'exp-1' })

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

// T-12: PATCH 404 if profile not found
test('T-12: PATCH 404 if profile not found', async () => {
  mockGet.mockResolvedValueOnce(null)
  const res = await PATCH(makeReq('PATCH', { blurb: 'Updated blurb with ten chars.' }), { params: PARAMS })
  expect(res.status).toBe(404)
})

// T-13: PATCH 403 if non-owner non-admin
test('T-13: PATCH 403 if non-owner non-admin', async () => {
  mockUser.id = 'other-member'
  mockGet.mockResolvedValueOnce(PROFILE)
  const res = await PATCH(makeReq('PATCH', { blurb: 'Updated blurb with ten chars.' }), { params: PARAMS })
  expect(res.status).toBe(403)
})

// T-14: PATCH 200 for owner
test('T-14: PATCH 200 for owner', async () => {
  mockGet.mockResolvedValueOnce(PROFILE)
  mockUpdate.mockResolvedValueOnce({ ...PROFILE, blurb: 'Updated blurb with ten chars.' })
  const res = await PATCH(makeReq('PATCH', { blurb: 'Updated blurb with ten chars.' }), { params: PARAMS })
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data.profile.blurb).toBe('Updated blurb with ten chars.')
})

// T-15: PATCH 200 admin can set isHidden
test('T-15: PATCH 200 admin can set isHidden', async () => {
  mockUser.role = 'admin'
  mockUser.id = 'admin-id'
  mockGet.mockResolvedValueOnce(PROFILE)
  mockUpdate.mockResolvedValueOnce({ ...PROFILE, isHidden: true })
  const res = await PATCH(makeReq('PATCH', { isHidden: true }), { params: PARAMS })
  expect(res.status).toBe(200)
  expect(mockUpdate).toHaveBeenCalledWith('exp-1', expect.objectContaining({ isHidden: true }))
})

// T-16: PATCH non-admin cannot set isHidden
test('T-16: PATCH non-admin cannot set isHidden', async () => {
  mockGet.mockResolvedValueOnce(PROFILE)
  mockUpdate.mockResolvedValueOnce(PROFILE)
  await PATCH(makeReq('PATCH', { isHidden: true }), { params: PARAMS })
  expect(mockUpdate).toHaveBeenCalledWith('exp-1', expect.not.objectContaining({ isHidden: true }))
})

// T-17: DELETE 403 if non-owner non-admin
test('T-17: DELETE 403 if non-owner non-admin', async () => {
  mockUser.id = 'other-member'
  mockGet.mockResolvedValueOnce(PROFILE)
  const res = await DELETE(makeReq('DELETE'), { params: PARAMS })
  expect(res.status).toBe(403)
})

// T-18: DELETE 204 for owner
test('T-18: DELETE 204 for owner', async () => {
  mockGet.mockResolvedValueOnce(PROFILE)
  mockDelete.mockResolvedValueOnce(undefined)
  const res = await DELETE(makeReq('DELETE'), { params: PARAMS })
  expect(res.status).toBe(204)
})

// T-19: DELETE 204 for admin
test('T-19: DELETE 204 for admin', async () => {
  mockUser.role = 'admin'
  mockUser.id = 'admin-id'
  mockGet.mockResolvedValueOnce(PROFILE)
  mockDelete.mockResolvedValueOnce(undefined)
  const res = await DELETE(makeReq('DELETE'), { params: PARAMS })
  expect(res.status).toBe(204)
})
