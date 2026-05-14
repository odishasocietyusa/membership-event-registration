import { notFound } from 'next/navigation'
import { sanityFetch } from '@/sanity/lib/client'
import { EVENT_BY_SLUG_QUERY, ALL_EVENT_SLUGS_QUERY } from '@/sanity/lib/queries'
import { urlFor } from '@/sanity/lib/image'
import type { SanityEvent } from '@/types/sanity'

export const revalidate = 60

export async function generateStaticParams() {
  try {
    const slugs =
      (await sanityFetch<{ slug: string }[]>(ALL_EVENT_SLUGS_QUERY, {}, false)) ?? []
    return slugs.map((s) => ({ slug: s.slug }))
  } catch {
    return [] // Graceful fallback: pages render on-demand
  }
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
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
