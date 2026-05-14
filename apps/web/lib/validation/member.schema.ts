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
  chapterId:          z.string().nullable().optional(), // null clears the chapter
})
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>

// ── Admin member update (PUT /api/members/:id) ────────────────────────────────
// Extends the member-self schema with admin-only fields

export const AdminUpdateMemberSchema = UpdateMemberSchema.extend({
  memberStatus: z.enum(['active', 'suspended']).optional(),
  role:         z.enum(['member', 'admin']).optional(),
})
export type AdminUpdateMemberInput = z.infer<typeof AdminUpdateMemberSchema>

// ── Family member create (POST /api/members/me/family) ────────────────────────

export const CreateFamilyMemberSchema = z.object({
  fullName:                 z.string().min(1).max(200),
  relation:                 z.enum(['spouse', 'child', 'other']),
  dateOfBirth:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), // YYYY-MM-DD
  highSchoolGraduationYear: z.number().int().min(1900).max(new Date().getFullYear() + 6).optional(),
})
export type CreateFamilyMemberInput = z.infer<typeof CreateFamilyMemberSchema>

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
})
export type ListMembersQuery = z.infer<typeof ListMembersQuerySchema>
