import { withAuth } from '@/lib/auth/with-auth'
import {
  listExpertiseProfiles,
  createExpertiseProfile,
  getExpertiseProfileByMemberId,
  type ExpertiseProfilePublic,
} from '@/lib/expertise/expertise-profile-service'
import { RegisterExpertiseSchema } from '@/lib/validation/expertise-profile.schema'
import { ELIGIBLE_MEMBERSHIP_TYPES } from '@/lib/expertise/constants'

export const dynamic = 'force-dynamic'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function toListItem(p: ExpertiseProfilePublic) {
  return {
    id: p.id,
    fullName: p.fullName,
    organization: p.organization,
    categories: p.categories,
    blurb: p.blurb,
    createdAt: p.createdAt,
  }
}

export function GET(req: Request): Promise<Response> {
  return withAuth(async (_req, ctx) => {
    if (ctx.user.memberStatus !== 'active') {
      return json(403, { error: 'Active membership required to view the expertise directory' })
    }

    const url = new URL(req.url)
    const category = url.searchParams.get('category') ?? undefined
    const pageParam = url.searchParams.get('page')
    const page = pageParam ? parseInt(pageParam, 10) : 1

    const { results, total, page: resultPage, pageSize } = await listExpertiseProfiles({ category, page })

    return json(200, {
      results: results.map(toListItem),
      total,
      page: resultPage,
      pageSize,
    })
  })(req)
}

export function POST(req: Request): Promise<Response> {
  return withAuth(async (innerReq, ctx) => {
    if (ctx.user.memberStatus !== 'active') {
      return json(403, { error: 'Active membership required to register in the expertise directory' })
    }

    if (!ctx.user.membershipType || !(ELIGIBLE_MEMBERSHIP_TYPES as readonly string[]).includes(ctx.user.membershipType)) {
      return json(403, { error: 'Your membership tier is not eligible for the expertise directory' })
    }

    const existing = await getExpertiseProfileByMemberId(ctx.user.id)
    if (existing) {
      return json(409, { error: 'You already have an expertise directory entry' })
    }

    let body: unknown
    try {
      body = await innerReq.json()
    } catch {
      return json(400, { error: 'Invalid JSON' })
    }

    const parsed = RegisterExpertiseSchema.safeParse(body)
    if (!parsed.success) {
      return json(400, { error: parsed.error.flatten() })
    }

    const profile = await createExpertiseProfile(ctx.user.id, ctx.user.fullName ?? ctx.user.email, parsed.data)

    return json(201, { profile: toListItem(profile) })
  })(req)
}
