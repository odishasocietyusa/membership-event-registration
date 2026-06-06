// app/api/awards/[id]/route.test.ts

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function, options?: { role?: string }) => {
    return (req: Request, ctx: any) => {
      const role = req.headers.get('x-mock-role') || 'member'
      if (options?.role === 'admin' && role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return handler(req, { user: { id: 'mem-1', email: 'admin@test.com', role }, ...ctx })
    }
  },
}))

jest.mock('@/lib/awards/award-service', () => ({
  getAwardById: jest.fn(),
  updateAward: jest.fn(),
  deleteAward: jest.fn(),
}))

import { GET, PATCH, DELETE } from './route'
import { getAwardById, updateAward, deleteAward } from '@/lib/awards/award-service'

const mockGetAward = getAwardById as jest.Mock
const mockUpdateAward = updateAward as jest.Mock
const mockDeleteAward = deleteAward as jest.Mock

beforeEach(() => jest.clearAllMocks())

function makeGetReq() {
  return new Request('http://test/api/awards/aw-1', { method: 'GET' })
}

function makePatchReq(body: object, role: string = 'admin') {
  return new Request('http://test/api/awards/aw-1', {
    method:  'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-mock-role':   role,
    },
    body: JSON.stringify(body),
  })
}

function makeDeleteReq(role: string = 'admin') {
  return new Request('http://test/api/awards/aw-1', {
    method:  'DELETE',
    headers: {
      'x-mock-role': role,
    },
  })
}

const mockCtx = { params: Promise.resolve({ id: 'aw-1' }) }

describe('GET /api/awards/:id', () => {
  it('returns award when it exists', async () => {
    const mockResult = { id: 'aw-1', year: 2026 }
    mockGetAward.mockResolvedValueOnce(mockResult)

    const res = await GET(makeGetReq(), mockCtx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.award).toEqual(mockResult)
    expect(mockGetAward).toHaveBeenCalledWith('aw-1')
  })

  it('returns 404 when award is missing', async () => {
    mockGetAward.mockResolvedValueOnce(null)

    const res = await GET(makeGetReq(), mockCtx)
    expect(res.status).toBe(404)
  })
})

describe('PATCH /api/awards/:id', () => {
  it('blocks non-admin users with 403', async () => {
    const res = await PATCH(makePatchReq({}, 'member'), mockCtx)
    expect(res.status).toBe(403)
    expect(mockUpdateAward).not.toHaveBeenCalled()
  })

  it('updates award if admin and input is valid', async () => {
    const mockResult = { id: 'aw-1', year: 2026, citation: 'updated' }
    mockUpdateAward.mockResolvedValueOnce(mockResult)

    const payload = { citation: 'updated' }
    const res = await PATCH(makePatchReq(payload, 'admin'), mockCtx)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.award).toEqual(mockResult)
    expect(mockUpdateAward).toHaveBeenCalledWith('aw-1', payload)
  })

  it('returns 400 on invalid body field type', async () => {
    const payload = { year: 'invalid_year_type' }
    const res = await PATCH(makePatchReq(payload, 'admin'), mockCtx)
    expect(res.status).toBe(400)
    expect(mockUpdateAward).not.toHaveBeenCalled()
  })

  it('returns 404 when award to update does not exist', async () => {
    mockUpdateAward.mockRejectedValueOnce(
      Object.assign(new Error('Award not found'), { code: 'NOT_FOUND' })
    )

    const res = await PATCH(makePatchReq({ citation: 'text' }, 'admin'), mockCtx)
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/awards/:id', () => {
  it('blocks non-admin users with 403', async () => {
    const res = await DELETE(makeDeleteReq('member'), mockCtx)
    expect(res.status).toBe(403)
    expect(mockDeleteAward).not.toHaveBeenCalled()
  })

  it('deletes award and returns 204 if admin', async () => {
    mockDeleteAward.mockResolvedValueOnce(undefined)

    const res = await DELETE(makeDeleteReq('admin'), mockCtx)
    expect(res.status).toBe(204)
    expect(mockDeleteAward).toHaveBeenCalledWith('aw-1')
  })

  it('returns 404 when award to delete does not exist', async () => {
    mockDeleteAward.mockRejectedValueOnce(
      Object.assign(new Error('Award not found'), { code: 'NOT_FOUND' })
    )

    const res = await DELETE(makeDeleteReq('admin'), mockCtx)
    expect(res.status).toBe(404)
  })
})
