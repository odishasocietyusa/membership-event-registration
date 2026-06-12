import Link from 'next/link'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav>
        <strong>Admin</strong>
        {' | '}
        <Link href="/admin">Members</Link>
        {' | '}
        <Link href="/admin/payments">Payments</Link>
        {' | '}
        <Link href="/admin/events">Events</Link>
        {' | '}
        <Link href="/dashboard">My Dashboard</Link>
      </nav>
      <hr />
      {children}
    </div>
  )
}
