import type { Member, FamilyMember, PaymentRecord, Message } from '@prisma/client'

// ── Shared result types ───────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface MemberExport {
  exportDate: string
  member: Member
  familyMembers: FamilyMember[]
  paymentRecords: PaymentRecord[]
  sentMessages: Message[]
  receivedMessages: Message[]
}

// ── Input types (mirrors Zod schemas in member.schema.ts) ────────────────────

export interface UpdateMemberInput {
  fullName?: string
  phone?: string
  address?: {
    street?: string
    city?: string
    state?: string
    zip?: string
    country?: string
  }
  profileVisibility?: {
    show_phone: boolean
    show_email: boolean
    show_chapter: boolean
  }
  souvenirPreference?: 'electronic' | 'print'
  bio?: string
  spouseName?: string
}

export interface AdminUpdateMemberInput extends UpdateMemberInput {
  memberStatus?: 'active' | 'expired' | 'suspended'
  role?: 'member' | 'admin'
  membershipType?: string | null
  joinDate?: string | null
  expiryDate?: string | null
  chapterId?: string | null
}

export interface CreateFamilyMemberInput {
  fullName: string
  relation: 'spouse' | 'child' | 'other'
  dateOfBirth?: string
  highSchoolGraduationYear?: number
  email?: string
}

export interface UpdateFamilyMemberInput {
  fullName?: string
  dateOfBirth?: string | null
  highSchoolGraduationYear?: number | null
  email?: string
}

export interface CreateChapterInput {
  id: string
  displayName: string
  states: string[]
}

export interface MemberSearchInput {
  firstName?: string
  lastName?:  string
  city?:      string
  state?:     string
  country?:   string
  page:       number
}

// ── Re-exports ───────────────────────────────────────────────────────────────

export * from './services/member-crud'
export * from './services/member-family'
export * from './services/member-chapters'
export * from './services/member-search'
