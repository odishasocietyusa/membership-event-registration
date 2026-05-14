import { notFound } from 'next/navigation'
import { PortableText } from '@portabletext/react'
import { sanityFetch } from '@/sanity/lib/client'
import { NEWS_POST_BY_SLUG_QUERY, ALL_NEWS_SLUGS_QUERY } from '@/sanity/lib/queries'
import { urlFor } from '@/sanity/lib/image'
import type { SanityNewsPost } from '@/types/sanity'

export const revalidate = 60

export async function generateStaticParams() {
  try {
    const slugs =
      (await sanityFetch<{ slug: string }[]>(ALL_NEWS_SLUGS_QUERY, {}, false)) ?? []
    return slugs.map((s) => ({ slug: s.slug }))
  } catch {
    return []
  }
}

export default async function NewsPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await sanityFetch<SanityNewsPost>(NEWS_POST_BY_SLUG_QUERY, { slug })

  if (!post) {
    notFound()
  }

  return (
    <main>
      <h1>{post.title}</h1>
      <time>{post.published_at}</time>
      <p>By {post.author_name}</p>
      {post.cover_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={urlFor(post.cover_image).url()} alt={post.title} />
      )}
      {post.body && <PortableText value={post.body} />}
    </main>
  )
}
