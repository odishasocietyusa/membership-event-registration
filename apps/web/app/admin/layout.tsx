export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav>
        <strong>Admin</strong>
        {' | '}
        <a href="/admin">Members</a>
        {' | '}
        <a href="/admin/payments">Payments</a>
        {' | '}
        <a href="/dashboard">My Dashboard</a>
      </nav>
      <hr />
      {children}
    </div>
  )
}
