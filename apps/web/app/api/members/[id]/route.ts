import { withAuth } from '@/lib/auth/with-auth'
import { getMemberById, updateMember, softDeleteMember, listFamilyMembers } from '@/lib/members/member-service'
import { AdminUpdateMemberSchema } from '@/lib/validation/member.schema'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function serviceErrorToResponse(err: unknown): Response {
  const code = (err as { code?: string }).code
  if (code === 'NOT_FOUND') return jsonResponse(404, { error: 'Not found' })
  if (code === 'CONFLICT') return jsonResponse(409, { error: 'Conflict' })
  if (code === 'FORBIDDEN') return jsonResponse(403, { error: 'Forbidden' })
  console.error(err)
  return jsonResponse(500, { error: 'Internal server error' })
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  return withAuth(async () => {
    const member = await getMemberById(id, { includeDeleted: true })
    if (!member) {
      return jsonResponse(404, { error: 'Member not found' })
    }

    const familyMembers = await listFamilyMembers(id)
    return jsonResponse(200, { member, familyMembers })
  }, { role: 'admin' })(req)
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  return withAuth(async (request) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' })
    }

    const parsed = AdminUpdateMemberSchema.safeParse(body)
    if (!parsed.success) {
      return jsonResponse(400, { error: parsed.error.flatten() })
    }

    try {
      const updated = await updateMember(id, parsed.data)
      return jsonResponse(200, { member: updated })
    } catch (err) {
      return serviceErrorToResponse(err)
    }
  }, { role: 'admin' })(req)
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params
  return withAuth(async () => {
    try {
      await softDeleteMember(id)
      return jsonResponse(200, { success: true })
    } catch (err) {
      return serviceErrorToResponse(err)
    }
  }, { role: 'admin' })(req)
}
