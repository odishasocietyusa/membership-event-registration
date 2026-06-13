import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentMember } from '@/lib/auth/get-current-member'
import { listExpertiseProfiles, getExpertiseProfileByMemberId } from '@/lib/expertise/expertise-profile-service'
import { EXPERTISE_CATEGORIES, ELIGIBLE_MEMBERSHIP_TYPES } from '@/lib/expertise/constants'

export const dynamic = 'force-dynamic'

export default async function ExpertiseDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>
}) {
  const result = await getCurrentMember()
  if (!result) redirect('/login')

  const { member } = result
  if (member.memberStatus !== 'active') redirect('/dashboard')

  const { category = '', page: pageParam = '1' } = await searchParams
  const page = parseInt(pageParam, 10) || 1

  const [{ results, total, pageSize }, myProfile] = await Promise.all([
    listExpertiseProfiles({ category: category || undefined, page }),
    getExpertiseProfileByMemberId(member.id),
  ])

  const isEligible =
    !!member.membershipType && (ELIGIBLE_MEMBERSHIP_TYPES as readonly string[]).includes(member.membershipType)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const categoryQs = category ? `category=${encodeURIComponent(category)}&` : ''

  return (
    <main>
      <h1>Expertise Directory</h1>

      {isEligible && !myProfile && (
        <p>
          <Link href="/membership/expertise/register">Register your expertise</Link>
        </p>
      )}
      {myProfile && (
        <p>
          <Link href={`/membership/expertise/${myProfile.id}/edit`}>Edit my entry</Link>
        </p>
      )}

      <form method="GET">
        <select name="category" defaultValue={category}>
          <option value="">All Categories</option>
          {EXPERTISE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button type="submit">Filter</button>
        {category && <Link href="/membership/expertise">Clear</Link>}
      </form>

      {results.length === 0 ? (
        <p>No expertise entries found.</p>
      ) : (
        <ul>
          {results.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.fullName}</strong>
              {entry.organization && <span> ({entry.organization})</span>}
              <p>{entry.categories.join(', ')}</p>
              <p>{entry.blurb}</p>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <p>
          {page > 1 && (
            <Link href={`/membership/expertise?${categoryQs}page=${page - 1}`}>Previous</Link>
          )}
          {' '}Page {page} of {totalPages}{' '}
          {page < totalPages && (
            <Link href={`/membership/expertise?${categoryQs}page=${page + 1}`}>Next</Link>
          )}
        </p>
      )}
    </main>
  )
}
