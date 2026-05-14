import { notFound } from 'next/navigation'

const LINKS = [
  {
    label: 'Register (new member)',
    href: '/register',
    description: 'New member signup flow',
    available: true,
  },
  {
    label: 'Login (existing member)',
    href: '/login',
    description: 'Sign in with Google or email/password',
    available: true,
  },
  {
    label: 'Dashboard (post-login)',
    href: '/dashboard',
    description: 'Member dashboard after authentication',
    available: true,
  },
  {
    label: 'Payment / Membership Checkout',
    href: '/membership',
    description: 'Select membership tier and pay via Stripe',
    available: true,
  },
  {
    label: 'Sanity Studio (CMS)',
    href: '/studio',
    description: 'Content authoring — events, news, announcements',
    available: true,
  },
  {
    label: 'Events (CMS-driven)',
    href: '/events',
    description: 'Live event listing fetched from Sanity via ISR',
    available: true,
  },
  {
    label: 'News (CMS-driven)',
    href: '/news',
    description: 'News posts from Sanity',
    available: true,
  },
  {
    label: 'About Us (CMS-driven)',
    href: '/about',
    description: 'OSA history, mission, and structure from Sanity static_page',
    available: true,
  },
  {
    label: 'Constitution (static MDX)',
    href: '/constitution',
    description: 'OSA Constitution — rendered from Git-versioned MDX',
    available: true,
  },
  {
    label: 'Bylaws (static MDX)',
    href: '/bylaws',
    description: 'OSA Bylaws — rendered from Git-versioned MDX',
    available: true,
  },
]

export default function DemoPage() {
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }

  return (
    <main>
      <h1>Developer Demo Page</h1>
      <p>Not for production. Links to all available and planned routes for testing.</p>

      <ul>
        {LINKS.map(({ label, href, description, available }) => (
          <li key={href}>
            {available ? (
              <a href={href}>{label}</a>
            ) : (
              <span>{label} (not built yet)</span>
            )}
            {' — '}
            {description}
          </li>
        ))}
      </ul>
    </main>
  )
}
