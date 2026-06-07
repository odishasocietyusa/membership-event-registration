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
  getProviderById: jest.fn(),
  getProviderEmail: jest.fn(),
  countRecentContacts: jest.fn(),
  logContact: jest.fn(),
}))

jest.mock('@/lib/messaging/service-contact', () => ({
  sendServiceContactEmail: jest.fn(),
}))

import { POST } from './route'
import { getProviderById, getProviderEmail, countRecentContacts, logContact } from '@/lib/services/service-provider-service'
import { sendServiceContactEmail } from '@/lib/messaging/service-contact'

const mockGetById = getProviderById as jest.Mock
const mockGetEmail = getProviderEmail as jest.Mock
const mockCount = countRecentContacts as jest.Mock
const mockLog = logContact as jest.Mock
const mockSend = sendServiceContactEmail as jest.Mock

const PROVIDER = {
  id: 'prov-1',
  memberId: 'mem-2',
  fullName: 'Provider Name',
  bio: 'Bio text here.',
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

const VALID_BODY = { subject: 'Hello', body: 'I would like to learn Odissi dance from you.' }

function makeReq(body?: unknown) {
  return new Request('http://localhost/api/services/prov-1/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

const PARAMS = Promise.resolve({ id: 'prov-1' })

beforeEach(() => {
  jest.resetAllMocks()
  mockUser = { id: 'mem-1', role: 'member', fullName: 'Test Member', email: 'member@test.com', memberStatus: 'active', deletedAt: null }
})

// T-16: POST 403 for expired member
test('T-16: POST 403 for expired member', async () => {
  mockUser.memberStatus = 'expired'
  const res = await POST(makeReq(VALID_BODY), { params: PARAMS })
  expect(res.status).toBe(403)
})

// T-17: POST 404 if provider not found
test('T-17: POST 404 if provider not found', async () => {
  mockGetById.mockResolvedValueOnce(null)
  const res = await POST(makeReq(VALID_BODY), { params: PARAMS })
  expect(res.status).toBe(404)
})

// T-18: POST 429 when rate limit exceeded
test('T-18: POST 429 when rate limit exceeded', async () => {
  mockGetById.mockResolvedValueOnce(PROVIDER)
  mockCount.mockResolvedValueOnce(5)
  const res = await POST(makeReq(VALID_BODY), { params: PARAMS })
  expect(res.status).toBe(429)
})

// T-19: POST 400 on validation failure
test('T-19: POST 400 on validation failure', async () => {
  mockGetById.mockResolvedValueOnce(PROVIDER)
  mockCount.mockResolvedValueOnce(0)
  const res = await POST(makeReq({ subject: '', body: 'short' }), { params: PARAMS })
  expect(res.status).toBe(400)
})

// T-20: POST 502 if Resend throws
test('T-20: POST 502 if Resend throws', async () => {
  mockGetById.mockResolvedValueOnce(PROVIDER)
  mockCount.mockResolvedValueOnce(0)
  mockGetEmail.mockResolvedValueOnce('provider@example.com')
  mockSend.mockRejectedValueOnce(new Error('Resend API error'))
  const res = await POST(makeReq(VALID_BODY), { params: PARAMS })
  expect(res.status).toBe(502)
  expect(mockLog).not.toHaveBeenCalled()
})

// T-21: POST 200 success — email absent from response
test('T-21: POST 200 success — email absent from response', async () => {
  mockGetById.mockResolvedValueOnce(PROVIDER)
  mockCount.mockResolvedValueOnce(0)
  mockGetEmail.mockResolvedValueOnce('provider@example.com')
  mockSend.mockResolvedValueOnce(undefined)
  mockLog.mockResolvedValueOnce(undefined)
  const res = await POST(makeReq(VALID_BODY), { params: PARAMS })
  expect(res.status).toBe(200)
  const data = await res.json()
  expect(data.message).toBe('Message sent successfully')
  expect(JSON.stringify(data)).not.toContain('provider@example.com')
  expect(mockLog).toHaveBeenCalledTimes(1)
})

// T-22: POST does not log if Resend fails
test('T-22: email not in any list response', async () => {
  mockGetById.mockResolvedValueOnce(PROVIDER)
  mockCount.mockResolvedValueOnce(0)
  mockGetEmail.mockResolvedValueOnce('provider@example.com')
  mockSend.mockRejectedValueOnce(new Error('fail'))
  await POST(makeReq(VALID_BODY), { params: PARAMS })
  expect(mockLog).not.toHaveBeenCalled()
})
