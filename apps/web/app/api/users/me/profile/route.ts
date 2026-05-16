import { withAuth } from '@/lib/auth/with-auth'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { CreateProfileSchema } from '@/lib/validation/member.schema'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST = withAuth(async (req, { user }) => {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' })
  }

  const parsed = CreateProfileSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(400, { error: parsed.error.flatten() })
  }

  const { firstName, lastName, phone, bio, spouseName, children, address } = parsed.data

  const fullName = `${firstName.trim()} ${lastName.trim()}`
  const profileData: Record<string, unknown> = {}
  if (bio !== undefined) profileData.bio = bio
  if (spouseName !== undefined) profileData.spouseName = spouseName
  if (children.length > 0) profileData.children = children

  const updated = await prisma.$transaction(async (tx) => {
    const member = await tx.member.update({
      where: { id: user.id },
      data: {
        fullName,
        phone: phone ?? null,
        address: address ?? undefined,
        profileData: Object.keys(profileData).length > 0
          ? (profileData as Prisma.InputJsonValue)
          : undefined,
      },
    })

    if (spouseName) {
      const existingSpouse = await tx.familyMember.findFirst({
        where: { primaryMemberId: user.id, relation: 'spouse', deletedAt: null },
      })
      if (existingSpouse) {
        await tx.familyMember.update({
          where: { id: existingSpouse.id },
          data: { fullName: spouseName },
        })
      } else {
        await tx.familyMember.create({
          data: { primaryMemberId: user.id, fullName: spouseName, relation: 'spouse' },
        })
      }
    }

    for (const child of children) {
      await tx.familyMember.create({
        data: {
          primaryMemberId: user.id,
          fullName: child.name,
          relation: 'child',
          highSchoolGraduationYear: child.highSchoolGraduationYear ?? null,
        },
      })
    }

    return member
  })

  return jsonResponse(200, { member: updated })
})
