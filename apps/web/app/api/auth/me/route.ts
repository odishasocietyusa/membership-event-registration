import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/auth/with-auth'

export const GET = withAuth(async (_req, { user }) => {
  return NextResponse.json({ user })
})
