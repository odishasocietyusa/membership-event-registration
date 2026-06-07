import { prisma } from '@/lib/db/prisma'
import type { RegisterProviderInput, UpdateProviderInput } from '@/lib/validation/service-provider.schema'

// email is intentionally excluded from this type — never sent to client
export type ProviderPublic = {
  id: string
  memberId: string
  fullName: string
  displayName: string | null
  bio: string
  specializations: string[]
  onlineClasses: boolean
  phone: string | null
  websiteUrl: string | null
  photoUrl: string | null
  status: 'pending' | 'active' | 'inactive'
  isOsaMember: boolean
  createdAt: Date
  updatedAt: Date
}

const PUBLIC_SELECT = {
  id: true,
  memberId: true,
  fullName: true,
  displayName: true,
  bio: true,
  specializations: true,
  onlineClasses: true,
  phone: true,
  websiteUrl: true,
  photoUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  member: { select: { memberStatus: true } },
} as const

function toPublic(row: {
  id: string
  memberId: string
  fullName: string
  displayName: string | null
  bio: string
  specializations: string[]
  onlineClasses: boolean
  phone: string | null
  websiteUrl: string | null
  photoUrl: string | null
  status: string
  createdAt: Date
  updatedAt: Date
  member: { memberStatus: string | null }
}): ProviderPublic {
  return {
    id: row.id,
    memberId: row.memberId,
    fullName: row.fullName,
    displayName: row.displayName,
    bio: row.bio,
    specializations: row.specializations,
    onlineClasses: row.onlineClasses,
    phone: row.phone,
    websiteUrl: row.websiteUrl,
    photoUrl: row.photoUrl,
    status: row.status as 'pending' | 'active' | 'inactive',
    isOsaMember: row.member.memberStatus === 'active',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listProviders(filters: {
  specialization?: string
  onlineOnly?: boolean
  includeAll?: boolean   // admin only — returns pending + inactive too
}): Promise<ProviderPublic[]> {
  const rows = await prisma.serviceProvider.findMany({
    where: {
      ...(filters.includeAll ? {} : { status: 'active' }),
      ...(filters.onlineOnly ? { onlineClasses: true } : {}),
      ...(filters.specialization
        ? { specializations: { has: filters.specialization } }
        : {}),
    },
    select: PUBLIC_SELECT,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toPublic)
}

export async function getProviderById(id: string): Promise<ProviderPublic | null> {
  const row = await prisma.serviceProvider.findUnique({
    where: { id },
    select: PUBLIC_SELECT,
  })
  return row ? toPublic(row) : null
}

export async function getProviderByMemberId(memberId: string): Promise<ProviderPublic | null> {
  const row = await prisma.serviceProvider.findUnique({
    where: { memberId },
    select: PUBLIC_SELECT,
  })
  return row ? toPublic(row) : null
}

// Internal only — used by contact route to resolve Resend recipient
export async function getProviderEmail(id: string): Promise<string | null> {
  const row = await prisma.serviceProvider.findUnique({
    where: { id },
    select: { email: true },
  })
  return row?.email ?? null
}

export async function createProvider(
  memberId: string,
  email: string,
  fullName: string,
  data: RegisterProviderInput
): Promise<ProviderPublic> {
  const row = await prisma.serviceProvider.create({
    data: {
      memberId,
      email,
      fullName,
      displayName: data.displayName || null,
      bio: data.bio,
      specializations: data.specializations,
      onlineClasses: data.onlineClasses,
      phone: data.phone ?? null,
      websiteUrl: data.websiteUrl || null,
      photoUrl: data.photoUrl || null,
      status: 'pending',   // always starts pending — requires admin approval
    },
    select: PUBLIC_SELECT,
  })
  return toPublic(row)
}

export async function updateProvider(
  id: string,
  data: UpdateProviderInput
): Promise<ProviderPublic> {
  const row = await prisma.serviceProvider.update({
    where: { id },
    data: {
      ...(data.displayName !== undefined ? { displayName: data.displayName || null } : {}),
      ...(data.bio !== undefined ? { bio: data.bio } : {}),
      ...(data.specializations !== undefined ? { specializations: data.specializations } : {}),
      ...(data.onlineClasses !== undefined ? { onlineClasses: data.onlineClasses } : {}),
      ...(data.phone !== undefined ? { phone: data.phone ?? null } : {}),
      ...(data.websiteUrl !== undefined ? { websiteUrl: data.websiteUrl || null } : {}),
      ...(data.photoUrl !== undefined ? { photoUrl: data.photoUrl || null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
    select: PUBLIC_SELECT,
  })
  return toPublic(row)
}

export async function deleteProvider(id: string): Promise<void> {
  await prisma.serviceProvider.delete({ where: { id } })
}

export async function countRecentContacts(
  senderMemberId: string,
  serviceProviderId: string
): Promise<number> {
  return prisma.serviceContactLog.count({
    where: {
      senderMemberId,
      sentAt: { gte: new Date(Date.now() - 3_600_000) },
    },
  })
}

export async function logContact(
  serviceProviderId: string,
  senderMemberId: string,
  subject: string,
  body: string
): Promise<void> {
  await prisma.serviceContactLog.create({
    data: { serviceProviderId, senderMemberId, subject, body },
  })
}
