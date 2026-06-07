import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentMember } from '@/lib/auth/get-current-member'
import { listProviders, getProviderByMemberId } from '@/lib/services/service-provider-service'
import ContactButton from './ContactButton'

export const dynamic = 'force-dynamic'

const SPECIALIZATIONS = [
  'Odissi Dance',
  'Odissi Song',
  'Odia Art',
  'Odia Language',
  'Other',
]

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ specialization?: string; onlineOnly?: string }>
}) {
  const result = await getCurrentMember()
  if (!result) redirect('/login')

  const { member } = result
  const { specialization = '', onlineOnly = '' } = await searchParams

  const [providers, myProfile] = await Promise.all([
    listProviders({
      specialization: specialization || undefined,
      onlineOnly: onlineOnly === 'true',
    }),
    getProviderByMemberId(member.id),
  ])

  function initials(name: string) {
    return name
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  function displayLabel(p: { fullName: string; displayName: string | null }) {
    return p.displayName ?? p.fullName
  }

  return (
    <main>
      <h1>Services Directory</h1>

      {!myProfile && (
        <p>
          Are you a teacher or service provider?{' '}
          <Link href="/services/register">Register your profile</Link>
        </p>
      )}
      {myProfile && myProfile.status === 'pending' && (
        <p>Your profile is pending admin approval. <Link href={`/services/${myProfile.id}/edit`}>Edit</Link></p>
      )}
      {myProfile && myProfile.status === 'active' && (
        <p><Link href={`/services/${myProfile.id}/edit`}>Edit my profile</Link></p>
      )}
      {myProfile && myProfile.status === 'inactive' && (
        <p>Your profile has been deactivated. <Link href={`/services/${myProfile.id}/edit`}>View</Link></p>
      )}

      <form method="GET">
        <select name="specialization" defaultValue={specialization}>
          <option value="">All Specializations</option>
          {SPECIALIZATIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            name="onlineOnly"
            value="true"
            defaultChecked={onlineOnly === 'true'}
          />
          {' '}Online classes only
        </label>
        <button type="submit">Filter</button>
        {(specialization || onlineOnly) && <Link href="/services">Clear</Link>}
      </form>

      {providers.length === 0 ? (
        <p>No service providers found.</p>
      ) : (
        <ul>
          {providers.map((p) => (
            <li key={p.id}>
              {p.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.photoUrl}
                  alt={displayLabel(p)}
                  width={80}
                  height={80}
                  style={{ objectFit: 'cover' }}
                />
              ) : (
                <span>{initials(displayLabel(p))}</span>
              )}
              <strong>{displayLabel(p)}</strong>
              {p.displayName && <span> ({p.fullName})</span>}
              {p.isOsaMember && <span> [OSA Member]</span>}
              {p.onlineClasses && <span> [Online Classes Available]</span>}
              <p>{p.specializations.join(', ')}</p>
              <p>{p.bio}</p>
              {p.phone && <p>Phone: {p.phone}</p>}
              {p.websiteUrl && (
                <p>
                  <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer">
                    Website
                  </a>
                </p>
              )}
              <ContactButton
                providerId={p.id}
                providerName={p.fullName}
                memberIsActive={member.memberStatus === 'active'}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
