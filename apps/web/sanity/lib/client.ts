import { createClient } from 'next-sanity'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET!
const apiVersion = '2024-01-01'

// Server-side client — token included, useCdn: false for ISR freshness
export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: false, // false: always fetches from Sanity origin; ISR cache is Next.js-managed
  token: process.env.SANITY_API_TOKEN, // server-only; undefined in browser (never NEXT_PUBLIC_)
})

// Typed fetch helper with ISR revalidation baked in
export async function sanityFetch<T>(
  query: string,
  params?: Record<string, unknown>,
  revalidate: number | false = 60
): Promise<T | null> {
  try {
    return await client.fetch<T>(query, params ?? {}, {
      next: { revalidate },
    })
  } catch (error) {
    console.error('[Sanity] fetch error:', error)
    return null
  }
}
