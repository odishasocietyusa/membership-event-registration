import { withAuth }        from '@/lib/auth/with-auth'
import { prisma }           from '@/lib/db/prisma'
import { sanityFetch }      from '@/sanity/lib/client'
import { EVENT_BY_ID_QUERY } from '@/sanity/lib/queries'
import { createEventRegistrationSession } from '@/lib/payments/stripe'
import { sendEventRegistrationConfirmation } from '@/lib/emails/event-registration-confirmation'
import { MemberRegisterSchema } from '@/lib/validation/event.schema'
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

  return withAuth(async (request, { user }) => {
    let body: unknown
    try { body = await request.json() } catch { body = {} }
    const parsed = MemberRegisterSchema.safeParse(body)
    if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })
    const { guestCount } = parsed.data

    const event = await sanityFetch<SanityEvent>(EVENT_BY_ID_QUERY, { sanityId: sanityEventId })
    if (!event) return jsonResponse(404, { error: 'Event not found' })
    if (event.registrationFee == null) {
      return jsonResponse(404, { error: 'Registration is not enabled for this event' })
    }

    // Membership gate — applies to membersOnly events (including legacy events without accessLevel)
    if (event.accessLevel !== 'openToAll') {
      if (user.memberStatus !== 'active') {
        return jsonResponse(403, { error: 'Active membership required to register for this event' })
      }
    }

    // Already registered?
    const existing = await prisma.eventRegistration.findUnique({
      where: { sanityEventId_memberId: { sanityEventId: event._id, memberId: user.id } },
    })
    if (existing?.status === 'confirmed') {
      return jsonResponse(409, { error: 'You are already registered for this event' })
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
          await tx.eventRegistration.upsert({
            where:  { sanityEventId_memberId: { sanityEventId: event._id, memberId: user.id } },
            create: { sanityEventId: event._id, memberId: user.id, guestCount, status: 'confirmed' },
            update: { guestCount, status: 'confirmed', cancelledAt: null },
          })
        }, { isolationLevel: 'Serializable' })
      } catch (err) {
        if (err instanceof CapacityError) return jsonResponse(409, { error: err.message })
        throw err
      }

      sendEventRegistrationConfirmation({
        to:         user.email,
        name:       user.fullName,
        eventTitle: event.title,
        eventDate:  event.start_date,
        location:   event.location,
        onlineLink: event.onlineLink ?? null,
      }).catch(console.error)

      return jsonResponse(200, { redirect: `/events/${event.slug}/success` })
    }

    // Paid path — check capacity, create pending row, return Stripe session URL
    try {
      await prisma.$transaction(async (tx) => {
        if (event.registrationCapacity) {
          const count = await tx.eventRegistration.count({
            where: { sanityEventId: event._id, status: 'confirmed' },
          })
          if (count >= event.registrationCapacity) throw new CapacityError()
        }
        await tx.eventRegistration.upsert({
          where:  { sanityEventId_memberId: { sanityEventId: event._id, memberId: user.id } },
          create: { sanityEventId: event._id, memberId: user.id, guestCount, status: 'pending' },
          update: {}, // preserve existing pending row — do not overwrite
        })
      }, { isolationLevel: 'Serializable' })
    } catch (err) {
      if (err instanceof CapacityError) return jsonResponse(409, { error: err.message })
      throw err
    }

    const stripeUrl = await createEventRegistrationSession(
      user.id,
      user.email,
      event._id,
      event.title,
      event.slug,
      event.registrationFee,
      guestCount,
    )
    return jsonResponse(200, { url: stripeUrl })
  })(req)
}
