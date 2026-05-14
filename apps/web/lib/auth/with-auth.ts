// lib/auth/with-auth.ts
// Higher-order function that wraps a Next.js App Router API route handler with:
//   1. Bearer token extraction
//   2. Supabase token validation (authoritative — no local JWT decode)
//   3. JIT sync — upsert members row on first login
//   4. Soft-delete check
//   5. Role-level enforcement
//   6. Delegate to the wrapped handler

import type { Member } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { supabaseAdmin } from '@/lib/auth/supabase-admin'
import { ROLE_HIERARCHY, type Role } from '@/lib/auth/roles'

// Re-exported alias so downstream code only imports from this module
export type MemberRow = Member

export type AuthHandler = (
  req: Request,
  ctx: { user: MemberRow }
) => Promise<Response>

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function withAuth(
  handler: AuthHandler,
  options?: { role?: Role }
): (req: Request) => Promise<Response> {
  return async function routeHandler(req: Request): Promise<Response> {
    // Step 1: Extract Bearer token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse(401, { error: 'Missing or invalid Authorization header' })
    }

    const token = authHeader.split(' ')[1]
    if (!token) {
      return jsonResponse(401, { error: 'Missing or invalid Authorization header' })
    }

    // Step 2: Validate token with Supabase (authoritative — never decode locally)
    const {
      data: { user: authUser },
      error,
    } = await supabaseAdmin.auth.getUser(token)

    if (error || !authUser || !authUser.email) {
      return jsonResponse(401, { error: 'Invalid or expired token' })
    }

    // Step 3: JIT sync — upsert members row (atomic INSERT ... ON CONFLICT DO UPDATE)
    const member = await prisma.member.upsert({
      where: { email: authUser.email },
      create: {
        email: authUser.email,
        userId: authUser.id,
        role: 'member',
      },
      update: {
        // Only update userId — never overwrite profile data set by admins
        userId: authUser.id,
      },
    })

    // Step 4: Soft-delete check
    if (member.deletedAt !== null) {
      return jsonResponse(401, { error: 'Account has been deactivated' })
    }

    // Step 5: Role check (only when options.role is specified)
    if (options?.role !== undefined) {
      const userLevel = ROLE_HIERARCHY[member.role as Role]
      const requiredLevel = ROLE_HIERARCHY[options.role]
      if (userLevel < requiredLevel) {
        return jsonResponse(403, { error: 'Insufficient permissions' })
      }
    }

    // Step 6: Delegate to wrapped handler
    return handler(req, { user: member })
  }
}
