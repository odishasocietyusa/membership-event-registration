import Link from 'next/link'
import type { MemberRow } from '@/lib/auth/with-auth'
import { sanityFetch } from '@/sanity/lib/client'
import { PROGRAMS_BY_SECTION_QUERY } from '@/sanity/lib/queries'
import type { SanityProgramLink } from '@/types/sanity'

interface NavBarProps {
  user: MemberRow | null
}

export default async function NavBar({ user }: NavBarProps) {
  const isAuthed   = user !== null && user.memberStatus !== 'suspended'
  const isOsaDomain = isAuthed && (user?.email?.endsWith('@odishasociety.org') ?? false)
  const isAdmin    = isAuthed && user?.role === 'admin'
  const displayName = user?.fullName ?? user?.email ?? null

  const programs = (await sanityFetch<SanityProgramLink[]>(PROGRAMS_BY_SECTION_QUERY, {}, false)) ?? []

  return (
    <nav>
      <strong><Link href="/">OSA Community Platform</Link></strong>
      <hr />
      <ul>
        <li>
          <details>
            <summary>About Us</summary>
            <ul>
              <li><Link href="/about/vision-mission">Mission &amp; Vision</Link></li>
              <li><Link href="/constitution">Constitution &amp; Bylaws</Link></li>
              <li><Link href="/about/policy-documents">Policy Documents</Link></li>
              <li><Link href="/about/forms">Forms</Link></li>
              <li><Link href="/about/administration">Administration</Link></li>
              <li><Link href="/leadership-program">Past Leadership</Link></li>
            </ul>
          </details>
        </li>

        <li>
          <details>
            <summary>Members</summary>
            <ul>
              <li><Link href="/members/benefits">Member Benefits</Link></li>
              <li><Link href="/about/member-rights">Statement of Member Rights &amp; Privileges</Link></li>
              {isAuthed && (
                <>
                  <li><Link href="/membership">Membership Types</Link></li>
                  <li><Link href="/membership/expertise">Expertise Directory</Link></li>
                  <li><Link href="/members/search">Member Directory</Link></li>
                  <li><Link href="/dashboard">Upgrade Membership</Link></li>
                  <li><Link href="/profile">Member Profile</Link></li>
                  <li><Link href="/obituary">Obituary</Link></li>
                </>
              )}
            </ul>
          </details>
        </li>

        <li>
          <details>
            <summary>Events</summary>
            <ul>
              {isAuthed && (
                <li><Link href="/events">Events</Link></li>
              )}
              <li><Link href="/activities/convention">Annual Convention</Link></li>
              <li><Link href="/activities/convention/past">Past Conventions</Link></li>
              <li><Link href="/activities/awards">Awards</Link></li>
            </ul>
          </details>
        </li>

        <li>
          <details>
            <summary>Programs</summary>
            <ul>
              <li><Link href="/services">Services</Link></li>
              {programs.map((p) => (
                <li key={p._id}><Link href={`/programs/${p.slug}`}>{p.title}</Link></li>
              ))}
            </ul>
          </details>
        </li>

        <li>
          <details>
            <summary>Chapters</summary>
            <ul>
              <li><Link href="/chapters">Chapter Details</Link></li>
              {isAuthed && (
                <li><Link href="/chapters/executives">Chapter Executives</Link></li>
              )}
              {isOsaDomain && (
                <li><Link href="/chapters/bog-documents">BOG Documents</Link></li>
              )}
            </ul>
          </details>
        </li>

        <li>
          <details>
            <summary>Publications</summary>
            <ul>
              <li><Link href="/publications/urmi">Urmi — Souvenir</Link></li>
              <li><Link href="/publications/utkarsa">Utkarsa — Newsletter</Link></li>
              <li><Link href="/news">News</Link></li>
              <li><Link href="/announcements">Announcements</Link></li>
              <li><Link href="/gallery">Gallery</Link></li>
            </ul>
          </details>
        </li>

        {isAdmin && (
          <li>
            <details>
              <summary>Admin</summary>
              <ul>
                <li><Link href="/admin/members">Manage Members</Link></li>
                <li><Link href="/admin/payments">Manage Payments</Link></li>
                <li><Link href="/admin/events">Manage Events</Link></li>
                <li><Link href="/admin/services">Manage Services</Link></li>
                <li><Link href="/admin/reports">Reports</Link></li>
              </ul>
            </details>
          </li>
        )}

        <li><Link href="/donate">Donate</Link></li>
      </ul>

      <hr />

      <span>
        {isAuthed ? (
          <>
            <Link href="/dashboard">Dashboard</Link>
            {' | '}
            <Link href="/profile">{displayName}</Link>
            {' | '}
            <form method="POST" action="/api/auth/signout">
              <button type="submit">Sign Out</button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login">Sign In</Link>
            {' | '}
            <Link href="/register">Register</Link>
          </>
        )}
      </span>
      <hr />
    </nav>
  )
}
