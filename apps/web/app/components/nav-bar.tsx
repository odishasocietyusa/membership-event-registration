import Link from 'next/link'
import type { MemberRow } from '@/lib/auth/with-auth'

interface NavBarProps {
  user: MemberRow | null
}

export default function NavBar({ user }: NavBarProps) {
  const isAuthed   = user !== null && user.memberStatus !== 'suspended'
  const isOsaDomain = isAuthed && (user?.email?.endsWith('@odishasociety.org') ?? false)
  const isAdmin    = isAuthed && user?.role === 'admin'
  const displayName = user?.fullName ?? user?.email ?? null

  return (
    <nav>
      <strong><Link href="/">OSA Community Platform</Link></strong>
      <hr />
      <ul>
        <li><Link href="/">Home</Link></li>

        <li>
          <details>
            <summary>About Us</summary>
            <ul>
              <li><Link href="/about/vision-mission">Vision &amp; Mission</Link></li>
              <li><Link href="/constitution">Constitution &amp; Bylaws</Link></li>
              <li><Link href="/about/member-rights">Member Rights &amp; Privileges</Link></li>
              <li><Link href="/about/administration">OSA Administration</Link></li>
              <li><Link href="/about/committees">OSA Committees</Link></li>
              <li><Link href="/leadership-program">Past Leadership</Link></li>
              <li><Link href="/about/contact">Contact Us</Link></li>
            </ul>
          </details>
        </li>

        <li>
          <details>
            <summary>Members</summary>
            <ul>
              <li><Link href="/members/benefits">Member Benefits</Link></li>
              {isAuthed && (
                <>
                  <li><Link href="/members/policy">Policy Documents &amp; Forms</Link></li>
                  <li><Link href="/dashboard">Member Dashboard</Link></li>
                  <li><Link href="/profile">My Profile</Link></li>
                  <li><Link href="/members/search">Member Search</Link></li>
                  <li><Link href="/members/bog-minutes">BOG Meeting Minutes</Link></li>
                  <li><Link href="/obituary">Obituary</Link></li>
                </>
              )}
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
            <summary>Activities</summary>
            <ul>
              {isAuthed && (
                <li><Link href="/events">Events</Link></li>
              )}
              <li><Link href="/activities/convention">Annual Convention</Link></li>
              <li><Link href="/activities/awards">Awards</Link></li>
              <li><Link href="/activities/odia-learning">Odia Learning</Link></li>
              <li><Link href="/activities/odissi-music">Odissi Music</Link></li>
              <li><Link href="/activities/odisha-development">Odisha Development</Link></li>
              <li><Link href="/activities/library">OSA Public Library</Link></li>
              <li><Link href="/activities/higher-education">OSA Higher Education</Link></li>
              <li><Link href="/activities/networking">Professional Networking</Link></li>
              <li><Link href="/activities/health-wellness">Health &amp; Wellness</Link></li>
              <li><Link href="/activities/drama-festival">Drama Festival</Link></li>
              <li><Link href="/activities/sampark-dori">Sampark Dori</Link></li>
              <li><Link href="/activities/nilachakra">Nilachakra (Kids)</Link></li>
              <li><Link href="/activities/womens-forum">Women&apos;s Forum</Link></li>
              <li><Link href="/activities/classified">Classified</Link></li>
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
      </ul>

      <hr />

      <span>
        {isAdmin && (
          <><Link href="/admin">Admin Panel</Link>{' | '}</>
        )}
        <Link href="/donate">Donate</Link>
        {' | '}
        {isAuthed ? (
          <>
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
