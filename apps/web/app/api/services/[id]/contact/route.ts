import { withAuth } from '@/lib/auth/with-auth'
import {
  getProviderById,
  getProviderEmail,
  countRecentContacts,
  logContact,
} from '@/lib/services/service-provider-service'
import { sendServiceContactEmail } from '@/lib/messaging/service-contact'
import { ContactProviderSchema } from '@/lib/validation/service-provider.schema'

export const dynamic = 'force-dynamic'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  return withAuth(async (innerReq, ctx) => {
    if (ctx.user.memberStatus !== 'active') {
      return json(403, { error: 'Active membership required to contact service providers' })
    }

    const { id } = await params

    const provider = await getProviderById(id)
    if (!provider || provider.status !== 'active') return json(404, { error: 'Provider not found' })

    const recentCount = await countRecentContacts(ctx.user.id, id)
    if (recentCount >= 5) {
      return json(429, { error: 'You have reached the limit of 5 messages per hour' })
    }

    let body: unknown
    try {
      body = await innerReq.json()
    } catch {
      return json(400, { error: 'Invalid JSON' })
    }

    const parsed = ContactProviderSchema.safeParse(body)
    if (!parsed.success) return json(400, { error: parsed.error.flatten() })

    const providerEmail = await getProviderEmail(id)
    if (!providerEmail) return json(404, { error: 'Provider not found' })

    try {
      await sendServiceContactEmail({
        to: providerEmail,
        providerName: provider.fullName,
        senderName: ctx.user.fullName ?? ctx.user.email,
        senderEmail: ctx.user.email,
        subject: parsed.data.subject,
        body: parsed.data.body,
      })
    } catch {
      return json(502, { error: 'Failed to send message. Please try again later.' })
    }

    // Only log after successful send
    await logContact(id, ctx.user.id, parsed.data.subject, parsed.data.body)

    return json(200, { message: 'Message sent successfully' })
  })(req)
}
