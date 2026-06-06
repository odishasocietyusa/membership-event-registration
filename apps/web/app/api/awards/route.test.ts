// app/api/awards/route.test.ts

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function, options?: { role?: string }) => {
    return (req: Request) => {
      const role = req.headers.get('x-mock-role') || 'member'
      if (options?.role === 'admin' && role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return handler(req, { user: { id: 'mem-1', email: 'admin@test.com', role } })
    }
  },
}))

jest.mock('@/lib/awards/award-service', () => ({
  listAwards: jest.fn(),
  createAward: jest.fn(),
}))

import { GET, POST } from './route'
import { listAwards, createAward } from '@/lib/awards/award-service'

const mockListAwards = listAwards as jest.Mock
const mockCreateAward = createAward as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeGetReq(queryStr: string = '') {
  return new Request(`http://test/api/awards${queryStr}`, { method: 'GET' })
}

function makePostReq(body: object, role: string = 'admin') {
  return new Request('http://test/api/awards', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mock-role':   role,
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/awards', () => {
  it('blocks non-admin users with 403', async () => {
    const res = await POST(makePostReq({}, 'member'))
    expect(res.status).toBe(403)
    expect(mockCreateAward).not.toHaveBeenCalled()
  })

  it('creates award if admin and input is valid', async () => {
    const mockAward = { id: 'aw-1', year: 2026 }
    mockCreateAward.mockResolvedValueOnce(mockAward)

    const payload = {
      awardName: 'community-service',
      year: 2026,
      category: 'communityService',
      recipientName: 'Alice',
    }
    const res = await POST(makePostReq(payload, 'admin'))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.award).toEqual(mockAward)
    expect(mockCreateAward).toHaveBeenCalledWith(payload)
  })

  it('returns 400 on invalid body (Zod error)', async () => {
    const payload = {
      awardName: '', // invalid name
      year: 2026,
      category: 'invalidCategory',
    }
    const res = await POST(makePostReq(payload, 'admin'))
    expect(res.status).toBe(400)
    expect(mockCreateAward).not.toHaveBeenCalled()
  })

  it('returns 400 on service bad request error', async () => {
    mockCreateAward.mockRejectedValueOnce(
      Object.assign(new Error('Invalid awardName'), { code: 'BAD_REQUEST' })
    )

    const payload = {
      awardName: 'unknown-slug',
      year: 2026,
      category: 'communityService',
      recipientName: 'Alice',
    }
    const res = await POST(makePostReq(payload, 'admin'))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('Invalid awardName')
  })
})

describe('GET /api/awards', () => {
  it('returns all awards on public GET', async () => {
    const mockAwards = [{ id: 'aw-1' }, { id: 'aw-2' }]
    mockListAwards.mockResolvedValueOnce(mockAwards)

    const res = await GET(makeGetReq())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.awards).toEqual(mockAwards)
    expect(mockListAwards).toHaveBeenCalledWith({})
  })

  it('applies query filters when valid', async () => {
    mockListAwards.mockResolvedValueOnce([])

    const res = await GET(makeGetReq('?year=2026&category=competition'))
    expect(res.status).toBe(200)
    expect(mockListAwards).toHaveBeenCalledWith({ year: 2026, category: 'competition' })
  })

  it('returns 400 on invalid query values', async () => {
    const res = await GET(makeGetReq('?year=invalid_year'))
    expect(res.status).toBe(400)
    expect(mockListAwards).not.toHaveBeenCalled()
  })
})
