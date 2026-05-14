// app/api/auth/me/route.ts
// Canonical health-check endpoint — returns the authenticated member's record.
// Demonstrates withAuth() at its simplest (no role restriction).

import { withAuth } from '@/lib/auth/with-auth'

export const GET = withAuth(async (_req, { user }) => {
  return new Response(JSON.stringify({ user }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
