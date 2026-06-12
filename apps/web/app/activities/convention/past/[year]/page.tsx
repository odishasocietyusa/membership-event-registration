import { PortableText } from '@portabletext/react'
import { sanityFetch } from '@/sanity/lib/client'
import { PAST_CONVENTION_BY_YEAR_QUERY, ALL_CONVENTION_YEARS_QUERY } from '@/sanity/lib/queries'
import type { SanityPastConvention, SanityConventionYear } from '@/types/sanity'
import YearSelector from './YearSelector'

export const revalidate = 60

export default async function PastConventionYearPage({
  params,
}: {
  params: Promise<{ year: string }>
}) {
  const { year: yearParam } = await params
  const year = parseInt(yearParam, 10)

  const [convention, years] = await Promise.all([
    isNaN(year) ? Promise.resolve(null) : sanityFetch<SanityPastConvention>(PAST_CONVENTION_BY_YEAR_QUERY, { year }),
    sanityFetch<SanityConventionYear[]>(ALL_CONVENTION_YEARS_QUERY),
  ])

  const allYears = years ?? []

  return (
    <main>
      <YearSelector years={allYears} currentYear={isNaN(year) ? null : year} />

      {!convention ? (
        <p>No convention record for {yearParam}.</p>
      ) : (
        <>
          <h1>
            OSA {convention.convention_number} Annual Convention {convention.year} at {convention.city}, {convention.state}
          </h1>

          {convention.dates_text   && <p>{convention.dates_text}</p>}
          {convention.venue_name   && <p>{convention.venue_name}</p>}
          {convention.theme        && <p>Theme: {convention.theme}</p>}
          {convention.host_chapter && <p>Hosted by: {convention.host_chapter}</p>}

          {convention.overview && convention.overview.length > 0 && (
            <section>
              <h2>Overview</h2>
              <PortableText value={convention.overview} />
            </section>
          )}

          {convention.core_team && convention.core_team.length > 0 && (
            <section>
              <h2>Convention Core Team</h2>
              <ul>
                {convention.core_team.map((m, i) => (
                  <li key={i}>{m.role} — {m.name}</li>
                ))}
              </ul>
            </section>
          )}

          {convention.convention_guests && convention.convention_guests.length > 0 && (
            <section>
              <h2>Convention Guests</h2>
              <ul>
                {convention.convention_guests.map((g, i) => (
                  <li key={i}>{g.role} — {g.name}</li>
                ))}
              </ul>
            </section>
          )}

          {convention.donors && convention.donors.length > 0 && (
            <section>
              <h2>Convention Donors</h2>
              {convention.donors.map((tier, i) => (
                <div key={i}>
                  <h3>{tier.tier_name}</h3>
                  {tier.entries.length > 0 && (
                    <ul>
                      {tier.entries.map((d, j) => (
                        <li key={j}>{d.name}{d.organization ? ` — ${d.organization}` : ''}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          )}

          {convention.award_winners && convention.award_winners.length > 0 && (
            <section>
              <h2>Convention Award Winners</h2>
              <ul>
                {convention.award_winners.map((w, i) => (
                  <li key={i}>{w.award_name} — {w.recipient_name}</li>
                ))}
              </ul>
            </section>
          )}

          {(convention.youtube_link || convention.photo_album_link) && (
            <section>
              <h2>Media</h2>
              {convention.youtube_link     && <p><a href={convention.youtube_link}     target="_blank" rel="noopener noreferrer">Watch on YouTube</a></p>}
              {convention.photo_album_link && <p><a href={convention.photo_album_link} target="_blank" rel="noopener noreferrer">View Photo Album</a></p>}
            </section>
          )}
        </>
      )}
    </main>
  )
}
