import Link from 'next/link'
import { sanityFetch } from '@/sanity/lib/client'
import { ALL_OBITUARIES_QUERY } from '@/sanity/lib/queries'
import type { SanityObituary } from '@/types/sanity'

export const dynamic = 'force-dynamic'

export default async function ObituaryPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; state?: string; year?: string }>
}) {
  const { name = '', state = '', year = '' } = await searchParams

  const obituaries =
    (await sanityFetch<SanityObituary[]>(ALL_OBITUARIES_QUERY, {
      name,
      state,
      year: year ? parseInt(year, 10) : 0,
    })) ?? []

  return (
    <main>
      <h1>In Memoriam</h1>

      <form method="GET">
        <input name="name" defaultValue={name} placeholder="Search by name" />
        <input name="state" defaultValue={state} placeholder="State (e.g. CA)" maxLength={2} />
        <input name="year" defaultValue={year} placeholder="Year" type="number" min={1900} max={2100} />
        <button type="submit">Filter</button>
        {(name || state || year) && <Link href="/obituary">Clear</Link>}
      </form>

      {obituaries.length === 0 ? (
        <p>No obituaries found.</p>
      ) : (
        <ul>
          {obituaries.map((o) => (
            <li key={o._id}>
              <Link href={`/obituary/${o.slug}`}>{o.name}</Link>
              {o.date_of_passing && (
                <span>
                  {' '}
                  &mdash;{' '}
                  {new Date(o.date_of_passing).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })}
                </span>
              )}
              {(o.chapter || o.state) && (
                <span> — {[o.chapter, o.state].filter(Boolean).join(', ')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
