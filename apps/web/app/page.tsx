import { sanityFetch } from '@/sanity/lib/client'
import { ANNOUNCEMENTS_LATEST_QUERY } from '@/sanity/lib/queries'
import type { SanityAnnouncement } from '@/types/sanity'

const HOMEPAGE_ANNOUNCEMENT_LIMIT = 5

export const revalidate = 60

export default async function Home() {
  const announcements =
    (await sanityFetch<SanityAnnouncement[]>(ANNOUNCEMENTS_LATEST_QUERY, {
      limit: HOMEPAGE_ANNOUNCEMENT_LIMIT,
    })) ?? []

  return (
    <main>
      <h1>OSA Community Platform</h1>
      <p>The Odisha Society of the Americas</p>
      <p>Platform is under development</p>

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
    </main>
  )
}
