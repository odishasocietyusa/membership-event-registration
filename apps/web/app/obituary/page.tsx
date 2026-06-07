import Link from 'next/link'
import { sanityFetch } from '@/sanity/lib/client'
import { ALL_OBITUARIES_QUERY, OBITUARIES_COUNT_QUERY } from '@/sanity/lib/queries'
import type { SanityObituary } from '@/types/sanity'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 20

export default async function ObituaryPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; state?: string; year?: string; page?: string }>
}) {
  const { name = '', state = '', year = '', page = '1' } = await searchParams

  const currentPage = Math.max(1, parseInt(page, 10) || 1)
  const from = (currentPage - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE

  const queryParams = {
    name,
    state,
    year: year ? parseInt(year, 10) : 0,
    from,
    to,
  }

  const [obituaries, total] = await Promise.all([
    sanityFetch<SanityObituary[]>(ALL_OBITUARIES_QUERY, queryParams) ?? [],
    sanityFetch<number>(OBITUARIES_COUNT_QUERY, { name, state, year: year ? parseInt(year, 10) : 0 }),
  ])

  const totalPages = Math.ceil((total ?? 0) / PAGE_SIZE)

  function pageUrl(p: number) {
    const params = new URLSearchParams()
    if (name) params.set('name', name)
    if (state) params.set('state', state)
    if (year) params.set('year', year)
    if (p > 1) params.set('page', String(p))
    const qs = params.toString()
    return `/obituary${qs ? `?${qs}` : ''}`
  }

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

      {(obituaries ?? []).length === 0 ? (
        <p>No obituaries found.</p>
      ) : (
        <>
          <p>{total} {total === 1 ? 'result' : 'results'}</p>
          <ul>
            {(obituaries ?? []).map((o) => (
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

          {totalPages > 1 && (
            <nav aria-label="Pagination">
              {currentPage > 1 && (
                <Link href={pageUrl(currentPage - 1)}>&larr; Previous</Link>
              )}
              <span>
                {' '}Page {currentPage} of {totalPages}{' '}
              </span>
              {currentPage < totalPages && (
                <Link href={pageUrl(currentPage + 1)}>Next &rarr;</Link>
              )}
            </nav>
          )}
        </>
      )}
    </main>
  )
}
