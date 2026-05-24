import { z } from 'zod'

// ── Shared sub-schemas ────────────────────────────────────────────────────────

const AddressSchema = z.object({
  street:  z.string().optional(),
  city:    z.string().optional(),
  state:   z.string().optional(),
  zip:     z.string().optional(),
  country: z.string().optional(),
})

const ProfileVisibilitySchema = z.object({
  show_phone:   z.boolean(),
  show_email:   z.boolean(),
  show_chapter: z.boolean(),
})

// ── Member update (member-self PUT /api/members/me) ───────────────────────────

export const UpdateMemberSchema = z.object({
  fullName:           z.string().min(1).max(200).optional(),
  phone:              z.string().max(30).optional(),
  address:            AddressSchema.optional(),
  profileVisibility:  ProfileVisibilitySchema.optional(),
  souvenirPreference: z.enum(['electronic', 'print']).optional(),
  bio:                z.string().max(1000).optional(),
  spouseName:         z.string().max(200).optional(),
  // chapterId intentionally absent — server derives it from address; never accepted from client
})
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>

// ── Admin member update (PUT /api/members/:id) ────────────────────────────────
// Extends the member-self schema with admin-only fields

export const AdminUpdateMemberSchema = UpdateMemberSchema.extend({
  memberStatus:   z.enum(['active', 'expired', 'suspended']).optional(),
  role:           z.enum(['member', 'admin']).optional(),
  membershipType: z.enum([
    'annualStudentNoVote', 'annualSingle', 'annualFamily',
    'fiveYearFamily', 'life', 'lifeWard', 'patron', 'benefactor', 'honoraryNoVote',
  ]).nullable().optional(),
  joinDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  chapterId:  z.string().nullable().optional(), // admin-only manual chapter override
})
export type AdminUpdateMemberInput = z.infer<typeof AdminUpdateMemberSchema>

// ── Family member create (POST /api/members/me/family) ────────────────────────

export const CreateFamilyMemberSchema = z.object({
  fullName:                 z.string().min(1).max(200),
  relation:                 z.enum(['spouse', 'child', 'other']),
  dateOfBirth:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
  highSchoolGraduationYear: z.number().int().min(1900).max(new Date().getFullYear() + 6).optional(),
  email:                    z.string().email().optional(),
})
export type CreateFamilyMemberInput = z.infer<typeof CreateFamilyMemberSchema>

// ── Family member update (PUT /api/members/me/family/:id) ─────────────────────

export const UpdateFamilyMemberSchema = z.object({
  fullName:                 z.string().min(1).max(200).optional(),
  dateOfBirth:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  highSchoolGraduationYear: z.number().int().min(1900).max(new Date().getFullYear() + 6).nullable().optional(),
  email:                    z.string().email().optional(),
  // relation intentionally excluded — not editable after creation
})
export type UpdateFamilyMemberInput = z.infer<typeof UpdateFamilyMemberSchema>

// ── Admin link-member (POST /api/admin/link-member) ───────────────────────────

export const LinkMemberSchema = z.object({
  email:  z.string().email(),
  userId: z.string().uuid(),
})
export type LinkMemberInput = z.infer<typeof LinkMemberSchema>

// ── Chapter create (POST /api/chapters) ──────────────────────────────────────

export const CreateChapterSchema = z.object({
  id:          z.string().min(2).max(50).regex(/^[a-z0-9-]+$/), // slug format only
  displayName: z.string().min(2).max(200),
  states:      z.array(z.string()).min(1),
})
export type CreateChapterSchemaInput = z.infer<typeof CreateChapterSchema>

// ── Chapter update (PUT /api/chapters/:id) ────────────────────────────────────

export const UpdateChapterSchema = CreateChapterSchema
  .omit({ id: true })
  .partial()
  .refine(
    (data) => Object.keys(data).length > 0,
    { message: 'At least one field must be provided' }
  )

// ── Admin list members query params (GET /api/members) ────────────────────────

export const ListMembersQuerySchema = z.object({
  page:           z.coerce.number().int().min(1).default(1),
  limit:          z.coerce.number().int().min(1).max(100).default(20),
  includeDeleted: z.coerce.boolean().default(false),
  search:         z.string().max(200).optional(),
  status:         z.enum(['active', 'expired', 'suspended']).optional(),
})
export type ListMembersQuery = z.infer<typeof ListMembersQuerySchema>

// ── Registration profile upsert (POST /api/users/me/profile) ──────────────────

export const ChildInputSchema = z.object({
  name:                     z.string().min(1).max(200),
  highSchoolGraduationYear: z.number().int().min(new Date().getFullYear() - 6).max(new Date().getFullYear() + 18).optional(),
  gender:                   z.enum(['M', 'F', 'Other']),
})

export const CreateProfileSchema = z.object({
  firstName:  z.string().min(1, 'First name is required').max(100),
  lastName:   z.string().min(1, 'Last name is required').max(100),
  phone:      z.string().max(30).optional(),
  bio:        z.string().max(1000).optional(),
  spouseName: z.string().max(200).optional(),
  children:   z.array(ChildInputSchema).max(10).default([]),
  address: z.object({
    street:  z.string().optional(),
    city:    z.string().optional(),
    state:   z.string().optional(),
    zip:     z.string().optional(),
    country: z.string().optional(),
  }).optional(),
})
export type CreateProfileInput = z.infer<typeof CreateProfileSchema>

// ── Member search query (GET /api/members/search) ─────────────────────────────

export const MemberSearchQuerySchema = z.object({
  firstName: z.string().min(3, 'Minimum 3 characters').max(100).optional(),
  lastName:  z.string().min(3, 'Minimum 3 characters').max(100).optional(),
  city:      z.string().min(3, 'Minimum 3 characters').max(100).optional(),
  state:     z.string().max(10).optional(),
  country:   z.enum(['USA', 'Canada']).optional(),
  page:      z.coerce.number().int().min(1).default(1),
}).refine(
  ({ firstName, lastName, city, state }) =>
    !!(firstName || lastName || city || state),
  { message: 'At least one of first name, last name, city, or state must be provided' }
)
export type MemberSearchQuery = z.infer<typeof MemberSearchQuerySchema>

// ── Member search result DTO ──────────────────────────────────────────────────

export const MemberSearchResultSchema = z.object({
  memberId:       z.string(),
  firstName:      z.string().nullable(),
  lastName:       z.string().nullable(),
  city:           z.string().nullable(),
  state:          z.string().nullable(),
  chapterId:      z.string().nullable(),
  memberSince:    z.string().nullable(),
  membershipType: z.string().nullable(),
  memberStatus:   z.string().nullable(),
})
export type MemberSearchResult = z.infer<typeof MemberSearchResultSchema>

// ── Member search response ────────────────────────────────────────────────────

export const MemberSearchResponseSchema = z.object({
  results:   z.array(MemberSearchResultSchema),
  total:     z.number(),
  page:      z.number(),
  pageSize:  z.number(),
  truncated: z.boolean(),
})
export type MemberSearchResponse = z.infer<typeof MemberSearchResponseSchema>

// ── Send member message (POST /api/members/message) ───────────────────────────

export const SendMemberMessageSchema = z.object({
  toMemberId: z.string().uuid(),
  message:    z.string().min(1, 'Message cannot be empty').max(1000, 'Maximum 1 000 characters'),
})
export type SendMemberMessageInput = z.infer<typeof SendMemberMessageSchema>

// ── Primary member email change (PUT /api/members/me/email) ──────────────────

export const ChangeEmailSchema = z.object({
  newEmail: z.string().email('Must be a valid email address').max(254),
})
export type ChangeEmailInput = z.infer<typeof ChangeEmailSchema>
