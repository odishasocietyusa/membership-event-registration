import { z } from 'zod'

export const MembershipTypeSchema = z.enum([
  'annualStudentNoVote',
  'annualSingle',
  'annualFamily',
  'fiveYearFamily',
  'life',
  'lifeWard',
  'patron',
  'benefactor',
  'honoraryNoVote',
])

export const MemberStatusSchema = z.enum(['active', 'expired', 'suspended'])

// POST /api/memberships
export const ApplyMembershipSchema = z.object({
  membershipType: MembershipTypeSchema,
})

// POST /api/memberships/:id/approve
export const ApproveMembershipSchema = z.object({
  note: z.string().max(500).optional(),
})

// POST /api/memberships/:id/reject
export const RejectMembershipSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(500),
})

// PUT /api/memberships/:id/status
export const OverrideStatusSchema = z.object({
  status: MemberStatusSchema,
  note:   z.string().max(500).optional(),
})

// POST /api/memberships/honorary/assign
export const AssignHonorarySchema = z.object({
  memberId: z.string().uuid('memberId must be a valid UUID'),
  note:     z.string().max(500).optional(),
})

// PUT /api/members/:id/role
export const UpdateRoleSchema = z.object({
  role: z.enum(['member', 'admin']),
})

// GET /api/memberships (admin query params)
export const ListMembershipsQuerySchema = z.object({
  page:           z.coerce.number().int().min(1).default(1),
  limit:          z.coerce.number().int().min(1).max(100).default(20),
  memberStatus:   MemberStatusSchema.optional(),
  membershipType: MembershipTypeSchema.optional(),
})
