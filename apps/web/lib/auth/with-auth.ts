import type { Member } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { getSupabaseAdmin } from '@/lib/auth/supabase-admin'
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
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return jsonResponse(401, { error: 'Missing or invalid Authorization header' })
    }

    // Validate with Supabase — never decode JWT locally
    const {
      data: { user: authUser },
      error,
    } = await getSupabaseAdmin().auth.getUser(token)

    if (error || !authUser || !authUser.email) {
      return jsonResponse(401, { error: 'Invalid or expired token' })
    }

    // JIT sync: read-first, write only when needed.
    // Lookup order: userId first (stable identity), email fallback (admin-pre-created rows).
    // Four cases:
    //   1. Found by userId                                   → proceed (no write)
    //   2. Not found by userId, found by email, userId null  → bind userId (admin-pre-created)
    //   3. Not found by userId, found by email, userId set   → proceed (edge case; no write)
    //   4. Not found by either                               → JIT create
    let member = await prisma.member.findUnique({ where: { userId: authUser.id } })

    if (!member) {
      // Try email fallback — handles admin-pre-created rows where userId is null
      member = await prisma.member.findUnique({ where: { email: authUser.email } })

      if (member && !member.userId) {
        // Admin pre-created this row before the user ever logged in — bind their auth ID now
        member = await prisma.member.update({
          where: { id: member.id },
          data: { userId: authUser.id },
        })
      } else if (!member) {
        // Brand-new user — JIT create
        // Capture whatever Google provides at signup — name is available from OAuth metadata.
        // City, state, phone, preferences are filled in manually on the registration page.
        const meta = authUser.user_metadata ?? {}
        const fullName: string | null =
          meta.full_name ??
          (meta.given_name && meta.family_name ? `${meta.given_name} ${meta.family_name}` : null) ??
          null
        try {
          member = await prisma.member.create({
            data: { email: authUser.email, userId: authUser.id, role: 'member', fullName },
          })
        } catch {
          member = await prisma.member.findUnique({ where: { email: authUser.email } })
          if (!member) return jsonResponse(500, { error: 'Failed to initialise member record' })
        }
      }
    }

    if (member.deletedAt !== null) {
      return jsonResponse(401, { error: 'Account has been deactivated' })
    }

    if (options?.role !== undefined) {
      const userLevel = ROLE_HIERARCHY[member.role as Role]
      const requiredLevel = ROLE_HIERARCHY[options.role]
      if (userLevel < requiredLevel) {
        return jsonResponse(403, { error: 'Insufficient permissions' })
      }
    }

    return handler(req, { user: member })
  }
}
