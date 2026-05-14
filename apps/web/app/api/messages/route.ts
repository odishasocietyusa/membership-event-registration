import { withAuth } from '@/lib/auth/with-auth'
import { sendMessage, listMessagesForMember } from '@/lib/messaging/message-service'
import { CreateMessageSchema, ListMessagesQuerySchema } from '@/lib/validation/message.schema'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function serviceErrorToResponse(err: unknown): Response {
  const code = (err as { code?: string }).code
  if (code === 'NOT_FOUND') return jsonResponse(404, { error: 'Not found' })
  if (code === 'FORBIDDEN') return jsonResponse(403, { error: 'Forbidden' })
  if (code === 'BAD_REQUEST') return jsonResponse(400, { error: (err as Error).message })
  console.error(err)
  return jsonResponse(500, { error: 'Internal server error' })
}

export const POST = withAuth(async (req, ctx) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = CreateMessageSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(400, { error: parsed.error.flatten() })
  }

  try {
    const message = await sendMessage(ctx.user.id, ctx.user.fullName, parsed.data)
    return jsonResponse(201, { message })
  } catch (err) {
    return serviceErrorToResponse(err)
  }
})

export const GET = withAuth(async (req, ctx) => {
  const url = new URL(req.url)
  const queryObj: Record<string, string> = {}
  url.searchParams.forEach((v, k) => { queryObj[k] = v })

  const parsed = ListMessagesQuerySchema.safeParse(queryObj)
  if (!parsed.success) {
    return jsonResponse(400, { error: parsed.error.flatten() })
  }

  const { type, page, limit } = parsed.data
  const result = await listMessagesForMember(ctx.user.id, type, page, limit)
  return jsonResponse(200, result)
})
