import { prisma }           from '@/lib/db/prisma'
import { sanityFetch }      from '@/sanity/lib/client'
import { EVENT_BY_ID_QUERY } from '@/sanity/lib/queries'
import { createEventRegistrationGuestSession } from '@/lib/payments/stripe'
import { sendEventRegistrationConfirmation }   from '@/lib/emails/event-registration-confirmation'
import { GuestRegisterSchema } from '@/lib/validation/event.schema'
import type { SanityEvent } from '@/types/sanity'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

class CapacityError extends Error {
  constructor() { super('Event is at capacity'); this.name = 'CapacityError' }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sanityId: string }> },
): Promise<Response> {
  const { sanityId: sanityEventId } = await params

  let body: unknown
  try { body = await req.json() } catch { body = {} }
  const parsed = GuestRegisterSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })
  const { guestName, guestEmail, guestCount } = parsed.data

  const event = await sanityFetch<SanityEvent>(EVENT_BY_ID_QUERY, { sanityId: sanityEventId })
  if (!event) return jsonResponse(404, { error: 'Event not found' })
  if (event.registrationFee == null) {
    return jsonResponse(404, { error: 'Registration is not enabled for this event' })
  }

  // Guest registration is only allowed for openToAll events
  if (event.accessLevel !== 'openToAll') {
    return jsonResponse(403, { error: 'This event is members-only. Please log in to register.' })
  }

  // Free path
  if (event.registrationFee === 0) {
    try {
      await prisma.$transaction(async (tx) => {
        if (event.registrationCapacity) {
          const count = await tx.eventRegistration.count({
            where: { sanityEventId: event._id, status: 'confirmed' },
          })
          if (count >= event.registrationCapacity) throw new CapacityError()
        }
        await tx.eventRegistration.create({
          data: { sanityEventId: event._id, guestEmail, guestName, guestCount, status: 'confirmed' },
        })
      }, { isolationLevel: 'Serializable' })
    } catch (err) {
      if (err instanceof CapacityError) return jsonResponse(409, { error: err.message })
      if ((err as { code?: string }).code === 'P2002') {
        return jsonResponse(409, { error: 'This email is already registered for this event' })
      }
      throw err
    }

    sendEventRegistrationConfirmation({
      to:         guestEmail,
      name:       guestName,
      eventTitle: event.title,
      eventDate:  event.start_date,
      location:   event.location,
      onlineLink: event.onlineLink ?? null,
    }).catch(console.error)

    return jsonResponse(200, { redirect: `/events/${event.slug}/success`, sanityEventId: event._id })
  }

  // Paid path — return Stripe session URL (EventRegistration row created by webhook)
  const stripeUrl = await createEventRegistrationGuestSession(
    guestEmail,
    guestName,
    event._id,
    event.title,
    event.slug,
    event.registrationFee,
    guestCount,
  )
  return jsonResponse(200, { url: stripeUrl })
}
