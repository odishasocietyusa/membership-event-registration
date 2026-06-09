import { redirect }          from 'next/navigation'
import Link                  from 'next/link'
import { getCurrentMember }  from '@/lib/auth/get-current-member'
import { sanityFetch }       from '@/sanity/lib/client'
import { ALL_EVENTS_QUERY }  from '@/sanity/lib/queries'
import { prisma }            from '@/lib/db/prisma'
import type { SanityEvent }  from '@/types/sanity'

export const dynamic = 'force-dynamic'

export default async function AdminEventsPage() {
  const result = await getCurrentMember()
  if (!result || result.member.role !== 'admin') redirect('/dashboard')

  const events = (await sanityFetch<SanityEvent[]>(ALL_EVENTS_QUERY)) ?? []

  // Single aggregate query — avoids N+1 per event
  const counts = await prisma.eventRegistration.groupBy({
    by:     ['sanityEventId'],
    where:  { status: 'confirmed' },
    _count: { id: true },
  })
  const countMap = new Map(counts.map((c) => [c.sanityEventId, c._count.id]))

  return (
    <main>
      <h1>Events</h1>
      <table border={1} cellPadding={6}>
        <thead>
          <tr>
            <th>Title</th>
            <th>Date</th>
            <th>Access</th>
            <th>Fee</th>
            <th>Confirmed</th>
            <th>Capacity</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e._id}>
              <td>{e.title}</td>
              <td>{new Date(e.start_date).toLocaleDateString('en-US', { dateStyle: 'medium' })}</td>
              <td>{e.accessLevel ?? 'membersOnly'}</td>
              <td>{e.registrationFee != null ? `$${e.registrationFee}` : '—'}</td>
              <td>{e.registrationFee != null ? (countMap.get(e._id) ?? 0) : '—'}</td>
              <td>{e.registrationCapacity ?? '∞'}</td>
              <td>
                {e.registrationFee != null && (
                  <Link href={`/admin/events/${e._id}`}>Registrants</Link>
                )}
              </td>
            </tr>
          ))}
          {events.length === 0 && (
            <tr>
              <td colSpan={7}>No events found in Sanity.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  )
}
