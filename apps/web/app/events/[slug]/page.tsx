import { notFound, redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/auth/supabase-server'
import { sanityFetch } from '@/sanity/lib/client'
import { EVENT_BY_SLUG_QUERY } from '@/sanity/lib/queries'
import { urlFor } from '@/sanity/lib/image'
import type { SanityEvent } from '@/types/sanity'

export const dynamic = 'force-dynamic'

function MembershipGate({ status }: { status: string | null }) {
  if (status === 'expired') {
    return (
      <main>
        <h1>Member-Only Content</h1>
        <p>Your membership has expired. <a href="/membership">Renew your membership</a> to access event details.</p>
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
      <p>Event details are available to active members only. <a href="/membership">Become a member</a> to access this page.</p>
    </main>
  )
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
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

  const { slug } = await params
  const event = await sanityFetch<SanityEvent>(EVENT_BY_SLUG_QUERY, { slug })

  if (!event) {
    notFound()
  }

  return (
    <main>
      <h1>{event.title}</h1>
      <time>{event.start_date}</time>
      {event.end_date && <time>{event.end_date}</time>}
      <p>{event.location}</p>
      <p>{event.description}</p>
      {event.registration_link && <a href={event.registration_link}>Register</a>}
      {event.flyer && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urlFor(event.flyer).url()} alt={`${event.title} flyer`} />
      )}
    </main>
  )
}
