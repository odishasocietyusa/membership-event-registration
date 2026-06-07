let mockUser: {
  id: string
  role: 'member' | 'admin'
  email: string
  deletedAt: null
} = {
  id: 'mem-1',
  role: 'member',
  email: 'member@test.com',
  deletedAt: null,
}

jest.mock('@/lib/auth/with-auth', () => ({
  withAuth: (handler: Function, opts?: { role?: string }) =>
    (req: Request) => {
      if (opts?.role === 'admin' && mockUser.role !== 'admin') {
        return Promise.resolve(
          new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
        )
      }
      return handler(req, { user: mockUser })
    },
}))

jest.mock('@/lib/obituaries/comment-service', () => ({
  deleteComment: jest.fn(),
}))

import { DELETE } from './route'
import { deleteComment } from '@/lib/obituaries/comment-service'

const mockDeleteComment = deleteComment as jest.Mock

function makeCtx(slug = 'test-obituary', id = 'cmt-1') {
  return { params: Promise.resolve({ slug, id }) }
}

function makeDeleteReq(id = 'cmt-1') {
  return new Request(`http://test/api/obituary/test-obituary/comments/${id}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer token' },
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { id: 'mem-1', role: 'member', email: 'member@test.com', deletedAt: null }
})

describe('DELETE /api/obituary/[slug]/comments/[id]', () => {
  it('T-13: returns 403 for non-admin member', async () => {
    mockUser.role = 'member'

    const res = await DELETE(makeDeleteReq(), makeCtx())
    expect(res.status).toBe(403)
    expect(mockDeleteComment).not.toHaveBeenCalled()
  })

  it('T-14: returns 404 when comment not found', async () => {
    mockUser.role = 'admin'
    mockDeleteComment.mockResolvedValueOnce(false)

    const res = await DELETE(makeDeleteReq('nonexistent'), makeCtx('test-obituary', 'nonexistent'))
    expect(res.status).toBe(404)
  })

  it('T-15: returns 204 when admin deletes existing comment', async () => {
    mockUser.role = 'admin'
    mockDeleteComment.mockResolvedValueOnce(true)

    const res = await DELETE(makeDeleteReq('cmt-1'), makeCtx())
    expect(res.status).toBe(204)
    expect(mockDeleteComment).toHaveBeenCalledWith('cmt-1')
  })
})
