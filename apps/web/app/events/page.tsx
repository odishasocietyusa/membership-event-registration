import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/auth/supabase-server'
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
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
  const headers = { Authorization: `Bearer ${session.access_token}` }

  const { user } = await fetch(`${baseUrl}/api/auth/me`, { headers, cache: 'no-store' }).then(r => r.json())

  if (user?.memberStatus !== 'active') {
    return <MembershipGate status={user?.memberStatus ?? null} />
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
              <time>{event.start_date}</time>
              <p>{event.location}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
