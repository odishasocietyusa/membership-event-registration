import { withAuth } from '@/lib/auth/with-auth'
import { sanityFetch } from '@/sanity/lib/client'
import { OBITUARY_BY_SLUG_QUERY } from '@/sanity/lib/queries'
import { createComment, listComments } from '@/lib/obituaries/comment-service'
import { CreateCommentSchema } from '@/lib/validation/obituary-comment.schema'
import type { SanityObituary } from '@/types/sanity'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params
  try {
    const comments = await listComments(slug)
    return jsonResponse(200, {
      comments: comments.map((c) => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        authorName: c.member.fullName ?? c.member.email.split('@')[0],
      })),
    })
  } catch {
    return jsonResponse(500, { error: 'Internal server error' })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<Response> {
  const { slug } = await params
  return withAuth(async (innerReq, ctx) => {
    if (ctx.user.memberStatus !== 'active') {
      return jsonResponse(403, { error: 'Active membership required to comment' })
    }

    let body: unknown
    try {
      body = await innerReq.json()
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON' })
    }

    const parsed = CreateCommentSchema.safeParse(body)
    if (!parsed.success) {
      return jsonResponse(400, { error: parsed.error.flatten() })
    }

    const obituary = await sanityFetch<SanityObituary>(OBITUARY_BY_SLUG_QUERY, { slug })
    if (!obituary) {
      return jsonResponse(404, { error: 'Obituary not found' })
    }

    const comment = await createComment(slug, ctx.user.id, parsed.data.body)
    return jsonResponse(201, {
      comment: { id: comment.id, body: comment.body, createdAt: comment.createdAt },
    })
  })(req)
}
