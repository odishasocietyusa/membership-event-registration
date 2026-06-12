import Link                    from 'next/link'
import { sanityFetch }        from '@/sanity/lib/client'
import { EVENT_BY_SLUG_QUERY } from '@/sanity/lib/queries'
import type { SanityEvent }   from '@/types/sanity'
import SetGuestCookie          from './SetGuestCookie'

export const dynamic = 'force-dynamic'

export default async function EventSuccessPage({
  params,
  searchParams,
}: {
  params:       Promise<{ slug: string }>
  searchParams: Promise<{ session_id?: string; guest?: string }>
}) {
  const { slug } = await params
  const sp       = await searchParams
  const isGuest  = sp.guest === '1'

  const event = await sanityFetch<SanityEvent>(EVENT_BY_SLUG_QUERY, { slug })

  return (
    <main>
      {/* Sets osa_reg_{id} cookie via Server Action so returning guests see "You are registered" */}
      {isGuest && event?._id && <SetGuestCookie sanityEventId={event._id} />}

      <h1>Registration Confirmed</h1>
      <p>You are registered for <strong>{event?.title ?? 'this event'}</strong>.</p>
      <p>A confirmation email has been sent to you.</p>
      <p>
        <Link href={`/events/${slug}`}>Back to event</Link>
        {' · '}
        <Link href="/events">All events</Link>
      </p>
    </main>
  )
}
