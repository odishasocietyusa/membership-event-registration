import { notFound }            from 'next/navigation'
import { cookies }             from 'next/headers'
import { getCurrentMember }   from '@/lib/auth/get-current-member'
import { sanityFetch }        from '@/sanity/lib/client'
import { EVENT_BY_SLUG_QUERY } from '@/sanity/lib/queries'
import { prisma }              from '@/lib/db/prisma'
import { urlFor }              from '@/sanity/lib/image'
import type { SanityEvent }   from '@/types/sanity'
import RegisterSection         from './RegisterSection'

export const dynamic = 'force-dynamic'

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug }   = await params
  const authResult = await getCurrentMember()   // null when unauthenticated — no redirect
  const member     = authResult?.member ?? null

  const event = await sanityFetch<SanityEvent>(EVENT_BY_SLUG_QUERY, { slug })
  if (!event) notFound()

  const registrationUiEnabled = event.registrationFee != null

  let isSoldOut           = false
  let isAlreadyRegistered = false

  if (registrationUiEnabled) {
    if (event.registrationCapacity) {
      const confirmedCount = await prisma.eventRegistration.count({
        where: { sanityEventId: event._id, status: 'confirmed' },
      })
      isSoldOut = confirmedCount >= event.registrationCapacity
    }

    if (member) {
      const existing = await prisma.eventRegistration.findUnique({
        where: { sanityEventId_memberId: { sanityEventId: event._id, memberId: member.id } },
      })
      isAlreadyRegistered = existing?.status === 'confirmed'
    }

    if (!isAlreadyRegistered) {
      const cookieStore = await cookies()
      if (cookieStore.get(`osa_reg_${event._id}`)?.value === '1') {
        isAlreadyRegistered = true
      }
    }
  }

  return (
    <main>
      <h1>{event.title}</h1>
      <time>{event.start_date}</time>
      {event.end_date && <time> – {event.end_date}</time>}
      <p>{event.location}</p>
      {event.onlineLink && (
        <p>
          Online:{' '}
          <a href={event.onlineLink} target="_blank" rel="noopener noreferrer">
            {event.onlineLink}
          </a>
        </p>
      )}
      <p>{event.description}</p>
      {event.flyer && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urlFor(event.flyer).url()} alt={`${event.title} flyer`} />
      )}

      {/* Legacy: events without registrationFee set use the old external link */}
      {!registrationUiEnabled && event.registration_link && (
        <a href={event.registration_link}>Register</a>
      )}

      {registrationUiEnabled && (
        <RegisterSection
          sanityEventId={event._id}
          slug={slug}
          accessLevel={event.accessLevel ?? 'membersOnly'}
          registrationFee={event.registrationFee!}
          guestCountEnabled={event.guestCountEnabled ?? false}
          isSoldOut={isSoldOut}
          isAlreadyRegistered={isAlreadyRegistered}
          memberStatus={member?.memberStatus ?? null}
          isAuthenticated={member !== null}
        />
      )}
    </main>
  )
}
