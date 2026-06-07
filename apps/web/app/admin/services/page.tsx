import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentMember } from '@/lib/auth/get-current-member'
import { listProviders } from '@/lib/services/service-provider-service'
import AdminServiceActions from './AdminServiceActions'

export const dynamic = 'force-dynamic'

export default async function AdminServicesPage() {
  const result = await getCurrentMember()
  if (!result || result.member.role !== 'admin') redirect('/dashboard')

  const providers = await listProviders({ includeAll: true })

  const pending = providers.filter((p) => p.status === 'pending')
  const active = providers.filter((p) => p.status === 'active')
  const inactive = providers.filter((p) => p.status === 'inactive')

  return (
    <main>
      <h1>Admin — Service Providers</h1>
      <p>
        {pending.length} pending &nbsp;|&nbsp; {active.length} active &nbsp;|&nbsp; {inactive.length} inactive
      </p>

      {providers.length === 0 ? (
        <p>No service providers registered.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Specializations</th>
              <th>OSA Member</th>
              <th>Online</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id}>
                <td>{p.displayName ?? p.fullName}{p.displayName && ` (${p.fullName})`}</td>
                <td>{p.specializations.join(', ')}</td>
                <td>{p.isOsaMember ? 'Yes' : 'No'}</td>
                <td>{p.onlineClasses ? 'Yes' : 'No'}</td>
                <td>{p.status}</td>
                <td>
                  <Link href={`/services/${p.id}/edit`}>Edit</Link>
                  {' '}
                  <AdminServiceActions providerId={p.id} currentStatus={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
