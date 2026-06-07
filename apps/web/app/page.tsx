import Link from 'next/link'
import { PortableText } from '@portabletext/react'
import { sanityFetch } from '@/sanity/lib/client'
import {
  ANNOUNCEMENTS_LATEST_QUERY,
  UPCOMING_EVENTS_QUERY,
  NEWS_LATEST_QUERY,
  STATIC_PAGE_BY_SLUG_QUERY,
} from '@/sanity/lib/queries'
import type { SanityAnnouncement, SanityStaticPage } from '@/types/sanity'
import { formatDate } from '@/lib/utils/date'
import RegistrationPrompt from './registration-prompt'

const HOMEPAGE_ANNOUNCEMENT_LIMIT = 5
const HOMEPAGE_EVENT_LIMIT = 3
const HOMEPAGE_NEWS_LIMIT = 3

interface UpcomingEvent {
  _id: string
  title: string
  slug: string
  start_date: string
  location: string
  is_convention: boolean
}

interface NewsSummary {
  _id: string
  title: string
  slug: string
  published_at: string
  author_name: string
}

export const revalidate = 60

export default async function Home() {
  const [announcementsResult, executiveInfo, upcomingEventsResult, newsResult, contactInfo] = await Promise.all([
    sanityFetch<SanityAnnouncement[]>(ANNOUNCEMENTS_LATEST_QUERY, {
      limit: HOMEPAGE_ANNOUNCEMENT_LIMIT,
    }),
    sanityFetch<SanityStaticPage>(STATIC_PAGE_BY_SLUG_QUERY, { slug: 'home-executive-info' }),
    sanityFetch<UpcomingEvent[]>(UPCOMING_EVENTS_QUERY, { limit: HOMEPAGE_EVENT_LIMIT }),
    sanityFetch<NewsSummary[]>(NEWS_LATEST_QUERY, { limit: HOMEPAGE_NEWS_LIMIT }),
    sanityFetch<SanityStaticPage>(STATIC_PAGE_BY_SLUG_QUERY, { slug: 'home-contact-info' }),
  ])

  const announcements = announcementsResult ?? []
  const upcomingEvents = upcomingEventsResult ?? []
  const news = newsResult ?? []

  return (
    <main>
      <h1>OSA Community Platform</h1>
      <p>The Odisha Society of the Americas</p>

      {/* Shown only to authenticated users who have not yet completed membership */}
      <RegistrationPrompt />

      {announcements.length > 0 && (
        <section>
          <h2>Announcements</h2>
          <ul>
            {announcements.map((a) => (
              <li key={a._id}>
                <h3>{a.title}</h3>
                <p>{a.body}</p>
                {a.cta_link && <a href={a.cta_link}>{a.cta_label ?? 'Learn more'}</a>}
              </li>
            ))}
          </ul>
          <a href="/announcements">View all announcements</a>
        </section>
      )}

      <section>
        <h2>Current Executive</h2>
        {executiveInfo ? <PortableText value={executiveInfo.body} /> : <p>Coming soon.</p>}
      </section>

      <section>
        <h2>Upcoming Events</h2>
        {upcomingEvents.length > 0 ? (
          <ul>
            {upcomingEvents.map((e) => (
              <li key={e._id}>
                <Link href={`/events/${e.slug}`}>{e.title}</Link>
                {' — '}
                <time>{formatDate(e.start_date)}</time>
                {' · '}
                {e.location}
              </li>
            ))}
          </ul>
        ) : (
          <p>No upcoming events.</p>
        )}
        <Link href="/events">View all events</Link>
      </section>

      <section>
        <h2>News</h2>
        {news.length > 0 ? (
          <ul>
            {news.map((n) => (
              <li key={n._id}>
                <Link href={`/news/${n.slug}`}>{n.title}</Link>
                {' — '}
                <time>{formatDate(n.published_at)}</time>
                {' · '}
                {n.author_name}
              </li>
            ))}
          </ul>
        ) : (
          <p>No news yet.</p>
        )}
        <Link href="/news">View all news</Link>
      </section>

      <section>
        <h2>Contact Us</h2>
        {contactInfo ? <PortableText value={contactInfo.body} /> : <p>Coming soon.</p>}
      </section>
    </main>
  )
}
