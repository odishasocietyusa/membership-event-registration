// lib/auth/roles.ts
// Defines the Role type and ROLE_HIERARCHY constant used by withAuth() and
// future role-check helpers. Zero runtime dependencies.

export type Role = 'member' | 'admin'

export const ROLE_HIERARCHY: Record<Role, number> = {
  member: 1,
  admin: 2,
}
