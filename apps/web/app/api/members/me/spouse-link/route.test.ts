// app/api/members/me/spouse-link/route.test.ts
// Route handler tests for DELETE /api/members/me/spouse-link (SPEC-19 revoke/relink)

type WithAuthMode =
  | { mode: 'authenticated'; user: Record<string, unknown> }
  | { mode: 'unauthenticated' }

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
      return handler(req, { user: withAuthMode.user, isSpouseSession: false })
    },
}))

jest.mock('@/lib/members/member-service', () => ({
  revokeSpouseLink: jest.fn(),
}))

import { DELETE } from '@/app/api/members/me/spouse-link/route'
import * as service from '@/lib/members/member-service'

const mockRevokeSpouseLink = service.revokeSpouseLink as jest.Mock

const baseMember = { id: 'mem-1', userId: 'uid-1', email: 'primary@test.com' }

function makeRequest(): Request {
  return new Request('http://localhost:3000/api/members/me/spouse-link', {
    method: 'DELETE',
    headers: { Authorization: 'Bearer valid.token' },
  })
}

describe('DELETE /api/members/me/spouse-link', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    withAuthMode = { mode: 'authenticated', user: baseMember }
  })

  // REVOKE-01: unauthenticated request returns 401
  it('returns 401 when not authenticated', async () => {
    withAuthMode = { mode: 'unauthenticated' }
    const res = await DELETE(makeRequest())

    expect(res.status).toBe(401)
    expect(mockRevokeSpouseLink).not.toHaveBeenCalled()
  })

  // REVOKE-02: active spouse link — revoked and returns 200
  it('returns 200 and calls revokeSpouseLink with the member id', async () => {
    mockRevokeSpouseLink.mockResolvedValueOnce(undefined)

    const res = await DELETE(makeRequest())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.message).toMatch(/revoked/i)
    expect(mockRevokeSpouseLink).toHaveBeenCalledWith('mem-1')
  })

  // REVOKE-03: no spouse link exists — service is a no-op, still returns 200
  it('returns 200 even when no spouse link exists (service handles it silently)', async () => {
    // revokeSpouseLink returns early with undefined when no FamilyMember is found
    mockRevokeSpouseLink.mockResolvedValueOnce(undefined)

    const res = await DELETE(makeRequest())

    expect(res.status).toBe(200)
    expect(mockRevokeSpouseLink).toHaveBeenCalledTimes(1)
  })

  // REVOKE-04: service throws — returns 500
  it('returns 500 when revokeSpouseLink throws unexpectedly', async () => {
    mockRevokeSpouseLink.mockRejectedValueOnce(new Error('Database connection lost'))

    const res = await DELETE(makeRequest())

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Internal server error')
  })
})
