import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentMember } from '@/lib/auth/get-current-member'
import { listExpertiseProfiles } from '@/lib/expertise/expertise-profile-service'
import AdminExpertiseActions from './AdminExpertiseActions'

export const dynamic = 'force-dynamic'

export default async function AdminExpertisePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const result = await getCurrentMember()
  if (!result || result.member.role !== 'admin') redirect('/dashboard')

  const { page: pageParam = '1' } = await searchParams
  const page = parseInt(pageParam, 10) || 1

  const { results, total, pageSize } = await listExpertiseProfiles({ includeHidden: true, page })
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <main>
      <h1>Admin — Expertise Directory</h1>
      <p>{total} total entries</p>

      {results.length === 0 ? (
        <p>No expertise entries found.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Organization</th>
              <th>Categories</th>
              <th>Hidden</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {results.map((p) => (
              <tr key={p.id}>
                <td>{p.fullName}</td>
                <td>{p.organization ?? ''}</td>
                <td>{p.categories.join(', ')}</td>
                <td>{p.isHidden ? 'Yes' : 'No'}</td>
                <td>
                  <AdminExpertiseActions profileId={p.id} isHidden={p.isHidden} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <p>
          {page > 1 && <Link href={`/admin/expertise?page=${page - 1}`}>Previous</Link>}
          {' '}Page {page} of {totalPages}{' '}
          {page < totalPages && <Link href={`/admin/expertise?page=${page + 1}`}>Next</Link>}
        </p>
      )}
    </main>
  )
}
