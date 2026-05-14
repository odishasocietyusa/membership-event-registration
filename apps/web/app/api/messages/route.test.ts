// app/api/messages/route.test.ts

const SENDER_ID = '00000000-0000-0000-0000-000000000001'
const RECIPIENT_ID = '00000000-0000-0000-0000-000000000002'

let mockUser = {
  id: SENDER_ID,
  role: 'member' as const,
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
  sendMessage: jest.fn(),
  listMessagesForMember: jest.fn(),
}))

import { POST, GET } from './route'
import { sendMessage, listMessagesForMember } from '@/lib/messaging/message-service'

const mockSendMessage = sendMessage as jest.Mock
const mockListMessages = listMessagesForMember as jest.Mock

const baseMessage = {
  id: 'msg-1',
  senderMemberId: SENDER_ID,
  recipientMemberId: RECIPIENT_ID,
  subject: 'Hello',
  body: 'World',
  sentAt: new Date('2026-01-01T00:00:00Z'),
}

function makeRequest(body?: unknown, method = 'POST'): Request {
  return new Request('http://test/api/messages', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function makeGetRequest(params = ''): Request {
  return new Request(`http://test/api/messages${params}`, {
    headers: { Authorization: 'Bearer token' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { id: SENDER_ID, role: 'member', fullName: 'Utkal Nayak', email: 'utkal@test.com', deletedAt: null }
})

describe('POST /api/messages', () => {
  it('MSG-15: returns 201 with message body on success', async () => {
    mockSendMessage.mockResolvedValueOnce(baseMessage)

    const res = await POST(makeRequest({ recipientMemberId: RECIPIENT_ID, subject: 'Hello', body: 'World' }))
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.message).toMatchObject({ id: 'msg-1', subject: 'Hello' })
  })

  it('MSG-02: response body contains no email field', async () => {
    mockSendMessage.mockResolvedValueOnce(baseMessage)

    const res = await POST(makeRequest({ recipientMemberId: RECIPIENT_ID, subject: 'S', body: 'B' }))
    const text = await res.text()

    expect(text).not.toContain('@test.com')
    expect(text).not.toMatch(/"email"/)
  })

  it('MSG-08: returns 400 when self-send service throws BAD_REQUEST', async () => {
    mockSendMessage.mockRejectedValueOnce(
      Object.assign(new Error('Cannot send a message to yourself'), { code: 'BAD_REQUEST' })
    )

    const res = await POST(makeRequest({ recipientMemberId: SENDER_ID, subject: 'S', body: 'B' }))
    expect(res.status).toBe(400)
  })

  it('MSG-07: returns 404 when service throws NOT_FOUND', async () => {
    mockSendMessage.mockRejectedValueOnce(
      Object.assign(new Error('Recipient not found'), { code: 'NOT_FOUND' })
    )

    const res = await POST(makeRequest({ recipientMemberId: '00000000-0000-0000-0000-000000000099', subject: 'S', body: 'B' }))
    expect(res.status).toBe(404)
  })

  it('MSG-13: returns 400 for invalid body (missing subject)', async () => {
    const res = await POST(makeRequest({ recipientMemberId: RECIPIENT_ID, body: 'B' }))
    expect(res.status).toBe(400)
    expect(mockSendMessage).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid JSON', async () => {
    const req = new Request('http://test/api/messages', {
      method: 'POST',
      headers: { Authorization: 'Bearer token' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})

describe('GET /api/messages', () => {
  it('MSG-04: returns sent messages list', async () => {
    mockListMessages.mockResolvedValueOnce({ data: [baseMessage], total: 1, page: 1, limit: 50 })

    const res = await GET(makeGetRequest('?type=sent'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(mockListMessages).toHaveBeenCalledWith(SENDER_ID, 'sent', 1, 50)
    expect(json.data).toHaveLength(1)
  })

  it('MSG-05: returns received messages list', async () => {
    mockListMessages.mockResolvedValueOnce({ data: [], total: 0, page: 1, limit: 50 })

    const res = await GET(makeGetRequest('?type=received'))

    expect(res.status).toBe(200)
    expect(mockListMessages).toHaveBeenCalledWith(SENDER_ID, 'received', 1, 50)
  })

  it('MSG-12: returns 400 when type query param is missing', async () => {
    const res = await GET(makeGetRequest())
    expect(res.status).toBe(400)
    expect(mockListMessages).not.toHaveBeenCalled()
  })

  it('MSG-12: returns 400 when type is invalid', async () => {
    const res = await GET(makeGetRequest('?type=all'))
    expect(res.status).toBe(400)
  })
})
