import { sanityFetch } from '@/sanity/lib/client'
import { ALL_EVENTS_QUERY } from '@/sanity/lib/queries'
import type { SanityEvent } from '@/types/sanity'

export const revalidate = 60

export default async function EventsPage() {
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
