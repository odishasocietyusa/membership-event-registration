import { cookies }             from 'next/headers'
import { sanityFetch }        from '@/sanity/lib/client'
import { EVENT_BY_SLUG_QUERY } from '@/sanity/lib/queries'
import type { SanityEvent }   from '@/types/sanity'

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

  // Set cookie so returning guests see "You are registered" on the event page
  if (event?._id && isGuest) {
    const cookieStore = await cookies()
    cookieStore.set(`osa_reg_${event._id}`, '1', {
      maxAge:   60 * 60 * 24 * 365, // 1 year
      httpOnly: true,
      sameSite: 'lax',
      path:     '/',
    })
  }

  return (
    <main>
      <h1>Registration Confirmed</h1>
      <p>You are registered for <strong>{event?.title ?? 'this event'}</strong>.</p>
      <p>A confirmation email has been sent to you.</p>
      <p>
        <a href={`/events/${slug}`}>Back to event</a>
        {' · '}
        <a href="/events">All events</a>
      </p>
    </main>
  )
}
