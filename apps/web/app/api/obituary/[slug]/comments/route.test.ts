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

jest.mock('@/lib/obituaries/comment-service', () => ({
  listComments: jest.fn(),
  createComment: jest.fn(),
}))

jest.mock('@/sanity/lib/client', () => ({
  sanityFetch: jest.fn(),
}))

import { GET, POST } from './route'
import { listComments, createComment } from '@/lib/obituaries/comment-service'
import { sanityFetch } from '@/sanity/lib/client'

const mockListComments = listComments as jest.Mock
const mockCreateComment = createComment as jest.Mock
const mockSanityFetch = sanityFetch as jest.Mock

const SLUG = 'test-obituary'

function makeCtx(slug = SLUG) {
  return { params: Promise.resolve({ slug }) }
}

function makeGetReq() {
  return new Request(`http://test/api/obituary/${SLUG}/comments`)
}

function makePostReq(body?: unknown) {
  return new Request(`http://test/api/obituary/${SLUG}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

const baseComment = {
  id: 'cmt-1',
  obituarySlug: SLUG,
  memberId: 'mem-1',
  body: 'Rest in peace.',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  member: { fullName: 'Test Member', email: 'member@test.com' },
}

beforeEach(() => {
  jest.clearAllMocks()
  mockUser = { id: 'mem-1', role: 'member', fullName: 'Test Member', email: 'member@test.com', memberStatus: 'active', deletedAt: null }
})

describe('GET /api/obituary/[slug]/comments', () => {
  it('T-01: returns 200 with empty array when no comments', async () => {
    mockListComments.mockResolvedValueOnce([])

    const res = await GET(makeGetReq(), makeCtx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.comments).toEqual([])
  })

  it('T-02: returns comments in chronological order with authorName', async () => {
    const older = { ...baseComment, id: 'cmt-1', createdAt: new Date('2026-01-01T00:00:00Z') }
    const newer = { ...baseComment, id: 'cmt-2', createdAt: new Date('2026-06-01T00:00:00Z') }
    mockListComments.mockResolvedValueOnce([older, newer])

    const res = await GET(makeGetReq(), makeCtx())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.comments).toHaveLength(2)
    expect(body.comments[0].id).toBe('cmt-1')
    expect(body.comments[1].id).toBe('cmt-2')
    expect(body.comments[0].authorName).toBe('Test Member')
  })

  it('T-02b: falls back to email prefix when fullName is null', async () => {
    const comment = { ...baseComment, member: { fullName: null, email: 'anon@test.com' } }
    mockListComments.mockResolvedValueOnce([comment])

    const res = await GET(makeGetReq(), makeCtx())
    const body = await res.json()

    expect(body.comments[0].authorName).toBe('anon')
  })
})

describe('POST /api/obituary/[slug]/comments', () => {
  it('T-05: returns 403 when member status is expired', async () => {
    mockUser.memberStatus = 'expired'

    const res = await POST(makePostReq({ body: 'Test' }), makeCtx())
    expect(res.status).toBe(403)
    expect(mockCreateComment).not.toHaveBeenCalled()
  })

  it('T-06: returns 403 when member status is suspended', async () => {
    mockUser.memberStatus = 'suspended'

    const res = await POST(makePostReq({ body: 'Test' }), makeCtx())
    expect(res.status).toBe(403)
    expect(mockCreateComment).not.toHaveBeenCalled()
  })

  it('T-07: returns 403 when member status is null', async () => {
    mockUser.memberStatus = null

    const res = await POST(makePostReq({ body: 'Test' }), makeCtx())
    expect(res.status).toBe(403)
    expect(mockCreateComment).not.toHaveBeenCalled()
  })

  it('T-08: returns 400 when body is empty string', async () => {
    const res = await POST(makePostReq({ body: '' }), makeCtx())
    expect(res.status).toBe(400)
    expect(mockCreateComment).not.toHaveBeenCalled()
  })

  it('T-09: returns 400 when body exceeds 500 characters', async () => {
    const res = await POST(makePostReq({ body: 'x'.repeat(501) }), makeCtx())
    expect(res.status).toBe(400)
    expect(mockCreateComment).not.toHaveBeenCalled()
  })

  it('T-10: returns 404 when Sanity slug not found', async () => {
    mockSanityFetch.mockResolvedValueOnce(null)

    const res = await POST(makePostReq({ body: 'Rest in peace.' }), makeCtx())
    expect(res.status).toBe(404)
    expect(mockCreateComment).not.toHaveBeenCalled()
  })

  it('T-11: returns 201 with comment when active member submits valid body', async () => {
    mockSanityFetch.mockResolvedValueOnce({ _id: 'obit-1' })
    mockCreateComment.mockResolvedValueOnce(baseComment)

    const res = await POST(makePostReq({ body: 'Rest in peace.' }), makeCtx())
    const json = await res.json()

    expect(res.status).toBe(201)
    expect(json.comment.id).toBe('cmt-1')
    expect(json.comment.body).toBe('Rest in peace.')
    expect(mockCreateComment).toHaveBeenCalledWith(SLUG, 'mem-1', 'Rest in peace.')
  })
})
