# Phase 2: Design — SPEC-19: Spouse Linked Login

> **Spec:** `specs/active/SPEC-19-spouse-linked-login.md`
> **Analysis:** `specs/artifacts/SPEC-19/01-analysis.md`
> **Status:** Complete
> **Date:** 2026-05-24

---

## Open Question Resolutions (from Phase 1)

| OQ | Decision |
|----|----------|
| OQ-A | `GET /api/members/me` response adds `isSpouseSession: boolean` (from `ctx.isSpouseSession`) |
| OQ-B | Dashboard uses `getCurrentMember()` (updated with step 2b) — not a separate HTTP fetch |
| OQ-C | Page-level banners only (dashboard + profile). Nav bar NOT modified. |
| OQ-D | Call `supabaseAdmin.auth.admin.signOut(spouseUserId)` during revoke before clearing fields |
| OQ-E | `PUT /api/members/me/email` returns 403 when `ctx.isSpouseSession === true` |
| OQ-F | Both `softDeleteMember` and `softDeleteFamilyMember` clear `email` + `spouseUserId` on spouse row before setting `deletedAt` |

---

## 1. Schema Change — `apps/web/prisma/schema.prisma`

Add one field to `FamilyMember` after the existing `email` field:

```prisma
model FamilyMember {
  id                       String         @id @default(uuid()) @db.Uuid
  primaryMemberId          String         @map("primary_member_id") @db.Uuid
  fullName                 String         @map("full_name")
  relation                 FamilyRelation
  dateOfBirth              DateTime?      @map("date_of_birth") @db.Date
  highSchoolGraduationYear Int?           @map("high_school_graduation_year")
  email                    String?        @map("email")
  spouseUserId             String?        @unique @map("spouse_user_id") @db.Uuid   // SPEC-19: new
  createdAt                DateTime       @default(now()) @map("created_at") @db.Timestamptz
  deletedAt                DateTime?      @map("deleted_at") @db.Timestamptz

  primaryMember Member @relation("PrimaryMember", fields: [primaryMemberId], references: [id])

  @@map("family_members")
}
```

`@unique` enforces NFR-03 (one Supabase account cannot link to two primaries). Existing rows default to `null` — no data migration needed.

After editing:

```bash
cd apps/web && npx prisma db push && npx prisma generate
```

---

## 2. `withAuth.ts` Changes — `apps/web/lib/auth/with-auth.ts`

### 2.1 Updated Types

Replace the current `AuthHandler` type definition with:

```typescript
export type AuthContext = {
  user: MemberRow
  isSpouseSession: boolean
}

export type AuthHandler = (
  req: Request,
  ctx: AuthContext
) => Promise<Response>
```

`MemberRow` is unchanged. All existing handlers that destructure only `ctx.user` continue to compile without modification — the new `isSpouseSession` field is additive.

### 2.2 Step 2b Insertion

Declare `isSpouseSession` immediately before the primary lookup sequence:

```typescript
let isSpouseSession = false
```

Insert step 2b inside the `else if (!member)` block, **after** the email-fallback binding block and **before** JIT-create. The refactored structure:

```typescript
// Step 1: userId lookup (unchanged)
let member = await prisma.member.findUnique({ where: { userId: authUser.id } })

let isSpouseSession = false

if (!member) {
  // Step 2: email fallback
  member = await prisma.member.findUnique({ where: { email: authUser.email } })

  if (member && !member.userId) {
    // Bind userId if found by email with null userId
    await prisma.member.update({ where: { id: member.id }, data: { userId: authUser.id } })
  } else if (!member) {
    // Step 2b: Spouse email match
    const spouseFm = await prisma.familyMember.findFirst({
      where: { email: authUser.email, relation: 'spouse', deletedAt: null },
    })

    if (spouseFm) {
      const primaryMember = await prisma.member.findUnique({
        where: { id: spouseFm.primaryMemberId },
      })

      if (primaryMember && primaryMember.deletedAt === null) {
        if (spouseFm.spouseUserId === null) {
          try {
            await prisma.familyMember.update({
              where: { id: spouseFm.id },
              data: { spouseUserId: authUser.id },
            })
          } catch (e) {
            // P2002: race condition — another request won; fall through to JIT-create
            if ((e as { code?: string }).code !== 'P2002') throw e
            member = null
            isSpouseSession = false
          }
        }
        if (member !== null || spouseFm.spouseUserId !== null) {
          member = primaryMember
          isSpouseSession = true
        }
      }
    }

    if (!member) {
      // Step 3: JIT-create (existing logic, unchanged)
      member = await prisma.member.create({ data: { email: authUser.email, userId: authUser.id } })
    }
  }
}
```

### 2.3 Updated Handler Invocation

```typescript
// Before
return handler(req, { user: member })

// After
return handler(req, { user: member, isSpouseSession })
```

---

## 3. Service Layer

### 3.1 `apps/web/lib/members/services/member-family.ts` — New Functions

Add the following import at the top of the file:

```typescript
import { getSupabaseAdmin } from '@/lib/auth/supabase-admin'
```

Add these three functions after the existing `updateFamilyMember` export:

#### `validateSpouseEmail`

Throws CONFLICT if the given email is already:
- a primary `Member.email` (any member)
- a `FamilyMember.email` on a *different* primary's active spouse record

Does NOT throw if the email belongs to the calling primary's own spouse row (normal re-save case).

```typescript
export async function validateSpouseEmail(
  email: string,
  excludingPrimaryMemberId: string
): Promise<void> {
  const existingMember = await prisma.member.findUnique({ where: { email } })
  if (existingMember) {
    throw Object.assign(
      new Error('This email is already registered as a primary member and cannot be linked as a spouse.'),
      { code: 'CONFLICT' }
    )
  }

  const conflictingFm = await prisma.familyMember.findFirst({
    where: {
      email,
      relation: 'spouse',
      deletedAt: null,
      primaryMemberId: { not: excludingPrimaryMemberId },
    },
  })
  if (conflictingFm) {
    throw Object.assign(
      new Error('This email is already linked as a spouse for another member.'),
      { code: 'CONFLICT' }
    )
  }
}
```

#### `revokeSpouseLink`

Revokes spouse access. Idempotent — no-op if no active spouse link exists.

Steps:
1. Find active spouse FamilyMember (relation=spouse, deletedAt=null)
2. If none: return
3. If `spouseUserId` set: call `supabaseAdmin.auth.admin.signOut(spouseUserId)` (non-fatal on failure)
4. Clear `FamilyMember.email` and `FamilyMember.spouseUserId` to null
5. Does NOT soft-delete the row — spouse name remains visible; primary can enter a new email

```typescript
export async function revokeSpouseLink(primaryMemberId: string): Promise<void> {
  const spouseFm = await prisma.familyMember.findFirst({
    where: { primaryMemberId, relation: 'spouse', deletedAt: null },
  })

  if (!spouseFm) return

  if (spouseFm.spouseUserId) {
    try {
      await getSupabaseAdmin().auth.admin.signOut(spouseFm.spouseUserId)
    } catch {
      console.error(`revokeSpouseLink: signOut failed for spouseUserId=${spouseFm.spouseUserId}`)
    }
  }

  await prisma.familyMember.update({
    where: { id: spouseFm.id },
    data: { email: null, spouseUserId: null },
  })
}
```

#### `changePrimaryEmail`

Changes a primary member's login email via Supabase Admin API.

Steps:
1. Load member — throw NOT_FOUND if missing
2. Check new email not already a `Member.email`
3. Check new email not already a `FamilyMember.email` (active spouse on any primary)
4. Call `supabaseAdmin.auth.admin.updateUserById` — invalidates old credentials immediately
5. Update `Member.email` in Prisma

```typescript
export async function changePrimaryEmail(memberId: string, newEmail: string): Promise<void> {
  const member = await prisma.member.findUnique({ where: { id: memberId, deletedAt: null } })
  if (!member) {
    throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
  }

  if (!member.userId) {
    throw Object.assign(new Error('Member has no linked Supabase account'), { code: 'CONFLICT' })
  }

  const emailConflict = await prisma.member.findUnique({ where: { email: newEmail } })
  if (emailConflict) {
    throw Object.assign(new Error('This email is already registered.'), { code: 'CONFLICT' })
  }

  const familyConflict = await prisma.familyMember.findFirst({
    where: { email: newEmail, relation: 'spouse', deletedAt: null },
  })
  if (familyConflict) {
    throw Object.assign(
      new Error('This email is already linked as a spouse for another member.'),
      { code: 'CONFLICT' }
    )
  }

  const { error: supabaseError } = await getSupabaseAdmin().auth.admin.updateUserById(
    member.userId,
    { email: newEmail }
  )
  if (supabaseError) {
    throw Object.assign(
      new Error(supabaseError.message ?? 'Failed to update email in authentication provider.'),
      { code: 'CONFLICT' }
    )
  }

  await prisma.member.update({ where: { id: memberId }, data: { email: newEmail } })
}
```

### 3.2 Patches to Existing Functions

#### `softDeleteFamilyMember` in `member-family.ts` — clear spouse fields on soft-delete

```typescript
export async function softDeleteFamilyMember(
  id: string,
  requestingMemberId: string
): Promise<void> {
  const familyMember = await prisma.familyMember.findUnique({
    where: { id, deletedAt: null },
  })

  if (!familyMember) {
    throw Object.assign(new Error('Family member not found'), { code: 'NOT_FOUND' })
  }

  if (familyMember.primaryMemberId !== requestingMemberId) {
    throw Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN' })
  }

  const updateData: Record<string, unknown> = { deletedAt: new Date() }

  // OQ-F: clear spouse link fields to prevent ghost re-activation after undelete
  if (familyMember.relation === 'spouse') {
    updateData.email = null
    updateData.spouseUserId = null
  }

  await prisma.familyMember.update({ where: { id }, data: updateData })
}
```

#### `softDeleteMember` in `member-crud.ts` — clear spouse fields in transaction

The current `familyMember.updateMany` cannot conditionally set different fields per row. Replace with two targeted operations inside `$transaction`:

```typescript
export async function softDeleteMember(id: string): Promise<void> {
  const existing = await prisma.member.findUnique({ where: { id } })
  if (!existing) {
    throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' })
  }

  const now = new Date()

  await prisma.$transaction([
    // Clear spouse link fields before soft-deleting the spouse FamilyMember row
    prisma.familyMember.updateMany({
      where: { primaryMemberId: id, relation: 'spouse', deletedAt: null },
      data: { email: null, spouseUserId: null, deletedAt: now },
    }),
    // Soft-delete all other family members
    prisma.familyMember.updateMany({
      where: { primaryMemberId: id, relation: { not: 'spouse' }, deletedAt: null },
      data: { deletedAt: now },
    }),
    // Soft-delete the member
    prisma.member.update({ where: { id }, data: { deletedAt: now } }),
  ])
}
```

### 3.3 Re-exports

`revokeSpouseLink`, `validateSpouseEmail`, and `changePrimaryEmail` live in `member-family.ts` and are automatically re-exported through the existing `export * from './services/member-family'` line in `member-service.ts`. No change to `member-service.ts` needed.

---

## 4. Validation Schemas — `apps/web/lib/validation/member.schema.ts`

Add at the bottom of the file:

```typescript
// ── Primary member email change (PUT /api/members/me/email) ──────────────────

export const ChangeEmailSchema = z.object({
  newEmail: z.string().email('Must be a valid email address').max(254),
})
export type ChangeEmailInput = z.infer<typeof ChangeEmailSchema>
```

No `RevokeSpouseLinkSchema` needed — `DELETE /api/members/me/spouse-link` has no request body.

---

## 5. New API Routes

### 5.1 `DELETE /api/members/me/spouse-link`

**File:** `apps/web/app/api/members/me/spouse-link/route.ts` (new)

| Attribute | Value |
|-----------|-------|
| Auth | `withAuth` — any authenticated session |
| Request body | None |
| Success | `200 { "message": "Spouse link revoked." }` |
| On no active spouse | `200` (idempotent) |
| On unexpected error | `500 { "error": "Internal server error" }` |

```typescript
import { withAuth } from '@/lib/auth/with-auth'
import { revokeSpouseLink } from '@/lib/members/member-service'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const DELETE = withAuth(async (_req, { user }) => {
  try {
    await revokeSpouseLink(user.id)
    return jsonResponse(200, { message: 'Spouse link revoked.' })
  } catch {
    return jsonResponse(500, { error: 'Internal server error' })
  }
})
```

### 5.2 `PUT /api/members/me/email`

**File:** `apps/web/app/api/members/me/email/route.ts` (new)

| Attribute | Value |
|-----------|-------|
| Auth | `withAuth` — primary sessions only |
| Request body | `{ "newEmail": "x@example.com" }` |
| Success | `200 { "message": "Email updated. Please log in again with your new email." }` |
| Spouse session | `403 { "error": "Spouse sessions cannot change the primary login email." }` |
| Invalid body | `400 { "error": { ... } }` (Zod flatten) |
| Email conflict | `409 { "error": "<message>" }` |
| Unexpected error | `500 { "error": "Internal server error" }` |

```typescript
import { withAuth } from '@/lib/auth/with-auth'
import { changePrimaryEmail } from '@/lib/members/member-service'
import { ChangeEmailSchema } from '@/lib/validation/member.schema'

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
  if (code === 'CONFLICT')  return jsonResponse(409, { error: (err as Error).message })
  console.error(err)
  return jsonResponse(500, { error: 'Internal server error' })
}

export const PUT = withAuth(async (req, { user, isSpouseSession }) => {
  if (isSpouseSession) {
    return jsonResponse(403, { error: 'Spouse sessions cannot change the primary login email.' })
  }

  let body: unknown
  try { body = await req.json() }
  catch { return jsonResponse(400, { error: 'Invalid JSON body' }) }

  const parsed = ChangeEmailSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse(400, { error: parsed.error.flatten() })
  }

  try {
    await changePrimaryEmail(user.id, parsed.data.newEmail)
    return jsonResponse(200, { message: 'Email updated. Please log in again with your new email.' })
  } catch (err) {
    return serviceErrorToResponse(err)
  }
})
```

---

## 6. Modified API Route — `GET /api/members/me`

**File:** `apps/web/app/api/members/me/route.ts`

One-line change to the GET handler:

```typescript
// Before
export const GET = withAuth(async (_req, { user }) => {
  return jsonResponse(200, { member: user })
})

// After
export const GET = withAuth(async (_req, { user, isSpouseSession }) => {
  return jsonResponse(200, { member: user, isSpouseSession })
})
```

Updated response shape:

```json
{ "member": { "...full Member row..." }, "isSpouseSession": false }
```

---

## 7. Auth Callback — `apps/web/app/api/auth/callback/route.ts`

**Function:** `resolvePostLoginPath`

After loading the `member` row by `userId`, insert a FamilyMember check before returning `/register`:

```typescript
async function resolvePostLoginPath(accessToken: string): Promise<string> {
  try {
    const { data: { user: authUser } } = await getSupabaseAdmin().auth.getUser(accessToken)
    if (!authUser || !authUser.email) return '/login'

    const member = await prisma.member.findUnique({ where: { userId: authUser.id } })

    // SPEC-19: If no registered member found, check for spouse FamilyMember match
    // before defaulting to /register. spouseUserId write happens in withAuth on first API call.
    if (!member || !member.address) {
      const spouseFm = await prisma.familyMember.findFirst({
        where: { email: authUser.email, relation: 'spouse', deletedAt: null },
      })
      if (spouseFm) return '/dashboard'
    }

    const isRegistered = member?.address != null
    return isRegistered ? '/dashboard' : '/register'
  } catch {
    return '/register'
  }
}
```

Logic guarantees:
- Normal registered member (`member.address != null`): skips spouse check, returns `/dashboard`
- Unregistered member or no Member row: checks spouse — if match found → `/dashboard`; else → `/register`
- `spouseUserId` is NOT written here — written in `withAuth` / `getCurrentMember` on first page render

---

## 8. `getCurrentMember` — `apps/web/lib/auth/get-current-member.ts`

The dashboard uses `getCurrentMember()` (direct DB call). This function must mirror `withAuth` step 2b so spouse sessions work without an HTTP round-trip.

**Updated return type:**

```typescript
export interface CurrentMemberResult {
  member: Member
  isSpouseSession: boolean
}

export async function getCurrentMember(): Promise<CurrentMemberResult | null>
```

**Step 2b addition** — insert after the email-fallback binding block, before JIT-create (same logic as `withAuth`):

```typescript
// After email fallback block — if still no member, try spouse lookup
if (!member) {
  const spouseFm = await prisma.familyMember.findFirst({
    where: { email: authUser.email, relation: 'spouse', deletedAt: null },
  })
  if (spouseFm) {
    const primaryMember = await prisma.member.findUnique({ where: { id: spouseFm.primaryMemberId } })
    if (primaryMember && primaryMember.deletedAt === null) {
      if (spouseFm.spouseUserId === null) {
        await prisma.familyMember.update({
          where: { id: spouseFm.id },
          data: { spouseUserId: authUser.id },
        })
      }
      return { member: primaryMember, isSpouseSession: true }
    }
  }
}
```

Normal members return `{ member, isSpouseSession: false }`. All callers must destructure `{ member }` from the result.

---

## 9. Server Components

### 9.1 `apps/web/app/dashboard/page.tsx`

```typescript
// Before (line 24)
const user = await getCurrentMember()
if (!user) { redirect('/login') }

// After
const result = await getCurrentMember()
if (!result) { redirect('/login') }
const { member: user, isSpouseSession } = result
```

Add spouse banner immediately after `<main>`:

```tsx
{isSpouseSession && (
  <p role="status">
    You are accessing {user.fullName ?? user.email}'s profile as their spouse.
  </p>
)}
```

### 9.2 `apps/web/app/profile/page.tsx`

The `GET /api/members/me` response now includes `isSpouseSession`. Extract it and pass as prop:

```typescript
// Update destructure (existing line ~33)
const { member, isSpouseSession }: { member: MemberRow; isSpouseSession: boolean } = await memberRes.json()
```

Add `isSpouseSession` to the `ProfileClient` invocation:

```tsx
<ProfileClient
  member={member}
  familyMembers={familyMembers}
  chapterName={chapterName}
  bio={bio}
  spouseName={spouseName}
  isSpouseSession={isSpouseSession}
/>
```

### 9.3 `apps/web/app/register/page.tsx` — `bootstrap()`

After `const { member, isSpouseSession } = await res.json()`:

```typescript
// SPEC-19: Spouse sessions must not land on registration
if (isSpouseSession) {
  router.push('/dashboard')
  return
}
```

This fires before the `setStep` call, so spouses never see the registration UI.

---

## 10. `ProfileClient.tsx` UI Changes — `apps/web/app/profile/ProfileClient.tsx`

### 10.1 Props Interface

```typescript
interface ProfileClientProps {
  member: MemberRow
  familyMembers: FamilyMember[]
  chapterName: string
  bio: string
  spouseName: string
  isSpouseSession: boolean   // new
}
```

Destructure `isSpouseSession` in the function signature.

### 10.2 Type Extension

```typescript
type FamilyMemberWithEmail = FamilyMember & {
  email?: string | null
  spouseUserId?: string | null   // new
}
```

### 10.3 State Additions

```typescript
const [revokeInFlight,   setRevokeInFlight]   = useState(false)
const [revokeError,      setRevokeError]       = useState<string | null>(null)
const [revokeConfirming, setRevokeConfirming]  = useState(false)

const [newPrimaryEmail,     setNewPrimaryEmail]     = useState('')
const [emailChangeInFlight, setEmailChangeInFlight] = useState(false)
const [emailChangeError,    setEmailChangeError]    = useState<string | null>(null)
```

### 10.4 New Handler Functions

Add after the existing `handleSave` function:

```typescript
async function handleRevokeSpouseLink() {
  setRevokeInFlight(true)
  setRevokeError(null)
  try {
    const token = await getToken()
    const res = await fetch('/api/members/me/spouse-link', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setRevokeError((body as { error?: string }).error ?? 'Revocation failed. Please try again.')
      return
    }
    // Update local state — no full refetch needed
    setFamilyMembers((prev) =>
      prev.map((fm) =>
        fm.relation === 'spouse' && !fm.deletedAt
          ? { ...fm, email: null, spouseUserId: null }
          : fm
      )
    )
    setForm((prev) => ({ ...prev, spouseEmail: '' }))
    setRevokeConfirming(false)
  } catch {
    setRevokeError('Network error. Please try again.')
  } finally {
    setRevokeInFlight(false)
  }
}

async function handleChangePrimaryEmail(e: React.FormEvent) {
  e.preventDefault()
  setEmailChangeInFlight(true)
  setEmailChangeError(null)
  try {
    const token = await getToken()
    const res = await fetch('/api/members/me/email', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ newEmail: newPrimaryEmail.trim() }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setEmailChangeError((body as { error?: string }).error ?? 'Email change failed. Please try again.')
      return
    }
    // Old credentials are now invalid — sign out and redirect
    const supabase = createSupabaseBrowser()
    await supabase.auth.signOut()
    window.location.href = '/login'
  } catch {
    setEmailChangeError('Network error. Please try again.')
  } finally {
    setEmailChangeInFlight(false)
  }
}
```

### 10.5 Computed Values in Render

Compute once at the top of the return block:

```typescript
const activeSpouseFm = familyMembers.find(
  (fm) => fm.relation === 'spouse' && !fm.deletedAt
) as FamilyMemberWithEmail | undefined
const spouseIsLinked = !!(activeSpouseFm?.spouseUserId)
```

### 10.6 Account Fieldset — Replace Existing Block

Replace the current account fieldset (which shows a static email + "contact admin" message) with:

```tsx
<fieldset>
  <legend>Account</legend>

  {isSpouseSession && (
    <p role="status">
      You are accessing {member.fullName ?? member.email}'s profile as their spouse.
    </p>
  )}

  <p><strong>Email:</strong> {member.email}</p>
  <p><strong>Role:</strong> {member.role}</p>
  <p><strong>Chapter:</strong> {chapterName}</p>

  {!isSpouseSession && (
    <section>
      <h3>Change login email</h3>
      <form onSubmit={handleChangePrimaryEmail}>
        <div>
          <label htmlFor="newPrimaryEmail">New email address</label>
          <input
            id="newPrimaryEmail"
            type="email"
            value={newPrimaryEmail}
            onChange={(e) => setNewPrimaryEmail(e.target.value)}
            required
          />
        </div>
        {emailChangeError && <p role="alert">{emailChangeError}</p>}
        <button type="submit" disabled={emailChangeInFlight || !newPrimaryEmail.trim()}>
          {emailChangeInFlight ? 'Updating...' : 'Confirm email change'}
        </button>
      </form>
    </section>
  )}
</fieldset>
```

### 10.7 Spouse Email Section — Gate on `spouseIsLinked`

Replace the current always-editable spouse email input with:

```tsx
{form.spouseName.trim() && (
  <div>
    <label htmlFor="spouseEmail">Spouse email</label>

    {spouseIsLinked ? (
      <>
        <input
          id="spouseEmail"
          type="email"
          value={activeSpouseFm?.email ?? ''}
          readOnly
          disabled
        />
        <p><em>Spouse has logged in. Email is read-only.</em></p>

        {!revokeConfirming ? (
          <button type="button" onClick={() => setRevokeConfirming(true)}>
            Change spouse login
          </button>
        ) : (
          <div>
            <p>
              This will revoke {activeSpouseFm?.email}'s access. They will no longer be
              able to log in until you link a new email.
            </p>
            <button type="button" onClick={handleRevokeSpouseLink} disabled={revokeInFlight}>
              {revokeInFlight ? 'Revoking...' : 'Confirm revocation'}
            </button>
            {' '}
            <button type="button" onClick={() => setRevokeConfirming(false)} disabled={revokeInFlight}>
              Cancel
            </button>
          </div>
        )}

        {revokeError && <p role="alert">{revokeError}</p>}
      </>
    ) : (
      <input
        id="spouseEmail"
        type="email"
        value={form.spouseEmail}
        onChange={(e) => setForm((prev) => ({ ...prev, spouseEmail: e.target.value }))}
      />
    )}
  </div>
)}
```

### 10.8 `handleSave` Guard

In `handleSave`, the spouse email update call must be skipped when the link is active (email is read-only). Replace the spouse email update block with:

```typescript
if (form.spouseName.trim()) {
  const spouseFm = familyMembers.find((fm) => fm.relation === 'spouse' && !fm.deletedAt) as FamilyMemberWithEmail | undefined
  const isLinked = !!(spouseFm?.spouseUserId)
  if (spouseFm && !isLinked) {
    await fetch(`/api/members/me/family/${spouseFm.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email: form.spouseEmail.trim() || null }),
    }).catch(() => { /* non-critical */ })
  }
}
```

### 10.9 Inline Edit Form Guard

In the family member inline edit form, spouse email input must be read-only when `spouseUserId` is set:

```tsx
{fm.relation === 'spouse' && (
  <div>
    <label htmlFor={`edit_email_${fm.id}`}>Spouse email</label>
    {(fm as FamilyMemberWithEmail).spouseUserId ? (
      <input id={`edit_email_${fm.id}`} type="email" value={editForm.email} readOnly disabled />
    ) : (
      <input
        id={`edit_email_${fm.id}`}
        type="email"
        value={editForm.email}
        onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
      />
    )}
  </div>
)}
```

---

## 11. Data Flow Diagrams

### Spouse First Login

```
Spouse logs in (spouse@example.com)
→ Supabase Auth issues JWT
→ /api/auth/callback?code=...
    resolvePostLoginPath():
      prisma.member.findUnique(userId) → null
      prisma.familyMember.findFirst(email=spouse@, relation=spouse) → found
      return '/dashboard'
→ redirect /dashboard
→ DashboardPage renders (server component):
    getCurrentMember():
      userId lookup → null
      email lookup → null
      FamilyMember lookup → found
      prisma.familyMember.update(spouseUserId = authUser.id)  ← write here
      return { member: primaryMember, isSpouseSession: true }
    render spouse banner
```

### Revoke Flow

```
Primary clicks "Change spouse login" → confirm dialog → confirm
→ DELETE /api/members/me/spouse-link
    withAuth: isSpouseSession=false, user=primaryMember
    revokeSpouseLink(user.id):
      findFirst spouse FamilyMember → found
      supabaseAdmin.auth.admin.signOut(spouseFm.spouseUserId)
      prisma.familyMember.update({ email: null, spouseUserId: null })
    → 200 OK
ProfileClient: local state updated, spouse email input becomes editable
```

### Primary Email Change

```
Primary submits new email
→ PUT /api/members/me/email { newEmail: "new@example.com" }
    withAuth: isSpouseSession=false (guard passes)
    changePrimaryEmail(user.id, "new@example.com"):
      check Member.email conflict → none
      check FamilyMember.email conflict → none
      supabaseAdmin.auth.admin.updateUserById(userId, { email: "new@example.com" })
      prisma.member.update({ email: "new@example.com" })
    → 200 OK
ProfileClient: supabase.auth.signOut() → window.location.href='/login'
```

---

## 12. Build Sequence

- [ ] **Step 1** — `prisma/schema.prisma`: Add `spouseUserId` field. Run `npx prisma db push && npx prisma generate`.
- [ ] **Step 2** — `lib/auth/with-auth.ts`: Add `AuthContext` type, update `AuthHandler`, insert step 2b, update handler invocation.
- [ ] **Step 3** — `lib/auth/get-current-member.ts`: Update return type to `CurrentMemberResult | null`, add step 2b mirror logic.
- [ ] **Step 4** — `lib/members/services/member-family.ts`: Add `getSupabaseAdmin` import. Add `validateSpouseEmail`, `revokeSpouseLink`, `changePrimaryEmail`. Patch `softDeleteFamilyMember`.
- [ ] **Step 5** — `lib/members/services/member-crud.ts`: Patch `softDeleteMember` to split updateMany and clear spouse fields in transaction.
- [ ] **Step 6** — `lib/validation/member.schema.ts`: Add `ChangeEmailSchema`.
- [ ] **Step 7** — `app/api/members/me/route.ts`: Add `isSpouseSession` to GET response.
- [ ] **Step 8** — `app/api/members/me/spouse-link/route.ts`: Create with DELETE handler.
- [ ] **Step 9** — `app/api/members/me/email/route.ts`: Create with PUT handler and spouse guard.
- [ ] **Step 10** — `app/api/auth/callback/route.ts`: Update `resolvePostLoginPath` with FamilyMember check.
- [ ] **Step 11** — `app/register/page.tsx`: Add `isSpouseSession` guard in `bootstrap()`.
- [ ] **Step 12** — `app/dashboard/page.tsx`: Destructure `{ member, isSpouseSession }` from `getCurrentMember()`, add banner.
- [ ] **Step 13** — `app/profile/page.tsx`: Extract `isSpouseSession` from `GET /api/members/me` response, pass as prop.
- [ ] **Step 14** — `app/profile/ProfileClient.tsx`: All changes in section 10.

---

## 13. Test Scenarios

| # | Scenario | Code path |
|---|----------|-----------|
| T-01 | Spouse first login via email+password | `resolvePostLoginPath` spouse check → `/dashboard`; `getCurrentMember` step 2b writes `spouseUserId`; banner rendered |
| T-02 | Spouse first login via Google OAuth | Same as T-01; OAuth token flows through same callback |
| T-03 | Spouse subsequent login | Step 2b finds match; `spouseUserId` already set — skip write |
| T-04 | Spouse sees banner on `/dashboard` | `isSpouseSession=true` from `getCurrentMember` |
| T-05 | Spouse sees banner on `/profile` | `isSpouseSession=true` from `GET /api/members/me` → ProfileClient prop |
| T-06 | Spouse edits name/phone/address | `PUT /api/members/me` uses primary `user.id` — normal save; no restriction |
| T-07 | Spouse email field is read-only after link | `spouseUserId` set; ProfileClient renders disabled input + "Change spouse login" |
| T-08 | Spouse cannot see "Change login email" form | `{!isSpouseSession && ...}` hides the form |
| T-09 | `PUT /api/members/me/email` blocked for spouse | `ctx.isSpouseSession=true` → 403 |
| T-10 | Primary revokes spouse link | DELETE → `revokeSpouseLink`; signOut; DB cleared; email input editable |
| T-11 | Revoked spouse logs in again | No FamilyMember match → JIT-create new empty Member → `/register` |
| T-12 | Linking a primary member's email as spouse | `validateSpouseEmail` → CONFLICT → 409 |
| T-13 | Primary changes login email — success | `changePrimaryEmail` updates Supabase Auth + DB; ProfileClient signs out → `/login` |
| T-14 | Primary email change — already registered | `changePrimaryEmail` finds Member conflict → 409 |
| T-15 | Normal primary login unaffected | `getCurrentMember` userId lookup succeeds in step 1; step 2b never reached |
| T-16 | Unique constraint race (two primaries same spouse) | P2002 caught in step 2b; falls through to JIT-create |
| T-17 | Soft-delete member clears spouse link | `softDeleteMember` transaction clears `email` + `spouseUserId` before `deletedAt` |
| T-18 | Soft-delete FamilyMember clears spouse link | `softDeleteFamilyMember` clears fields when `relation='spouse'` |

---

## 14. Files Not to Modify

- `app/api/payments/checkout-session/route.ts` — spouse uses primary Member row via `withAuth`; no change needed
- `app/api/members/me/family/route.ts` — GET and POST unchanged
- `app/components/nav-bar.tsx` — page-level banners only (OQ-C)
- `app/api/members/me/family/[id]/route.ts` — PUT handler unchanged; inline edit guard is client-side only
