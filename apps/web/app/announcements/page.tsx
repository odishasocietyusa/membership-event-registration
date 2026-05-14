import { sanityFetch } from '@/sanity/lib/client'
import { ALL_ANNOUNCEMENTS_QUERY } from '@/sanity/lib/queries'
import type { SanityAnnouncement } from '@/types/sanity'

export const revalidate = 60

export default async function AnnouncementsPage() {
  const announcements =
    (await sanityFetch<SanityAnnouncement[]>(ALL_ANNOUNCEMENTS_QUERY)) ?? []

  return (
    <main>
      <h1>Announcements</h1>
      {announcements.length === 0 ? (
        <p>No announcements at this time.</p>
      ) : (
        <ul>
          {announcements.map((a) => (
            <li key={a._id}>
              <h2>{a.title}</h2>
              <p>{a.body}</p>
              {a.expires_at && <small>Expires: {a.expires_at}</small>}
              {a.cta_link && <a href={a.cta_link}>{a.cta_label ?? 'Learn more'}</a>}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
