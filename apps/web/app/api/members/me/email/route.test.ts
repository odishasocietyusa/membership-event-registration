// app/api/members/me/email/route.test.ts
// Route handler tests for PUT /api/members/me/email (SPEC-19 primary email change)

type WithAuthMode =
  | { mode: 'authenticated'; user: Record<string, unknown>; isSpouseSession?: boolean }
  | { mode: 'unauthenticated' }
  | { mode: 'deactivated' }

let withAuthMode: WithAuthMode = { mode: 'authenticated', user: {} }

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function, _opts?: unknown) =>
    async (req: Request) => {
      if (withAuthMode.mode === 'unauthenticated') {
        return new Response(
          JSON.stringify({ error: 'Missing or invalid Authorization header' }),
          { status: 401 }
        )
      }
      if (withAuthMode.mode === 'deactivated') {
        return new Response(
          JSON.stringify({ error: 'Account has been deactivated' }),
          { status: 401 }
        )
      }
      const isSpouseSession =
        withAuthMode.mode === 'authenticated' && (withAuthMode.isSpouseSession ?? false)
      return handler(req, { user: withAuthMode.user, isSpouseSession })
    },
}))

jest.mock('@/lib/members/member-service', () => ({
  changePrimaryEmail: jest.fn(),
}))

import { PUT } from '@/app/api/members/me/email/route'
import * as service from '@/lib/members/member-service'

const mockChangePrimaryEmail = service.changePrimaryEmail as jest.Mock

const baseMember = { id: 'mem-1', userId: 'uid-1', email: 'user@test.com' }

function makeRequest(body?: unknown): Request {
  return new Request('http://localhost:3000/api/members/me/email', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid.token' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

describe('PUT /api/members/me/email', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withAuthMode = { mode: 'authenticated', user: baseMember }
  })

  // EMAIL-01: spouse session cannot change primary email
  it('returns 403 when called from a spouse session', async () => {
    withAuthMode = { mode: 'authenticated', user: baseMember, isSpouseSession: true }
    const res = await PUT(makeRequest({ newEmail: 'other@test.com' }))

    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toMatch(/spouse sessions/i)
    expect(mockChangePrimaryEmail).not.toHaveBeenCalled()
  })

  // EMAIL-02: unauthenticated request returns 401
  it('returns 401 when not authenticated', async () => {
    withAuthMode = { mode: 'unauthenticated' }
    const res = await PUT(makeRequest({ newEmail: 'new@test.com' }))

    expect(res.status).toBe(401)
    expect(mockChangePrimaryEmail).not.toHaveBeenCalled()
  })

  // EMAIL-03: malformed JSON body returns 400
  it('returns 400 for malformed JSON body', async () => {
    const req = new Request('http://localhost:3000/api/members/me/email', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid.token' },
      body: 'not-json{{{',
    })
    const res = await PUT(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid JSON body')
    expect(mockChangePrimaryEmail).not.toHaveBeenCalled()
  })

  // EMAIL-04: missing newEmail field returns 400
  it('returns 400 when newEmail is missing', async () => {
    const res = await PUT(makeRequest({}))

    expect(res.status).toBe(400)
    expect(mockChangePrimaryEmail).not.toHaveBeenCalled()
  })

  // EMAIL-05: invalid email format returns 400
  it('returns 400 when newEmail is not a valid email address', async () => {
    const res = await PUT(makeRequest({ newEmail: 'not-an-email' }))

    expect(res.status).toBe(400)
    expect(mockChangePrimaryEmail).not.toHaveBeenCalled()
  })

  // EMAIL-06: valid request calls service and returns 200
  it('returns 200 and calls changePrimaryEmail with correct args', async () => {
    mockChangePrimaryEmail.mockResolvedValueOnce(undefined)

    const res = await PUT(makeRequest({ newEmail: 'new@test.com' }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toMatch(/email updated/i)
    expect(mockChangePrimaryEmail).toHaveBeenCalledWith('mem-1', 'new@test.com')
  })

  // EMAIL-07: service NOT_FOUND returns 404
  it('returns 404 when service throws NOT_FOUND', async () => {
    mockChangePrimaryEmail.mockRejectedValueOnce(
      Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
    )

    const res = await PUT(makeRequest({ newEmail: 'new@test.com' }))

    expect(res.status).toBe(404)
  })

  // EMAIL-08: service CONFLICT returns 409 with the service message
  it('returns 409 when service throws CONFLICT (email already registered)', async () => {
    mockChangePrimaryEmail.mockRejectedValueOnce(
      Object.assign(new Error('This email is already registered.'), { code: 'CONFLICT' })
    )

    const res = await PUT(makeRequest({ newEmail: 'taken@test.com' }))

    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toBe('This email is already registered.')
  })

  // EMAIL-09: unexpected service error returns 500
  it('returns 500 on unexpected service error', async () => {
    mockChangePrimaryEmail.mockRejectedValueOnce(new Error('Database exploded'))

    const res = await PUT(makeRequest({ newEmail: 'new@test.com' }))

    expect(res.status).toBe(500)
  })
})
