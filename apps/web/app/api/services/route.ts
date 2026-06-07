import { withAuth } from '@/lib/auth/with-auth'
import {
  listProviders,
  createProvider,
  getProviderByMemberId,
} from '@/lib/services/service-provider-service'
import { RegisterProviderSchema } from '@/lib/validation/service-provider.schema'

export const dynamic = 'force-dynamic'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function GET(req: Request): Promise<Response> {
  return withAuth(async (_req) => {
    const url = new URL(req.url)
    const specialization = url.searchParams.get('specialization') ?? undefined
    const onlineOnly = url.searchParams.get('onlineOnly') === 'true'

    const providers = await listProviders({ specialization, onlineOnly })
    return json(200, { providers })
  })(req)
}

export function POST(req: Request): Promise<Response> {
  return withAuth(async (innerReq, ctx) => {
    if (ctx.user.memberStatus !== 'active') {
      return json(403, { error: 'Active membership required to register as a service provider' })
    }

    const existing = await getProviderByMemberId(ctx.user.id)
    if (existing) {
      return json(409, { error: 'You already have a service provider profile' })
    }

    let body: unknown
    try {
      body = await innerReq.json()
    } catch {
      return json(400, { error: 'Invalid JSON' })
    }

    const parsed = RegisterProviderSchema.safeParse(body)
    if (!parsed.success) {
      return json(400, { error: parsed.error.flatten() })
    }

    const provider = await createProvider(
      ctx.user.id,
      ctx.user.email,
      ctx.user.fullName ?? ctx.user.email,
      parsed.data
    )

    return json(201, { provider })
  })(req)
}
