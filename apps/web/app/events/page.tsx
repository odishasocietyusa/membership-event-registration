import { redirect } from 'next/navigation'
import { getCurrentMember } from '@/lib/auth/get-current-member'
import { sanityFetch } from '@/sanity/lib/client'
import { ALL_EVENTS_QUERY } from '@/sanity/lib/queries'
import type { SanityEvent } from '@/types/sanity'

export const dynamic = 'force-dynamic'

function MembershipGate({ status }: { status: string | null }) {
  if (status === 'expired') {
    return (
      <main>
        <h1>Member-Only Content</h1>
        <p>Your membership has expired. <a href="/membership">Renew your membership</a> to access events.</p>
      </main>
    )
  }
  if (status === 'suspended') {
    return (
      <main>
        <h1>Account Suspended</h1>
        <p>Your account is currently suspended. Please contact us for assistance.</p>
      </main>
    )
  }
  return (
    <main>
      <h1>Member-Only Content</h1>
      <p>Events are available to active members only. <a href="/membership">Become a member</a> to access this page.</p>
    </main>
  )
}

export default async function EventsPage() {
  const result = await getCurrentMember()
  if (!result) redirect('/login')
  const { member: user } = result

  if (user.memberStatus !== 'active') {
    return <MembershipGate status={user.memberStatus} />
  }

  const events = (await sanityFetch<SanityEvent[]>(ALL_EVENTS_QUERY)) ?? []

  return (
    <main>
      <h1>Events</h1>
      {events.length === 0 ? (
        <p>No events found.</p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event._id}>
              <a href={`/events/${event.slug}`}>{event.title}</a>
               — <time>{event.start_date}</time>
              <p>{event.location}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
