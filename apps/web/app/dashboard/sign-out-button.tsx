'use client'

export default function SignOutButton() {
  return (
    <form method="POST" action="/api/auth/signout">
      <button type="submit">Sign out</button>
    </form>
  )
}
