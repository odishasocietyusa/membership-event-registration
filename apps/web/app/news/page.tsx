import { sanityFetch } from '@/sanity/lib/client'
import { ALL_NEWS_POSTS_QUERY } from '@/sanity/lib/queries'
import type { SanityNewsPost } from '@/types/sanity'

export const revalidate = 60

export default async function NewsPage() {
  const posts = (await sanityFetch<SanityNewsPost[]>(ALL_NEWS_POSTS_QUERY)) ?? []

  return (
    <main>
      <h1>News</h1>
      {posts.length === 0 ? (
        <p>No news posts found.</p>
      ) : (
        <ul>
          {posts.map((post) => (
            <li key={post._id}>
              <a href={`/news/${post.slug}`}>{post.title}</a>
              <time>{post.published_at}</time>
              <p>{post.author_name}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
