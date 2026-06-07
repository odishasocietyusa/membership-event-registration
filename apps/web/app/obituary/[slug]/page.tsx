import { notFound } from 'next/navigation'
import { sanityFetch } from '@/sanity/lib/client'
import { OBITUARY_BY_SLUG_QUERY, ALL_OBITUARY_SLUGS_QUERY } from '@/sanity/lib/queries'
import { urlFor } from '@/sanity/lib/image'
import { listComments } from '@/lib/obituaries/comment-service'
import type { SanityObituary, SanityObituarySlug } from '@/types/sanity'
import CommentForm from './CommentForm'

export const revalidate = 60

export async function generateStaticParams() {
  try {
    const slugs =
      (await sanityFetch<SanityObituarySlug[]>(ALL_OBITUARY_SLUGS_QUERY, {}, false)) ?? []
    return slugs.map((s) => ({ slug: s.slug }))
  } catch {
    return []
  }
}

export default async function ObituaryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const [obituary, comments] = await Promise.all([
    sanityFetch<SanityObituary>(OBITUARY_BY_SLUG_QUERY, { slug }),
    listComments(slug),
  ])

  if (!obituary) notFound()

  const formattedDate = obituary.date_of_passing
    ? new Date(obituary.date_of_passing).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      })
    : null

  return (
    <main>
      <h1>{obituary.name}</h1>

      {formattedDate && <p>Date of Passing: {formattedDate}</p>}

      {obituary.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={urlFor(obituary.photo).width(400).url()}
          alt={obituary.name}
        />
      )}

      {(obituary.chapter || obituary.state) && (
        <p>{[obituary.chapter, obituary.state].filter(Boolean).join(' — ')}</p>
      )}

      {obituary.biography && <p>{obituary.biography}</p>}

      <section>
        <h2>Condolences</h2>
        {comments.length === 0 ? (
          <p>No condolences have been shared yet.</p>
        ) : (
          <ul>
            {comments.map((c) => (
              <li key={c.id}>
                <p>{c.body}</p>
                <small>
                  {c.member.fullName ?? c.member.email.split('@')[0]} &mdash;{' '}
                  {new Date(c.createdAt).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                </small>
              </li>
            ))}
          </ul>
        )}
      </section>

      <CommentForm slug={slug} />
    </main>
  )
}
