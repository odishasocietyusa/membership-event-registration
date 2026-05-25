// app/api/messages/[id]/route.test.ts

let mockUser: { id: string; role: 'member' | 'admin'; fullName: string; email: string; deletedAt: null } = {
  id: 'mem-1',
  role: 'member',
  fullName: 'Utkal Nayak',
  email: 'utkal@test.com',
  deletedAt: null,
}

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function, _opts?: unknown) =>
    (req: Request) =>
      handler(req, { user: mockUser }),
}))

jest.mock('@/lib/messaging/message-service', () => ({
  getMessageForViewer: jest.fn(),
}))

import { GET } from './route'
import * as routeModule from './route'
import { getMessageForViewer } from '@/lib/messaging/message-service'

const mockGetMessageForViewer = getMessageForViewer as jest.Mock

const baseMessage = {
  id: 'msg-1',
  senderMemberId: 'mem-1',
  recipientMemberId: 'mem-2',
  subject: 'Hello',
  body: 'World',
  sentAt: new Date('2026-01-01T00:00:00Z'),
}

function makeRequest(id: string): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://test/api/messages/${id}`, {
      headers: { Authorization: 'Bearer token' },
    }),
    { params: Promise.resolve({ id }) },
  ]
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { id: 'mem-1', role: 'member' as const, fullName: 'Utkal Nayak', email: 'utkal@test.com', deletedAt: null }
})

describe('GET /api/messages/[id]', () => {
  it('returns 200 with message when viewer is the sender', async () => {
    mockGetMessageForViewer.mockResolvedValueOnce(baseMessage)

    const [req, ctx] = makeRequest('msg-1')
    const res = await GET(req, ctx)
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.message).toMatchObject({ id: 'msg-1' })
  })

  it('MSG-03: response body contains no email field', async () => {
    mockGetMessageForViewer.mockResolvedValueOnce(baseMessage)

    const [req, ctx] = makeRequest('msg-1')
    const res = await GET(req, ctx)
    const text = await res.text()

    expect(text).not.toMatch(/"email"/)
  })

  it('MSG-06: returns 403 when service throws FORBIDDEN', async () => {
    mockGetMessageForViewer.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })
    )

    const [req, ctx] = makeRequest('msg-1')
    const res = await GET(req, ctx)
    expect(res.status).toBe(403)
  })

  it('returns 404 when service throws NOT_FOUND', async () => {
    mockGetMessageForViewer.mockRejectedValueOnce(
      Object.assign(new Error('Not found'), { code: 'NOT_FOUND' })
    )

    const [req, ctx] = makeRequest('msg-missing')
    const res = await GET(req, ctx)
    expect(res.status).toBe(404)
  })

  it('MSG-10: admin can read any message', async () => {
    mockUser = { ...mockUser, id: 'admin-1', role: 'admin' }
    mockGetMessageForViewer.mockResolvedValueOnce(baseMessage)

    const [req, ctx] = makeRequest('msg-1')
    const res = await GET(req, ctx)

    expect(res.status).toBe(200)
    expect(mockGetMessageForViewer).toHaveBeenCalledWith('msg-1', { id: 'admin-1', role: 'admin' })
  })

  it('MSG-11: DELETE is not exported from this route module', () => {
    // @ts-expect-error testing that DELETE is not exported
    expect(routeModule.DELETE).toBeUndefined()
  })
})
