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
      <strong><a href="/">OSA Community Platform</a></strong>
      <hr />
      <ul>
        <li><a href="/">Home</a></li>

        <li>
          <details>
            <summary>About Us</summary>
            <ul>
              <li><a href="/about/vision-mission">Vision &amp; Mission</a></li>
              <li><a href="/constitution">Constitution &amp; Bylaws</a></li>
              <li><a href="/about/member-rights">Member Rights &amp; Privileges</a></li>
              <li><a href="/about/administration">OSA Administration</a></li>
              <li><a href="/about/committees">OSA Committees</a></li>
              <li><a href="/leadership-program">Past Leadership</a></li>
              <li><a href="/about/contact">Contact Us</a></li>
            </ul>
          </details>
        </li>

        <li>
          <details>
            <summary>Members</summary>
            <ul>
              <li><a href="/members/benefits">Member Benefits</a></li>
              {isAuthed && (
                <>
                  <li><a href="/members/policy">Policy Documents &amp; Forms</a></li>
                  <li><a href="/dashboard">Member Dashboard</a></li>
                  <li><a href="/members/search">Member Search</a></li>
                  <li><a href="/members/bog-minutes">BOG Meeting Minutes</a></li>
                  <li><a href="/obituary">Obituary</a></li>
                </>
              )}
            </ul>
          </details>
        </li>

        <li>
          <details>
            <summary>Chapters</summary>
            <ul>
              <li><a href="/chapters">Chapter Details</a></li>
              {isAuthed && (
                <li><a href="/chapters/executives">Chapter Executives</a></li>
              )}
              {isOsaDomain && (
                <li><a href="/chapters/bog-documents">BOG Documents</a></li>
              )}
            </ul>
          </details>
        </li>

        <li>
          <details>
            <summary>Activities</summary>
            <ul>
              {isAuthed && (
                <li><a href="/events">Events</a></li>
              )}
              <li><a href="/activities/convention">Annual Convention</a></li>
              <li><a href="/activities/awards">Awards</a></li>
              <li><a href="/activities/odia-learning">Odia Learning</a></li>
              <li><a href="/activities/odissi-music">Odissi Music</a></li>
              <li><a href="/activities/odisha-development">Odisha Development</a></li>
              <li><a href="/activities/library">OSA Public Library</a></li>
              <li><a href="/activities/higher-education">OSA Higher Education</a></li>
              <li><a href="/activities/networking">Professional Networking</a></li>
              <li><a href="/activities/health-wellness">Health &amp; Wellness</a></li>
              <li><a href="/activities/drama-festival">Drama Festival</a></li>
              <li><a href="/activities/sampark-dori">Sampark Dori</a></li>
              <li><a href="/activities/nilachakra">Nilachakra (Kids)</a></li>
              <li><a href="/activities/womens-forum">Women&apos;s Forum</a></li>
              <li><a href="/activities/classified">Classified</a></li>
            </ul>
          </details>
        </li>

        <li>
          <details>
            <summary>Publications</summary>
            <ul>
              <li><a href="/publications/urmi">Urmi — Souvenir</a></li>
              <li><a href="/publications/utkarsa">Utkarsa — Newsletter</a></li>
              <li><a href="/news">News</a></li>
              <li><a href="/announcements">Announcements</a></li>
              <li><a href="/gallery">Gallery</a></li>
            </ul>
          </details>
        </li>
      </ul>

      <hr />

      <span>
        {isAdmin && (
          <><a href="/admin">Admin Panel</a>{' | '}</>
        )}
        <a href="/donate">Donate</a>
        {' | '}
        {isAuthed ? (
          <>
            <span>{displayName}</span>
            {' | '}
            <form method="POST" action="/api/auth/signout">
              <button type="submit">Sign Out</button>
            </form>
          </>
        ) : (
          <>
            <a href="/login">Sign In</a>
            {' | '}
            <a href="/register">Register</a>
          </>
        )}
      </span>
      <hr />
    </nav>
  )
}
