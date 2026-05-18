# Phase 2 Design — SPEC-18: Member Profile Edit

> **Spec:** `specs/active/SPEC-18-profile-edit.md`
> **Analysis:** `specs/artifacts/SPEC-18/01-analysis.md`
> **Status:** Complete
> **Date:** 2026-05-18

---

## 1. Build Sequence

1. `apps/web/lib/auth/with-auth.ts` — prerequisite; every authenticated route depends on it; fix is independent of all other changes
2. `apps/web/lib/validation/member.schema.ts` — schema changes gate the service interfaces and route handlers
3. `apps/web/prisma/schema.prisma` + migration — DB column must exist before Prisma client is regenerated; regenerated client must exist before service code compiles
4. `apps/web/lib/members/member-service.ts` — business logic depends on updated interfaces, updated schema, and regenerated Prisma client
5. `apps/web/app/api/members/me/family/[id]/route.ts` — new PUT handler depends on `updateFamilyMember()` created in step 4
6. `apps/web/app/components/nav-bar.tsx` — UI change; no dependency on other steps; ordered before new pages for clean history
7. `apps/web/app/profile/page.tsx` + `apps/web/app/profile/ProfileClient.tsx` — new files; depend on all prior steps
8. `apps/web/app/dashboard/page.tsx` — one-line addition; cleanest after profile page exists
9. `apps/web/app/register/page.tsx` — minimal spouse email addition in Step 3; independent of profile page

---

## 2. Exact Code Changes — File by File

### 2.1 `apps/web/lib/auth/with-auth.ts`

**Why:** Line 45 does an email-only lookup. `userId` is the stable identity anchor from Supabase. The new sequence tries `userId` first, then falls back to email for admin-pre-created rows (where `userId` is null). All logic after the lookup block (deleted check, role check) is unchanged.

**Before (lines 42–68):**
```typescript
    // JIT sync: read-first, write only when needed.
    // Three cases: new user (create), admin-pre-created row with no userId (update), existing (no write).
    // try/catch on create handles the rare race where two concurrent first-logins both see null.
    let member = await prisma.member.findUnique({ where: { email: authUser.email } })
    if (!member) {
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
    } else if (!member.userId) {
      // Admin pre-created this row before the user ever logged in — bind their auth ID now
      member = await prisma.member.update({
        where: { id: member.id },
        data: { userId: authUser.id },
      })
    }
```

**After (replace the entire block above):**
```typescript
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
```

---

### 2.2 `apps/web/lib/validation/member.schema.ts`

Four changes to this file. Show only the changed blocks; all other schemas are untouched.

**Change A — Replace `UpdateMemberSchema` (lines 21–29).**

Before:
```typescript
export const UpdateMemberSchema = z.object({
  fullName:           z.string().min(1).max(200).optional(),
  phone:              z.string().max(30).optional(),
  address:            AddressSchema.optional(),
  profileVisibility:  ProfileVisibilitySchema.optional(),
  souvenirPreference: z.enum(['electronic', 'print']).optional(),
  chapterId:          z.string().nullable().optional(), // null clears the chapter
})
export type UpdateMemberInput = z.infer<typeof UpdateMemberSchema>
```

After:
```typescript
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
```

**Change B — Add `chapterId` back to `AdminUpdateMemberSchema` (lines 34–44).**

Before:
```typescript
export const AdminUpdateMemberSchema = UpdateMemberSchema.extend({
  memberStatus:   z.enum(['active', 'expired', 'suspended']).optional(),
  role:           z.enum(['member', 'admin']).optional(),
  membershipType: z.enum([
    'annualStudentNoVote', 'annualSingle', 'annualFamily',
    'fiveYearFamily', 'life', 'lifeWard', 'patron', 'benefactor', 'honoraryNoVote',
  ]).nullable().optional(),
  joinDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
})
export type AdminUpdateMemberInput = z.infer<typeof AdminUpdateMemberSchema>
```

After:
```typescript
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
```

**Change C — Add `email` to `CreateFamilyMemberSchema` (lines 48–54).**

Before:
```typescript
export const CreateFamilyMemberSchema = z.object({
  fullName:                 z.string().min(1).max(200),
  relation:                 z.enum(['spouse', 'child', 'other']),
  dateOfBirth:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  highSchoolGraduationYear: z.number().int().min(1900).max(new Date().getFullYear() + 6).optional(),
})
export type CreateFamilyMemberInput = z.infer<typeof CreateFamilyMemberSchema>
```

After:
```typescript
export const CreateFamilyMemberSchema = z.object({
  fullName:                 z.string().min(1).max(200),
  relation:                 z.enum(['spouse', 'child', 'other']),
  dateOfBirth:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  highSchoolGraduationYear: z.number().int().min(1900).max(new Date().getFullYear() + 6).optional(),
  email:                    z.string().email().optional(),
})
export type CreateFamilyMemberInput = z.infer<typeof CreateFamilyMemberSchema>
```

**Change D — Insert `UpdateFamilyMemberSchema` immediately after the `CreateFamilyMemberInput` type line (after line 54).**

Insert:
```typescript
// ── Family member update (PUT /api/members/me/family/:id) ─────────────────────

export const UpdateFamilyMemberSchema = z.object({
  fullName:                 z.string().min(1).max(200).optional(),
  dateOfBirth:              z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  highSchoolGraduationYear: z.number().int().min(1900).max(new Date().getFullYear() + 6).optional(),
  email:                    z.string().email().optional(),
  // relation intentionally excluded — not editable after creation
})
export type UpdateFamilyMemberInput = z.infer<typeof UpdateFamilyMemberSchema>
```

---

### 2.3 `apps/web/prisma/schema.prisma`

**Why:** `FamilyMember` has no `email` column; FR-09b requires it for spouse entries.

**Change — add one field after `highSchoolGraduationYear` (line 152).**

Before:
```prisma
  highSchoolGraduationYear Int?          @map("high_school_graduation_year")
  createdAt               DateTime       @default(now()) @map("created_at") @db.Timestamptz
```

After:
```prisma
  highSchoolGraduationYear Int?          @map("high_school_graduation_year")
  email                   String?        @map("email")
  createdAt               DateTime       @default(now()) @map("created_at") @db.Timestamptz
```

**Migration — run from `apps/web/`:**
```bash
npx prisma migrate dev --name add-family-member-email
npx prisma generate
```

The Implementer must run these two commands before writing any code that references `familyMember.email`.

---

### 2.4 `apps/web/lib/members/member-service.ts`

#### 2.4a Interface changes

**Why:** `UpdateMemberInput` contains `chapterId` (must be removed) and lacks `bio`/`spouseName` (must be added). `AdminUpdateMemberInput` must re-declare `chapterId` explicitly. New `UpdateFamilyMemberInput` interface needed.

**Before (lines 25–57):**
```typescript
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
  chapterId?: string | null
}

export interface AdminUpdateMemberInput extends UpdateMemberInput {
  memberStatus?: 'active' | 'expired' | 'suspended'
  role?: 'member' | 'admin'
  membershipType?: string | null
  joinDate?: string | null
  expiryDate?: string | null
}

export interface CreateFamilyMemberInput {
  fullName: string
  relation: 'spouse' | 'child' | 'other'
  dateOfBirth?: string
  highSchoolGraduationYear?: number
}
```

**After:**
```typescript
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
  // chapterId intentionally absent — server derives it; admin uses AdminUpdateMemberInput
}

export interface AdminUpdateMemberInput extends UpdateMemberInput {
  memberStatus?: 'active' | 'expired' | 'suspended'
  role?: 'member' | 'admin'
  membershipType?: string | null
  joinDate?: string | null
  expiryDate?: string | null
  chapterId?: string | null  // admin-only manual override
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
  dateOfBirth?: string
  highSchoolGraduationYear?: number
  email?: string
}
```

#### 2.4b `updateMember()` — full replacement

Replace the entire function (lines 79–94) with:

```typescript
export async function updateMember(
  id: string,
  data: Partial<AdminUpdateMemberInput>
): Promise<Member> {
  const existing = await prisma.member.findUnique({ where: { id } })
  if (!existing) {
    throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
  }

  // Destructure fields requiring special handling; remainder goes directly to Prisma
  const { joinDate, expiryDate, bio, spouseName, address, ...rest } = data
  const prismaData: Record<string, unknown> = { ...rest }

  // Date field conversions
  if (joinDate !== undefined)   prismaData.joinDate   = joinDate   ? new Date(joinDate)   : null
  if (expiryDate !== undefined) prismaData.expiryDate = expiryDate ? new Date(expiryDate) : null

  // Address + chapter derivation
  // When address is provided AND chapterId was NOT explicitly passed (member-facing path),
  // derive chapterId from address. If admin explicitly passed chapterId in rest it is already
  // in prismaData and takes precedence — no derivation override.
  if (address !== undefined) {
    prismaData.address = address
    if (data.chapterId === undefined) {
      const lookupKey =
        address.country === 'Canada' ? 'Canada' : (address.state ?? '')
      const chapter = lookupKey
        ? await prisma.chapter.findFirst({ where: { states: { has: lookupKey } } })
        : null
      prismaData.chapterId = chapter?.id ?? null
    }
  }

  // profileData merge — read-then-merge to avoid clobbering unrelated keys
  if (bio !== undefined || spouseName !== undefined) {
    const existingProfileData =
      (existing.profileData as Record<string, unknown> | null) ?? {}
    const mergedProfileData = { ...existingProfileData }
    if (bio !== undefined)        mergedProfileData.bio        = bio
    if (spouseName !== undefined) mergedProfileData.spouseName = spouseName
    prismaData.profileData = mergedProfileData
  }

  const updated = await prisma.$transaction(async (tx) => {
    const member = await tx.member.update({ where: { id }, data: prismaData })

    // Spouse FamilyMember upsert — only when spouseName was explicitly included in the update
    if (spouseName !== undefined) {
      const existingSpouse = await tx.familyMember.findFirst({
        where: { primaryMemberId: id, relation: 'spouse', deletedAt: null },
      })

      if (spouseName === '') {
        // Empty string → soft-delete existing spouse row
        if (existingSpouse) {
          await tx.familyMember.update({
            where: { id: existingSpouse.id },
            data:  { deletedAt: new Date() },
          })
        }
      } else if (existingSpouse) {
        await tx.familyMember.update({
          where: { id: existingSpouse.id },
          data:  { fullName: spouseName },
        })
      } else {
        await tx.familyMember.create({
          data: { primaryMemberId: id, fullName: spouseName, relation: 'spouse' },
        })
      }
    }

    return member
  })

  return updated
}
```

#### 2.4c New `updateFamilyMember()` function

Insert this after `softDeleteFamilyMember()` (after line 250 in the original file):

```typescript
export async function updateFamilyMember(
  id: string,
  requestingMemberId: string,
  data: UpdateFamilyMemberInput
): Promise<FamilyMember> {
  const familyMember = await prisma.familyMember.findUnique({
    where: { id, deletedAt: null },
  })

  if (!familyMember) {
    throw Object.assign(new Error('Family member not found'), { code: 'NOT_FOUND' })
  }

  if (familyMember.primaryMemberId !== requestingMemberId) {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })
  }

  const updateData: Record<string, unknown> = {}
  if (data.fullName !== undefined)                 updateData.fullName                 = data.fullName
  if (data.dateOfBirth !== undefined)              updateData.dateOfBirth              = new Date(data.dateOfBirth)
  if (data.highSchoolGraduationYear !== undefined) updateData.highSchoolGraduationYear = data.highSchoolGraduationYear
  if (data.email !== undefined)                    updateData.email                    = data.email

  return prisma.familyMember.update({
    where: { id },
    data: updateData,
  })
}
```

#### 2.4d `addFamilyMember()` — email passthrough

In the existing `addFamilyMember()`, add `email: data.email` to the `prisma.familyMember.create` call (lines 211–219):

Before:
```typescript
  return prisma.familyMember.create({
    data: {
      primaryMemberId,
      fullName: data.fullName,
      relation: data.relation,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      highSchoolGraduationYear: data.highSchoolGraduationYear,
    },
  })
```

After:
```typescript
  return prisma.familyMember.create({
    data: {
      primaryMemberId,
      fullName: data.fullName,
      relation: data.relation,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      highSchoolGraduationYear: data.highSchoolGraduationYear,
      email: data.email,
    },
  })
```

---

### 2.5 `apps/web/app/api/members/me/family/[id]/route.ts`

**Why:** Only `DELETE` exists; `PUT` must be added for FR-09.

Replace the entire file:

```typescript
import { withAuth } from '@/lib/auth/with-auth'
import { softDeleteFamilyMember, updateFamilyMember } from '@/lib/members/member-service'
import { UpdateFamilyMemberSchema } from '@/lib/validation/member.schema'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function serviceErrorToResponse(err: unknown): Response {
  const code = (err as { code?: string }).code
  if (code === 'NOT_FOUND') return jsonResponse(404, { error: 'Not found' })
  if (code === 'CONFLICT')  return jsonResponse(409, { error: 'Conflict' })
  if (code === 'FORBIDDEN') return jsonResponse(403, { error: 'Forbidden' })
  console.error(err)
  return jsonResponse(500, { error: 'Internal server error' })
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  return withAuth(async (_request, ctx) => {
    try {
      await softDeleteFamilyMember(id, ctx.user.id)
      return jsonResponse(200, { message: 'Family member removed' })
    } catch (err) {
      return serviceErrorToResponse(err)
    }
  })(req)
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await params
  return withAuth(async (request, ctx) => {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON body' })
    }

    const parsed = UpdateFamilyMemberSchema.safeParse(body)
    if (!parsed.success) {
      return jsonResponse(400, { error: parsed.error.flatten() })
    }

    try {
      const updated = await updateFamilyMember(id, ctx.user.id, parsed.data)
      return jsonResponse(200, { familyMember: updated })
    } catch (err) {
      return serviceErrorToResponse(err)
    }
  })(req)
}
```

---

### 2.6 `apps/web/app/components/nav-bar.tsx`

**Change A — Add "My Profile" link inside the Members dropdown, after the "Member Dashboard" `<li>` (line 44).**

Before:
```tsx
              {isAuthed && (
                <>
                  <li><Link href="/members/policy">Policy Documents &amp; Forms</Link></li>
                  <li><Link href="/dashboard">Member Dashboard</Link></li>
                  <li><Link href="/members/search">Member Search</Link></li>
```

After:
```tsx
              {isAuthed && (
                <>
                  <li><Link href="/members/policy">Policy Documents &amp; Forms</Link></li>
                  <li><Link href="/dashboard">Member Dashboard</Link></li>
                  <li><Link href="/profile">My Profile</Link></li>
                  <li><Link href="/members/search">Member Search</Link></li>
```

**Change B — In the footer `<span>`, make the display name a link to `/profile` (line 118).**

Before:
```tsx
            <span>{displayName}</span>
```

After:
```tsx
            <Link href="/profile">{displayName}</Link>
```

No import change needed — `Link` is already imported on line 1.

---

### 2.7 `apps/web/app/profile/page.tsx` — new file

Create at `apps/web/app/profile/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/auth/supabase-server'
import { chapterDisplayName } from '@/lib/constants/address-options'
import ProfileClient from './ProfileClient'
import type { MemberRow } from '@/lib/auth/with-auth'
import type { FamilyMember } from '@prisma/client'

export default async function ProfilePage() {
  const supabase = await createSupabaseServer()
  const { data: { session } } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  const token = session.access_token
  const headers = { Authorization: `Bearer ${token}` }
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const [memberRes, familyRes] = await Promise.all([
    fetch(`${baseUrl}/api/members/me`, { headers, cache: 'no-store' }),
    fetch(`${baseUrl}/api/members/me/family`, { headers, cache: 'no-store' }),
  ])

  if (!memberRes.ok) {
    redirect('/login')
  }

  const { member }: { member: MemberRow } = await memberRes.json()
  const familyBody = familyRes.ok ? await familyRes.json() : { familyMembers: [] }
  const familyMembers: FamilyMember[] = familyBody.familyMembers ?? []

  const profileData = (member.profileData as Record<string, unknown> | null) ?? {}
  const bio         = (profileData.bio        as string) ?? ''
  const spouseName  = (profileData.spouseName as string) ?? ''
  const chapterName = chapterDisplayName(member.chapterId)

  return (
    <main>
      <h1>My Profile</h1>
      <ProfileClient
        member={member}
        familyMembers={familyMembers}
        chapterName={chapterName}
        bio={bio}
        spouseName={spouseName}
      />
    </main>
  )
}
```

---

### 2.8 `apps/web/app/profile/ProfileClient.tsx` — new file

Create at `apps/web/app/profile/ProfileClient.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'
import { STATE_OPTIONS, chapterDisplayName } from '@/lib/constants/address-options'
import type { MemberRow } from '@/lib/auth/with-auth'
import type { FamilyMember } from '@prisma/client'

interface ProfileClientProps {
  member: MemberRow
  familyMembers: FamilyMember[]
  chapterName: string
  bio: string
  spouseName: string
}

interface AddressForm {
  street: string; city: string; state: string; zip: string; country: string
}

interface ProfileForm {
  fullName: string
  phone: string
  address: AddressForm
  bio: string
  spouseName: string
  souvenirPreference: string
  show_phone: boolean
  show_email: boolean
  show_chapter: boolean
}

interface AddFamilyForm {
  fullName: string
  relation: string
  dateOfBirth: string
  highSchoolGraduationYear: string
  email: string
}

interface EditFamilyForm {
  fullName: string
  dateOfBirth: string
  highSchoolGraduationYear: string
  email: string
}

// FamilyMember rows returned by the API include the email field after migration.
// Cast helper until TypeScript picks up the regenerated Prisma client.
type FamilyMemberWithEmail = FamilyMember & { email?: string | null }

const MEMBERSHIP_TYPE_LABELS: Record<string, string> = {
  annualStudentNoVote: 'Annual Student',
  annualSingle:        'Annual Single',
  annualFamily:        'Annual Family',
  fiveYearFamily:      'Five-Year Family',
  life:                'Life',
  lifeWard:            'Life (Ward)',
  patron:              'Patron',
  benefactor:          'Benefactor',
  honoraryNoVote:      'Honorary',
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

export default function ProfileClient({
  member,
  familyMembers: initialFamilyMembers,
  chapterName: initialChapterName,
  bio: initialBio,
  spouseName: initialSpouseName,
}: ProfileClientProps) {
  const addr = (member.address as Record<string, string> | null) ?? {}
  const vis  = (member.profileVisibility as Record<string, boolean> | null) ?? {}

  const [form, setForm] = useState<ProfileForm>({
    fullName:           member.fullName ?? '',
    phone:              member.phone    ?? '',
    address: {
      street:  addr.street  ?? '',
      city:    addr.city    ?? '',
      state:   addr.state   ?? '',
      zip:     addr.zip     ?? '',
      country: addr.country ?? 'USA',
    },
    bio:                initialBio,
    spouseName:         initialSpouseName,
    souvenirPreference: member.souvenirPreference ?? '',
    show_phone:         vis.show_phone   ?? false,
    show_email:         vis.show_email   ?? false,
    show_chapter:       vis.show_chapter ?? false,
  })
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [chapterName, setChapterName] = useState(initialChapterName)

  const [familyMembers, setFamilyMembers] = useState<FamilyMemberWithEmail[]>(
    initialFamilyMembers as FamilyMemberWithEmail[]
  )
  const [addingFamily,  setAddingFamily]  = useState(false)
  const [addForm,       setAddForm]       = useState<AddFamilyForm>({
    fullName: '', relation: 'child', dateOfBirth: '', highSchoolGraduationYear: '', email: '',
  })
  const [addError,     setAddError]    = useState<string | null>(null)
  const [addInFlight,  setAddInFlight] = useState(false)
  const [editingId,    setEditingId]   = useState<string | null>(null)
  const [editForm,     setEditForm]    = useState<EditFamilyForm>({
    fullName: '', dateOfBirth: '', highSchoolGraduationYear: '', email: '',
  })
  const [editError,    setEditError]   = useState<string | null>(null)
  const [editInFlight, setEditInFlight] = useState(false)

  async function getToken(): Promise<string> {
    const supabase = createSupabaseBrowser()
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    const payload: Record<string, unknown> = {
      fullName:   form.fullName.trim()  || undefined,
      phone:      form.phone.trim()     || undefined,
      bio:        form.bio,        // empty string is valid — clears bio key in profileData
      spouseName: form.spouseName, // empty string triggers spouse soft-delete in service
      address: {
        street:  form.address.street.trim(),
        city:    form.address.city.trim(),
        state:   form.address.state,
        zip:     form.address.zip.trim(),
        country: form.address.country || 'USA',
      },
      profileVisibility: {
        show_phone:   form.show_phone,
        show_email:   form.show_email,
        show_chapter: form.show_chapter,
      },
    }
    if (form.souvenirPreference) {
      payload.souvenirPreference = form.souvenirPreference
    }

    try {
      const token = await getToken()
      const res = await fetch('/api/members/me', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSaveError((body as { error?: string })?.error ?? 'Save failed. Please try again.')
        return
      }
      const { member: updated } = await res.json()
      setChapterName(chapterDisplayName(updated.chapterId))
      setSaveSuccess(true)
    } catch {
      setSaveError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAddFamily(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    setAddInFlight(true)

    const payload: Record<string, unknown> = {
      fullName: addForm.fullName.trim(),
      relation: addForm.relation,
    }
    if (addForm.dateOfBirth)              payload.dateOfBirth              = addForm.dateOfBirth
    if (addForm.highSchoolGraduationYear) payload.highSchoolGraduationYear = parseInt(addForm.highSchoolGraduationYear, 10)
    if (addForm.relation === 'spouse' && addForm.email.trim()) payload.email = addForm.email.trim()

    try {
      const token = await getToken()
      const res = await fetch('/api/members/me/family', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setAddError((body as { error?: string })?.error ?? 'Failed to add family member.')
        return
      }
      const { familyMember } = await res.json()
      setFamilyMembers((prev) => [...prev, familyMember as FamilyMemberWithEmail])
      setAddForm({ fullName: '', relation: 'child', dateOfBirth: '', highSchoolGraduationYear: '', email: '' })
      setAddingFamily(false)
    } catch {
      setAddError('Network error. Please try again.')
    } finally {
      setAddInFlight(false)
    }
  }

  async function handleRemoveFamily(id: string) {
    try {
      const token = await getToken()
      const res = await fetch(`/api/members/me/family/${id}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setFamilyMembers((prev) => prev.filter((m) => m.id !== id))
      }
    } catch {
      // Silently ignore — row remains in list; user can retry
    }
  }

  function startEdit(fm: FamilyMemberWithEmail) {
    setEditingId(fm.id)
    setEditError(null)
    setEditForm({
      fullName:                 fm.fullName,
      dateOfBirth:              fm.dateOfBirth
        ? new Date(fm.dateOfBirth).toISOString().slice(0, 10)
        : '',
      highSchoolGraduationYear: fm.highSchoolGraduationYear
        ? String(fm.highSchoolGraduationYear)
        : '',
      email: fm.email ?? '',
    })
  }

  async function handleSaveEdit(id: string) {
    setEditError(null)
    setEditInFlight(true)

    const fm = familyMembers.find((m) => m.id === id)
    const payload: Record<string, unknown> = {}
    if (editForm.fullName.trim())          payload.fullName                 = editForm.fullName.trim()
    if (editForm.dateOfBirth)              payload.dateOfBirth              = editForm.dateOfBirth
    if (editForm.highSchoolGraduationYear) payload.highSchoolGraduationYear = parseInt(editForm.highSchoolGraduationYear, 10)
    if (fm?.relation === 'spouse')         payload.email                    = editForm.email.trim()

    try {
      const token = await getToken()
      const res = await fetch(`/api/members/me/family/${id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setEditError((body as { error?: string })?.error ?? 'Save failed.')
        return
      }
      const { familyMember: updated } = await res.json()
      setFamilyMembers((prev) => prev.map((m) => (m.id === id ? (updated as FamilyMemberWithEmail) : m)))
      setEditingId(null)
    } catch {
      setEditError('Network error. Please try again.')
    } finally {
      setEditInFlight(false)
    }
  }

  return (
    <>
      {/* Read-only identity */}
      <fieldset>
        <legend>Account</legend>
        <p><strong>Email:</strong> {member.email}</p>
        <p><em>To change your login email or switch login method, please contact an OSA admin.</em></p>
        <p><strong>Role:</strong> {member.role}</p>
        <p><strong>Chapter:</strong> {chapterName}</p>
      </fieldset>

      <fieldset>
        <legend>Membership</legend>
        <p><strong>Type:</strong> {member.membershipType ? (MEMBERSHIP_TYPE_LABELS[member.membershipType] ?? member.membershipType) : '—'}</p>
        <p><strong>Status:</strong> {member.memberStatus ?? '—'}</p>
        <p><strong>Join date:</strong> {formatDate(member.joinDate)}</p>
        <p><strong>Expiry date:</strong> {formatDate(member.expiryDate)}</p>
      </fieldset>

      {/* Editable form */}
      <form onSubmit={handleSave}>
        <fieldset>
          <legend>Personal Information</legend>

          <div>
            <label htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              type="text"
              value={form.fullName}
              onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
            />
          </div>

          <div>
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
            />
          </div>

          <div>
            <label htmlFor="bio">Bio</label>
            <textarea
              id="bio"
              rows={4}
              maxLength={1000}
              value={form.bio}
              onChange={(e) => setForm((prev) => ({ ...prev, bio: e.target.value }))}
            />
            <p>{1000 - form.bio.length} characters remaining</p>
          </div>

          <div>
            <label htmlFor="spouseName">Spouse name</label>
            <input
              id="spouseName"
              type="text"
              value={form.spouseName}
              onChange={(e) => setForm((prev) => ({ ...prev, spouseName: e.target.value }))}
            />
          </div>

          <div>
            <label htmlFor="souvenirPreference">Souvenir preference</label>
            <select
              id="souvenirPreference"
              value={form.souvenirPreference}
              onChange={(e) => setForm((prev) => ({ ...prev, souvenirPreference: e.target.value }))}
            >
              <option value="">— No preference —</option>
              <option value="electronic">Electronic</option>
              <option value="print">Print</option>
            </select>
          </div>
        </fieldset>

        <fieldset>
          <legend>Address</legend>
          <p><em>Chapter is assigned automatically from your address and shown read-only above.</em></p>

          <div>
            <label htmlFor="addrStreet">Street</label>
            <input
              id="addrStreet"
              type="text"
              value={form.address.street}
              onChange={(e) => setForm((prev) => ({ ...prev, address: { ...prev.address, street: e.target.value } }))}
            />
          </div>

          <div>
            <label htmlFor="addrCity">City</label>
            <input
              id="addrCity"
              type="text"
              value={form.address.city}
              onChange={(e) => setForm((prev) => ({ ...prev, address: { ...prev.address, city: e.target.value } }))}
            />
          </div>

          <div>
            <label htmlFor="addrState">State / Province</label>
            <select
              id="addrState"
              value={form.address.state}
              onChange={(e) => setForm((prev) => ({ ...prev, address: { ...prev.address, state: e.target.value } }))}
            >
              <option value="">— Select —</option>
              {STATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="addrZip">ZIP / Postal code</label>
            <input
              id="addrZip"
              type="text"
              value={form.address.zip}
              onChange={(e) => setForm((prev) => ({ ...prev, address: { ...prev.address, zip: e.target.value } }))}
            />
          </div>

          <div>
            <label htmlFor="addrCountry">Country</label>
            <select
              id="addrCountry"
              value={form.address.country}
              onChange={(e) => setForm((prev) => ({ ...prev, address: { ...prev.address, country: e.target.value } }))}
            >
              <option value="USA">USA</option>
              <option value="Canada">Canada</option>
            </select>
          </div>
        </fieldset>

        <fieldset>
          <legend>Profile Visibility</legend>

          <div>
            <label>
              <input
                type="checkbox"
                checked={form.show_phone}
                onChange={(e) => setForm((prev) => ({ ...prev, show_phone: e.target.checked }))}
              />
              {' '}Show phone number to other members
            </label>
          </div>

          <div>
            <label>
              <input
                type="checkbox"
                checked={form.show_email}
                onChange={(e) => setForm((prev) => ({ ...prev, show_email: e.target.checked }))}
              />
              {' '}Show email address to other members
            </label>
          </div>

          <div>
            <label>
              <input
                type="checkbox"
                checked={form.show_chapter}
                onChange={(e) => setForm((prev) => ({ ...prev, show_chapter: e.target.checked }))}
              />
              {' '}Show chapter to other members
            </label>
          </div>
        </fieldset>

        {saveError   && <p role="alert">{saveError}</p>}
        {saveSuccess && <p role="status">Profile saved.</p>}

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </form>

      {/* Family members */}
      <section>
        <h2>Family Members</h2>

        {familyMembers.length === 0 && <p>No family members added yet.</p>}

        {familyMembers.map((fm) => {
          const isEditing = editingId === fm.id
          return (
            <div key={fm.id}>
              {isEditing ? (
                <>
                  <div>
                    <label htmlFor={`edit_name_${fm.id}`}>Name</label>
                    <input
                      id={`edit_name_${fm.id}`}
                      type="text"
                      value={editForm.fullName}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, fullName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit_dob_${fm.id}`}>Date of birth</label>
                    <input
                      id={`edit_dob_${fm.id}`}
                      type="date"
                      value={editForm.dateOfBirth}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label htmlFor={`edit_grad_${fm.id}`}>HS graduation year</label>
                    <input
                      id={`edit_grad_${fm.id}`}
                      type="number"
                      value={editForm.highSchoolGraduationYear}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, highSchoolGraduationYear: e.target.value }))}
                    />
                  </div>
                  {fm.relation === 'spouse' && (
                    <div>
                      <label htmlFor={`edit_email_${fm.id}`}>Spouse email</label>
                      <input
                        id={`edit_email_${fm.id}`}
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                      />
                    </div>
                  )}
                  {editError && <p role="alert">{editError}</p>}
                  <button type="button" onClick={() => handleSaveEdit(fm.id)} disabled={editInFlight}>
                    {editInFlight ? 'Saving…' : 'Save'}
                  </button>
                  {' '}
                  <button type="button" onClick={() => setEditingId(null)} disabled={editInFlight}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <p>
                    <strong>{fm.fullName}</strong>
                    {' — '}{fm.relation}
                    {fm.dateOfBirth && ` — Born ${formatDate(fm.dateOfBirth)}`}
                    {fm.highSchoolGraduationYear && ` — HS grad ${fm.highSchoolGraduationYear}`}
                    {fm.relation === 'spouse' && fm.email && ` — ${fm.email}`}
                  </p>
                  <button type="button" onClick={() => startEdit(fm)}>Edit</button>
                  {' '}
                  <button type="button" onClick={() => handleRemoveFamily(fm.id)}>Remove</button>
                </>
              )}
            </div>
          )
        })}

        {!addingFamily && (
          <button type="button" onClick={() => setAddingFamily(true)}>Add family member</button>
        )}

        {addingFamily && (
          <form onSubmit={handleAddFamily}>
            <fieldset>
              <legend>New family member</legend>

              <div>
                <label htmlFor="add_name">Name</label>
                <input
                  id="add_name"
                  type="text"
                  required
                  value={addForm.fullName}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, fullName: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="add_relation">Relation</label>
                <select
                  id="add_relation"
                  value={addForm.relation}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, relation: e.target.value }))}
                >
                  <option value="spouse">Spouse</option>
                  <option value="child">Child</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label htmlFor="add_dob">Date of birth (optional)</label>
                <input
                  id="add_dob"
                  type="date"
                  value={addForm.dateOfBirth}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
                />
              </div>

              <div>
                <label htmlFor="add_grad">HS graduation year (optional)</label>
                <input
                  id="add_grad"
                  type="number"
                  value={addForm.highSchoolGraduationYear}
                  onChange={(e) => setAddForm((prev) => ({ ...prev, highSchoolGraduationYear: e.target.value }))}
                />
              </div>

              {addForm.relation === 'spouse' && (
                <div>
                  <label htmlFor="add_email">Spouse email (optional)</label>
                  <input
                    id="add_email"
                    type="email"
                    value={addForm.email}
                    onChange={(e) => setAddForm((prev) => ({ ...prev, email: e.target.value }))}
                  />
                </div>
              )}

              {addError && <p role="alert">{addError}</p>}

              <button type="submit" disabled={addInFlight}>
                {addInFlight ? 'Adding…' : 'Add'}
              </button>
              {' '}
              <button type="button" onClick={() => setAddingFamily(false)} disabled={addInFlight}>
                Cancel
              </button>
            </fieldset>
          </form>
        )}
      </section>
    </>
  )
}
```

---

### 2.9 `apps/web/app/dashboard/page.tsx`

**Why:** OQ-2 resolved as "both nav and dashboard link."

Add one `<p>` after the Chapter line (after current line 73):

Before:
```tsx
        <p><strong>Chapter:</strong> {chapter}</p>
      </fieldset>
```

After:
```tsx
        <p><strong>Chapter:</strong> {chapter}</p>
        <p><a href="/profile">Edit Profile</a></p>
      </fieldset>
```

---

### 2.10 `apps/web/app/register/page.tsx` — Step 3 spouse email

**Context:** Step 3 collects `spouseName` as a plain text field. `POST /api/users/me/profile` creates the spouse `FamilyMember` row but does not accept `email`. The fix: collect `spouseEmail` in the form state, then after the profile POST succeeds in `handleAddressSubmit()`, fetch the family list, find the spouse row, and call `PUT /api/members/me/family/:id` to set email. Email save failure is non-critical and silently ignored.

**Change A — Add `spouseEmail` to `FormData` type (line 26):**

Before:
```typescript
  family: { spouseName: string; children: Child[] }
```

After:
```typescript
  family: { spouseName: string; spouseEmail: string; children: Child[] }
```

**Change B — Add `spouseEmail: ''` to `INITIAL` (line 45):**

Before:
```typescript
  family: { spouseName: '', children: [] },
```

After:
```typescript
  family: { spouseName: '', spouseEmail: '', children: [] },
```

**Change C — Add the `spouseEmail` input in Step 3 JSX, immediately after the `spouseName` `<div>` (after line 512):**

Before:
```tsx
            <div>
              <label htmlFor="spouseName">Spouse name (optional)</label>
              <input id="spouseName" type="text"
                value={formData.family.spouseName}
                onChange={(e) => setFormData((prev) => ({ ...prev, family: { ...prev.family, spouseName: e.target.value } }))} />
            </div>
            <fieldset>
```

After:
```tsx
            <div>
              <label htmlFor="spouseName">Spouse name (optional)</label>
              <input id="spouseName" type="text"
                value={formData.family.spouseName}
                onChange={(e) => setFormData((prev) => ({ ...prev, family: { ...prev.family, spouseName: e.target.value } }))} />
            </div>
            {formData.family.spouseName.trim() && (
              <div>
                <label htmlFor="spouseEmail">Spouse email (optional)</label>
                <input id="spouseEmail" type="email"
                  value={formData.family.spouseEmail}
                  onChange={(e) => setFormData((prev) => ({ ...prev, family: { ...prev.family, spouseEmail: e.target.value } }))} />
              </div>
            )}
            <fieldset>
```

**Change D — At the end of `handleAddressSubmit()`, before `setStep(5)` (current line 292):**

Before:
```typescript
    setStep(5)
  }
```

After:
```typescript
    // If spouse email was provided, find the spouse FamilyMember and set its email.
    // Non-critical: failure is silently ignored — email can be set on /profile.
    const spouseEmail = formData.family.spouseEmail.trim()
    if (spouseEmail && formData.family.spouseName.trim()) {
      const familyRes = await fetch('/api/members/me/family', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (familyRes.ok) {
        const { familyMembers } = await familyRes.json()
        const spouse = (familyMembers as { id: string; relation: string }[])
          .find((fm) => fm.relation === 'spouse')
        if (spouse) {
          await fetch(`/api/members/me/family/${spouse.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ email: spouseEmail }),
          }).catch(() => { /* non-critical */ })
        }
      }
    }

    setStep(5)
  }
```

---

## 3. Data Flow Diagram

### Profile save

```
ProfileClient.handleSave()
  └─ PUT /api/members/me  { fullName, phone, address, bio, spouseName, souvenirPreference, profileVisibility }
       └─ UpdateMemberSchema.safeParse()   [strips any chapterId if client sends it]
            └─ updateMember(user.id, data)
                 ├─ prisma.member.findUnique(id)               [NOT_FOUND guard]
                 ├─ address provided + no explicit chapterId?
                 │    lookupKey = country==='Canada' ? 'Canada' : state
                 │    prisma.chapter.findFirst({ states: { has: lookupKey } })
                 │    prismaData.chapterId = chapter?.id ?? null
                 ├─ bio or spouseName provided?
                 │    merge into existing profileData (never overwrite)
                 └─ prisma.$transaction()
                      ├─ member.update(prismaData)
                      └─ spouseName provided?
                           ''       → soft-delete existing spouse FamilyMember
                           non-empty, existing → update fullName
                           non-empty, none     → create spouse FamilyMember
     ← { member: updatedMember }
ProfileClient
  └─ setChapterName(chapterDisplayName(updated.chapterId))
  └─ setSaveSuccess(true)
```

### Family member edit

```
ProfileClient.handleSaveEdit(id)
  └─ PUT /api/members/me/family/:id  { fullName?, dateOfBirth?, highSchoolGraduationYear?, email? }
       └─ UpdateFamilyMemberSchema.safeParse()
            └─ updateFamilyMember(id, user.id, data)
                 ├─ prisma.familyMember.findUnique(id, deletedAt:null)  [NOT_FOUND]
                 ├─ primaryMemberId !== requestingMemberId              [FORBIDDEN]
                 └─ prisma.familyMember.update(updateData)
     ← { familyMember: updated }
ProfileClient
  └─ setFamilyMembers(prev.map(m => m.id===id ? updated : m))
  └─ setEditingId(null)
```

---

## 4. Edge Cases and Implementation Notes

**profileData null on first save.** `existing.profileData` will be `null` for any member who skipped registration Step 4. The line `(existing.profileData as Record<string, unknown> | null) ?? {}` produces an empty object — merging `{ bio, spouseName }` onto it is safe.

**souvenirPreference type.** Prisma schema defines `SouvenirPreference` enum with values `electronic` and `print`. The `<select>` presents `value=""` (no preference), `value="electronic"`, and `value="print"`. The save payload omits `souvenirPreference` when the value is `''`, so selecting "No preference" will not clear an existing preference. This is acceptable for the current spec.

**spouseName empty string.** If the member clears `spouseName` and saves, `updateMember()` soft-deletes the existing spouse `FamilyMember` row (sets `deletedAt = now()`). The profile family list will not show the row on next load. This is intentional: clearing the name removes the family association.

**Canada chapter lookup.** The comparison is `address.country === 'Canada'` (exact string, capital C). The chapter seed has `states: ['Canada']`. The `ProfileClient` country `<select>` only allows `'USA'` or `'Canada'`, so case drift is not possible via the UI. Direct API calls with different capitalization produce `chapterId = null`, which is acceptable.

**profileVisibility JSON keys.** Exact keys confirmed in `ProfileVisibilitySchema` (line 13 of `member.schema.ts`): `show_phone`, `show_email`, `show_chapter`. The `ProfileClient` state vars and API payload use these exact names.

**FamilyMember email TypeScript type.** After `prisma migrate dev` and `prisma generate`, the Prisma-generated `FamilyMember` type will include `email`. Until then, the `FamilyMemberWithEmail` cast alias in `ProfileClient.tsx` bridges the gap. Once generated, the cast alias and all its usages become redundant but harmless.

**address.state two-letter abbreviation.** `STATE_OPTIONS` values are abbreviations (`'IL'`, `'CA'`, etc.). Chapter seed has matching abbreviations (`states: ['IL']`). Lookup is case-sensitive in Postgres. The dropdown enforces correct values.

---

## 5. What the Implementer Must NOT Do

- Must not accept `chapterId` in `UpdateMemberSchema`. Zod unknown-key stripping (default behavior without `.passthrough()`) will silently drop any `chapterId` a client sends. Verify with a test that sending `chapterId` in `PUT /api/members/me` has no effect on the stored value.
- Must not overwrite `profileData` without merging. The pattern `{ ...existingProfileData, bio?, spouseName? }` is mandatory. A direct `prismaData.profileData = { bio, spouseName }` destroys keys written during registration (e.g., any `children` or other future keys stored in `profileData`).
- Must not add `className`, Tailwind utilities, or `style` attributes anywhere in `ProfileClient.tsx` or `page.tsx`.
- Must not modify `apps/web/app/api/members/me/route.ts`. The route already delegates to `updateMember()` correctly.
- Must not modify `apps/web/app/api/users/me/profile/route.ts`. That is registration-time only.
- Must not modify `apps/web/prisma/seed.ts`. KY is already absent.
- Must not import `UpdateFamilyMemberInput` type from `member.schema.ts` into the route file. The route file imports `UpdateFamilyMemberSchema` (for Zod parsing) and calls `updateFamilyMember()` with `parsed.data`. TypeScript infers the type automatically — no explicit import of the type needed.
```

---

The above is the complete `02-design.md`. The Implementer must save it to:

`/Users/utkalnayak/Documents/code/membership-event-registration/specs/artifacts/SPEC-18/02-design.md`

Key files modified (absolute paths):
- `/Users/utkalnayak/Documents/code/membership-event-registration/apps/web/lib/auth/with-auth.ts`
- `/Users/utkalnayak/Documents/code/membership-event-registration/apps/web/lib/validation/member.schema.ts`
- `/Users/utkalnayak/Documents/code/membership-event-registration/apps/web/prisma/schema.prisma`
- `/Users/utkalnayak/Documents/code/membership-event-registration/apps/web/lib/members/member-service.ts`
- `/Users/utkalnayak/Documents/code/membership-event-registration/apps/web/app/api/members/me/family/[id]/route.ts`
- `/Users/utkalnayak/Documents/code/membership-event-registration/apps/web/app/components/nav-bar.tsx`
- `/Users/utkalnayak/Documents/code/membership-event-registration/apps/web/app/dashboard/page.tsx`
- `/Users/utkalnayak/Documents/code/membership-event-registration/apps/web/app/register/page.tsx`

Key files created (absolute paths):
- `/Users/utkalnayak/Documents/code/membership-event-registration/apps/web/app/profile/page.tsx`
- `/Users/utkalnayak/Documents/code/membership-event-registration/apps/web/app/profile/ProfileClient.tsx`
