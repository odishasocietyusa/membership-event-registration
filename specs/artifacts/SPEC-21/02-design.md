# Phase 2: Design — SPEC-21: Self-Service Membership Upgrade

> **Spec:** `specs/active/SPEC-21-self-service-membership-upgrade.md`
> **Analysis:** `specs/artifacts/SPEC-21/01-analysis.md`
> **Status:** Complete
> **Date:** 2026-05-25

---

## 1. Schema Change — `apps/web/prisma/schema.prisma`

Add one field to `Member` after `expiryDate`:

```prisma
model Member {
  ...
  expiryDate         DateTime?           @map("expiry_date") @db.Date
  consecutiveSince   DateTime?           @map("consecutive_since") @db.Date   // SPEC-21: new
  ...
}
```

After editing, run:
```bash
cd apps/web && npx prisma db push && npx prisma generate
```

---

## 2. Seed Changes — `apps/web/prisma/seed.ts`

### 2.1 Set `isUpgradePath = true` for patron and benefactor

```typescript
// Change lines 40–41:
{ id: 'patron',     membershipType: 'patron'     as const, amountDollars: 500,  isUpgradePath: true,  isAdminOnly: false },
{ id: 'benefactor', membershipType: 'benefactor' as const, amountDollars: 1000, isUpgradePath: true,  isAdminOnly: false },
```

### 2.2 Backfill `consecutiveSince` for existing active members

Add after the `membershipFee` upsert block:

```typescript
// SPEC-21: Backfill consecutiveSince for active members that don't have it yet
const activeWithoutConsecutive = await prisma.member.findMany({
  where: { memberStatus: 'active', consecutiveSince: null },
  select: { id: true, joinDate: true },
})
for (const m of activeWithoutConsecutive) {
  await prisma.member.update({
    where: { id: m.id },
    data: { consecutiveSince: m.joinDate ?? new Date() },
  })
}
console.log(`Backfilled consecutiveSince for ${activeWithoutConsecutive.length} active members`)
```

---

## 3. Bug Fixes — Group 1 (apply before new logic)

### 3.1 `lib/memberships/constants.ts` — add patron/benefactor to `NO_EXPIRY_TYPES`

```typescript
export const NO_EXPIRY_TYPES = new Set<MembershipType>([
  'life',
  'lifeWard',
  'honoraryNoVote',
  'patron',        // SPEC-21
  'benefactor',    // SPEC-21
])
```

### 3.2 `lib/memberships/membership-service.ts` — remove patron/benefactor from `EXPIRY_DAYS`

```typescript
export const EXPIRY_DAYS: Partial<Record<MembershipType, number>> = {
  annualStudentNoVote: 365,
  annualSingle:        365,
  annualFamily:        365,
  fiveYearFamily:      365 * 5,
  // patron and benefactor removed — they are in NO_EXPIRY_TYPES
}
```

### 3.3 `lib/payments/payment-service.ts` — remove patron/benefactor from local `EXPIRY_DAYS`

```typescript
const EXPIRY_DAYS: Partial<Record<MembershipType, number>> = {
  annualStudentNoVote: 365,
  annualSingle:        365,
  annualFamily:        365,
  fiveYearFamily:      365 * 5,
  // patron and benefactor removed — they are in NO_EXPIRY_TYPES
}
```

### 3.4 `lib/payments/stripe.ts` — fix Stripe session success/cancel URLs

In `createUpgradeSession()`, change:
```typescript
// Before
success_url: `${BASE_URL}/membership/success`,
cancel_url:  `${BASE_URL}/membership`,

// After
success_url: `${BASE_URL}/dashboard`,
cancel_url:  `${BASE_URL}/dashboard`,
```

---

## 4. Service Layer Changes — `lib/payments/payment-service.ts`

All changes are in this single file. Read the file in full before editing.

### 4.1 New helper: `nextJuly4FromDate(from: Date): Date` (Superseded by SPEC-24)

> [!WARNING]
> This section is superseded by SPEC-24. The fixed July 4th fiscal year expiry model has been replaced by rolling month calculations (`addMonths` via `date-fns`). The helper `nextJuly4FromDate` was never implemented in production code and is obsolete.

### 4.2 New function: `applyUpgrade(memberId, membershipType)`

Insert after `activateMembership`. This is the upgrade-specific counterpart that does NOT reset `joinDate`, `memberStatus`, or `consecutiveSince`:

```typescript
export async function applyUpgrade(
  memberId: string,
  membershipType: MembershipType,
): Promise<void> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { expiryDate: true },
  })
  if (!member) throw new Error(`applyUpgrade: member ${memberId} not found`)

  let expiryDate: Date | null = member.expiryDate // default: preserve existing

  if (NO_EXPIRY_TYPES.has(membershipType)) {
    expiryDate = null
  } else if (membershipType === 'fiveYearFamily') {
    // NOTE: Superseded by SPEC-24 to use rolling 60-month expiry:
    // expiryDate = computeExpiryDate(membershipType, paymentDate)
    const nextJuly4 = nextJuly4FromDate(new Date())
    expiryDate = new Date(Date.UTC(nextJuly4.getUTCFullYear() + 5, 6, 4))
  }
  // Annual→annual upgrades: expiryDate unchanged (same July 4 cycle)

  await prisma.member.update({
    where: { id: memberId },
    data: { membershipType, expiryDate },
    // joinDate, memberStatus, consecutiveSince: intentionally not set
  })
}
```

### 4.3 Update `activateMembership()` — add `consecutiveSince` reset for rejoin

Replace the current implementation:

```typescript
export async function activateMembership(
  memberId: string,
  membershipType: MembershipType,
): Promise<void> {
  const current = await prisma.member.findUnique({
    where: { id: memberId },
    select: { memberStatus: true, consecutiveSince: true },
  })
  const resetConsecutive =
    !current || current.memberStatus === 'expired' || current.consecutiveSince === null

  let expiryDate: Date | null = null
  if (!NO_EXPIRY_TYPES.has(membershipType)) {
    const days = EXPIRY_DAYS[membershipType] ?? 365
    expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + days)
  }

  await prisma.member.update({
    where: { id: memberId },
    data: {
      memberStatus:    'active',
      membershipType,
      joinDate:        new Date(),
      expiryDate,
      ...(resetConsecutive && { consecutiveSince: new Date() }),
    },
  })
}
```

`resetConsecutive = true` when: first-time join (null state), or rejoining after lapse (expired). This preserves `consecutiveSince` for members renewing continuously before their expiry date.

### 4.4 Update `recordPayment()` — branch on paymentType for upgrade

Replace the activation call inside the transaction:

```typescript
if (input.status === 'completed' && input.memberId && membershipType) {
  if (input.paymentType === 'upgrade') {
    await applyUpgrade(input.memberId, membershipType)
  } else {
    await activateMembership(input.memberId, membershipType)
  }
}
```

### 4.5 Update `calculateCumulativePaid()` — filter by `consecutiveSince`

Replace the current implementation:

```typescript
export async function calculateCumulativePaid(memberId: string): Promise<number> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { consecutiveSince: true },
  })

  const records = await prisma.paymentRecord.findMany({
    where: {
      memberId,
      status: 'completed',
      paymentType: { in: ['membership', 'upgrade'] },
      membershipType: { not: null },
      ...(member?.consecutiveSince
        ? { createdAt: { gte: member.consecutiveSince } }
        : {}),
    },
  })

  type RawRecord = { membershipType: MembershipType | null; amountCents: number }
  type RawFee   = { membershipType: MembershipType }
  const types = [...new Set((records as RawRecord[]).map((r) => r.membershipType).filter(Boolean))]
  const fees  = await prisma.membershipFee.findMany({
    where: { membershipType: { in: types as MembershipType[] }, isUpgradePath: true },
    select: { membershipType: true },
  })
  const upgradePathTypes = new Set((fees as RawFee[]).map((f) => f.membershipType))

  return (records as RawRecord[])
    .filter((r) => r.membershipType && upgradePathTypes.has(r.membershipType as MembershipType))
    .reduce((sum: number, r: RawRecord) => sum + r.amountCents, 0)
}
```

Note: when `consecutiveSince` is null (pre-backfill safety net), sums all history.

### 4.6 Update `calculateUpgradeCost()` — active-only eligibility + full type support

Replace the current implementation:

```typescript
export async function calculateUpgradeCost(
  memberId: string,
  targetType: MembershipType,
): Promise<UpgradeCostResult> {
  const member = await prisma.member.findUnique({ where: { id: memberId } })
  if (!member) return { eligible: false, reason: 'Member not found', costCents: 0, autoActivate: false }

  if (member.memberStatus !== 'active') {
    return {
      eligible: false,
      reason: 'Only active members can upgrade.',
      costCents: 0,
      autoActivate: false,
    }
  }

  const targetFee = await prisma.membershipFee.findUnique({
    where: { membershipType: targetType },
  })
  if (!targetFee) {
    return { eligible: false, reason: `Unknown membership type: ${targetType}`, costCents: 0, autoActivate: false }
  }

  const targetCents     = targetFee.amountDollars * 100
  const cumulativePaid  = await calculateCumulativePaid(memberId)
  const costCents       = Math.max(0, targetCents - cumulativePaid)

  return {
    eligible: true,
    costCents,
    autoActivate: costCents === 0,
  }
}
```

Remove the old `UPGRADE_TARGET_FEE_IDS` constant and the `isRecentlyExpired` / `hasNoPriorMembership` branches entirely.

### 4.7 New function: `getUpgradeOptions(memberId)`

Add after `calculateUpgradeCost`:

```typescript
export interface UpgradeOption {
  membershipType:    MembershipType
  displayName:       string
  fullPriceDollars:  number
  upgradeFeeCents:   number
}

export interface UpgradeOptionsResult {
  cumulativePaidCents: number
  options:             UpgradeOption[]
}

const MEMBERSHIP_LABELS: Record<MembershipType, string> = {
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

export async function getUpgradeOptions(memberId: string): Promise<UpgradeOptionsResult> {
  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { memberStatus: true, membershipType: true },
  })

  const empty = { cumulativePaidCents: 0, options: [] }
  if (!member || member.memberStatus !== 'active' || !member.membershipType) return empty
  if (member.membershipType === 'honoraryNoVote') return empty

  const currentFee = await prisma.membershipFee.findUnique({
    where: { membershipType: member.membershipType },
  })
  if (!currentFee) return empty

  const cumulativePaidCents = await calculateCumulativePaid(memberId)

  const allFees = await prisma.membershipFee.findMany({
    where: { isAdminOnly: false },
    orderBy: { amountDollars: 'asc' },
  })

  const options: UpgradeOption[] = allFees
    .filter((fee) =>
      fee.membershipType !== member.membershipType &&
      fee.membershipType !== 'honoraryNoVote' &&
      fee.amountDollars > currentFee.amountDollars,
    )
    .map((fee) => ({
      membershipType:   fee.membershipType,
      displayName:      MEMBERSHIP_LABELS[fee.membershipType] ?? fee.membershipType,
      fullPriceDollars: fee.amountDollars,
      upgradeFeeCents:  Math.max(0, fee.amountDollars * 100 - cumulativePaidCents),
    }))

  return { cumulativePaidCents, options }
}
```

---

## 5. Update Stripe Session Creator — `lib/payments/stripe.ts`

Broaden `createUpgradeSession` to accept any `MembershipType`:

```typescript
import type { MembershipType } from '@prisma/client'

// Replace the hardcoded label logic
const UPGRADE_LABELS: Partial<Record<MembershipType, string>> = {
  annualStudentNoVote: 'Annual Student',
  annualSingle:        'Annual Single',
  annualFamily:        'Annual Family',
  fiveYearFamily:      'Five-Year Family',
  life:                'Life',
  lifeWard:            'Life (Ward)',
  patron:              'Patron',
  benefactor:          'Benefactor',
}

export async function createUpgradeSession(
  memberId:        string,
  memberEmail:     string,
  upgradeCostCents: number,
  targetType:      MembershipType,        // was: 'life' | 'patron' | 'benefactor'
): Promise<string> {
  const label = UPGRADE_LABELS[targetType] ?? targetType
  const session = await stripe.checkout.sessions.create({
    customer_email: memberEmail,
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency:     'usd',
          product_data: { name: `OSA ${label} Membership Upgrade` },
          unit_amount:  upgradeCostCents,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${BASE_URL}/dashboard`,  // was /membership/success
    cancel_url:  `${BASE_URL}/dashboard`,  // was /membership
    metadata: {
      memberId,
      paymentType:    'upgrade',
      membershipType: targetType,
    },
  })
  return session.url!
}
```

---

## 6. New API Route — `GET /api/memberships/upgrade-options`

**File:** `apps/web/app/api/memberships/upgrade-options/route.ts` (new)

```typescript
import { withAuth } from '@/lib/auth/with-auth'
import { getUpgradeOptions } from '@/lib/payments/payment-service'

export const dynamic = 'force-dynamic'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET = withAuth(async (_req, { user }) => {
  try {
    const result = await getUpgradeOptions(user.id)
    return jsonResponse(200, result)
  } catch (err) {
    console.error('[upgrade-options] error:', err)
    return jsonResponse(500, { error: 'Internal server error' })
  }
})
```

**Response shape:**
```json
{
  "cumulativePaidCents": 12000,
  "options": [
    { "membershipType": "fiveYearFamily", "displayName": "Five-Year Family", "fullPriceDollars": 100, "upgradeFeeCents": 8800 },
    { "membershipType": "life",           "displayName": "Life",             "fullPriceDollars": 200, "upgradeFeeCents": 18800 }
  ]
}
```

---

## 7. Update Upgrade Session Route — `app/api/payments/upgrade-session/route.ts`

Two changes: widen `UpgradeSessionSchema` and pass correct type to `calculateUpgradeCost`:

```typescript
import type { MembershipType } from '@prisma/client'

// Replace UpgradeSessionSchema
const UpgradeSessionSchema = z.object({
  targetType: z.string().min(1),  // validated as MembershipType by calculateUpgradeCost
})

export const POST = withAuth(async (req, { user }) => {
  let body: unknown
  try { body = await req.json() } catch { body = {} }

  const parsed = UpgradeSessionSchema.safeParse(body)
  if (!parsed.success) return jsonResponse(400, { error: parsed.error.flatten() })

  const { targetType } = parsed.data
  const result = await calculateUpgradeCost(user.id, targetType as MembershipType)

  if (!result.eligible) {
    return jsonResponse(400, { error: result.reason })
  }

  if (result.autoActivate) {
    await recordPayment({
      memberId:        user.id,
      status:          'completed',
      paymentType:     'upgrade',
      membershipType:  targetType as MembershipType,
      amountCents:     0,
      isAdminInitiated: false,
    })
    return jsonResponse(200, { activated: true })
  }

  const url = await createUpgradeSession(user.id, user.email, result.costCents, targetType as MembershipType)
  return jsonResponse(200, { url })
})
```

---

## 8. New Client Component — `app/components/upgrade-section.tsx`

Shared by both dashboard and profile pages. Server components fetch upgrade options and pass as props; this client component owns the interaction state.

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/auth/supabase-browser'
import type { MembershipType } from '@prisma/client'

export interface UpgradeOption {
  membershipType:   MembershipType
  displayName:      string
  fullPriceDollars: number
  upgradeFeeCents:  number
}

interface Props {
  cumulativePaidCents: number
  options:             UpgradeOption[]
}

async function getToken(): Promise<string> {
  const supabase = createSupabaseBrowser()
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

export function UpgradeSection({ cumulativePaidCents, options }: Props) {
  const router = useRouter()
  const [selected,        setSelected]        = useState<MembershipType | ''>('')
  const [confirming,      setConfirming]      = useState(false)
  const [inFlight,        setInFlight]        = useState(false)
  const [error,           setError]           = useState<string | null>(null)

  if (options.length === 0) return null

  const selectedOption = options.find((o) => o.membershipType === selected)
  const cumulativeDollars = (cumulativePaidCents / 100).toFixed(2)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedOption) return

    if (selectedOption.upgradeFeeCents === 0 && !confirming) {
      setConfirming(true)
      return
    }

    setInFlight(true)
    setError(null)

    try {
      const token = await getToken()
      const res   = await fetch('/api/payments/upgrade-session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ targetType: selectedOption.membershipType }),
      })
      const body = await res.json()

      if (!res.ok) {
        setError((body as { error?: string }).error ?? 'Upgrade failed. Please try again.')
        setConfirming(false)
        return
      }

      if ((body as { activated?: boolean }).activated) {
        router.refresh()
        return
      }

      const url = (body as { url?: string }).url
      if (url) {
        window.location.href = url
      }
    } catch {
      setError('Network error. Please try again.')
      setConfirming(false)
    } finally {
      setInFlight(false)
    }
  }

  return (
    <fieldset>
      <legend>Upgrade Membership</legend>
      <p>You have paid <strong>${cumulativeDollars}</strong> toward your membership.</p>

      <form onSubmit={handleSubmit}>
        <div>
          <label htmlFor="upgrade-select">Select a tier to upgrade to</label>
          <select
            id="upgrade-select"
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value as MembershipType)
              setConfirming(false)
              setError(null)
            }}
            required
          >
            <option value="">— Choose a tier —</option>
            {options.map((opt) => {
              const fee = opt.upgradeFeeCents === 0
                ? 'No additional fee'
                : `Upgrade fee: $${(opt.upgradeFeeCents / 100).toFixed(2)}`
              return (
                <option key={opt.membershipType} value={opt.membershipType}>
                  {opt.displayName} — ${opt.fullPriceDollars} ({fee})
                </option>
              )
            })}
          </select>
        </div>

        {confirming && selectedOption && (
          <p role="status">
            Upgrade to {selectedOption.displayName} at no additional cost. Click confirm to proceed.
          </p>
        )}

        {error && <p role="alert">{error}</p>}

        <button type="submit" disabled={!selected || inFlight}>
          {inFlight
            ? 'Processing...'
            : confirming
              ? 'Confirm Upgrade'
              : 'Upgrade'}
        </button>

        {confirming && (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={inFlight}
          >
            Cancel
          </button>
        )}
      </form>
    </fieldset>
  )
}
```

---

## 9. Dashboard Page — `app/dashboard/page.tsx`

Add upgrade options fetch and `UpgradeSection` render. The page already uses `createSupabaseServer` indirectly via `getCurrentMember`. Fetch upgrade options in parallel with `getMyMembershipStatus`:

```typescript
import { UpgradeSection } from '@/components/upgrade-section'
import type { UpgradeOptionsResult } from '@/lib/payments/payment-service'

// Inside DashboardPage():
let membership = null
let upgradeOptions: UpgradeOptionsResult = { cumulativePaidCents: 0, options: [] }

try {
  ;[membership, upgradeOptions] = await Promise.all([
    getMyMembershipStatus(user.id),
    // Import and call getUpgradeOptions directly (server component — no HTTP round-trip needed)
    import('@/lib/payments/payment-service').then((m) => m.getUpgradeOptions(user.id)),
  ])
} catch (err) {
  console.error('Failed to load membership data', err)
}
```

> **Note:** Import `getUpgradeOptions` statically at the top of the file — use a dynamic import only if the function is not available at module load time. Prefer a static import:

```typescript
import { getMyMembershipStatus } from '@/lib/memberships/membership-service'
import { getUpgradeOptions }     from '@/lib/payments/payment-service'

// then in the component:
let membership = null
let upgradeOptions: UpgradeOptionsResult = { cumulativePaidCents: 0, options: [] }
try {
  ;[membership, upgradeOptions] = await Promise.all([
    getMyMembershipStatus(user.id),
    getUpgradeOptions(user.id),
  ])
} catch (err) {
  console.error('Failed to load membership data', err)
}
```

Add `<UpgradeSection>` after the Membership fieldset:

```tsx
{membership && memberStatus === 'active' && (
  <UpgradeSection
    cumulativePaidCents={upgradeOptions.cumulativePaidCents}
    options={upgradeOptions.options}
  />
)}
```

---

## 10. Profile Page — `app/profile/page.tsx`

The profile page uses HTTP fetches (not direct service calls). Fetch upgrade options alongside the existing fetches:

```typescript
import type { UpgradeOptionsResult } from '@/lib/payments/payment-service'

// Add to the Promise.all:
const [memberRes, familyRes, upgradeRes] = await Promise.all([
  fetch(`${baseUrl}/api/members/me`,                       { headers, cache: 'no-store' }),
  fetch(`${baseUrl}/api/members/me/family`,                { headers, cache: 'no-store' }),
  fetch(`${baseUrl}/api/memberships/upgrade-options`,      { headers, cache: 'no-store' }),
])

const upgradeBody: UpgradeOptionsResult = upgradeRes.ok
  ? await upgradeRes.json()
  : { cumulativePaidCents: 0, options: [] }
```

Pass to `ProfileClient`:
```tsx
<ProfileClient
  member={member}
  familyMembers={familyMembers}
  chapterName={chapterName}
  bio={bio}
  spouseName={spouseName}
  isSpouseSession={isSpouseSession}
  upgradeOptions={upgradeBody}          // new prop
/>
```

---

## 11. Profile Client — `app/profile/ProfileClient.tsx`

### 11.1 Props update

```typescript
import type { UpgradeOptionsResult } from '@/lib/payments/payment-service'
import { UpgradeSection } from '@/components/upgrade-section'

interface ProfileClientProps {
  ...existing props...
  upgradeOptions: UpgradeOptionsResult  // new
}
```

### 11.2 Render location

Add `<UpgradeSection>` at the bottom of the return block, after all existing fieldsets, before the save button area:

```tsx
{member.memberStatus === 'active' && (
  <UpgradeSection
    cumulativePaidCents={upgradeOptions.cumulativePaidCents}
    options={upgradeOptions.options}
  />
)}
```

---

## 12. Build Sequence (strict order)

- [ ] **Step 1** — Schema: `prisma/schema.prisma` add `consecutiveSince`. Run `npx prisma db push && npx prisma generate`.
- [ ] **Step 2** — Bug fix: `lib/memberships/constants.ts` — add patron/benefactor to `NO_EXPIRY_TYPES`.
- [ ] **Step 3** — Bug fix: `lib/memberships/membership-service.ts` — remove patron/benefactor from `EXPIRY_DAYS`.
- [ ] **Step 4** — Bug fix: `lib/payments/payment-service.ts` — remove patron/benefactor from `EXPIRY_DAYS`; add `nextJuly4FromDate`; add `applyUpgrade`; update `activateMembership` (consecutiveSince); update `recordPayment` (paymentType branch); update `calculateCumulativePaid` (consecutiveSince filter); update `calculateUpgradeCost` (active-only + full type support); add `getUpgradeOptions`.
- [ ] **Step 5** — Bug fix: `lib/payments/stripe.ts` — broaden `createUpgradeSession` type; fix URLs.
- [ ] **Step 6** — Seed: `prisma/seed.ts` — patron/benefactor `isUpgradePath: true`; backfill block.
- [ ] **Step 7** — New route: `app/api/memberships/upgrade-options/route.ts`.
- [ ] **Step 8** — Update route: `app/api/payments/upgrade-session/route.ts` — widen schema.
- [ ] **Step 9** — New component: `app/components/upgrade-section.tsx`.
- [ ] **Step 10** — UI: `app/dashboard/page.tsx` — fetch `getUpgradeOptions`; render `<UpgradeSection>`.
- [ ] **Step 11** — UI: `app/profile/page.tsx` — fetch upgrade-options; pass to `ProfileClient`.
- [ ] **Step 12** — UI: `app/profile/ProfileClient.tsx` — accept `upgradeOptions` prop; render `<UpgradeSection>`.

---

## 13. Test Plan

### 13.1 Unit tests to update — `lib/payments/payment-service.test.ts`

| Test ID | Scenario | Expected |
|---------|----------|----------|
| U-01 | `calculateCumulativePaid` — member with `consecutiveSince` set; payments before and after | Only payments after `consecutiveSince` counted |
| U-02 | `calculateCumulativePaid` — `consecutiveSince = null` | All completed payments summed (backfill safety net) |
| U-03 | `calculateCumulativePaid` — patron/benefactor payments after seed fix | Both included in total (now `isUpgradePath = true`) |
| U-04 | `calculateUpgradeCost` — active member targeting `fiveYearFamily` | `eligible: true`, correct fee |
| U-05 | `calculateUpgradeCost` — expired member | `eligible: false`, reason = active-only message |
| U-06 | `calculateUpgradeCost` — no-prior-membership member | `eligible: false` |
| U-07 | `calculateUpgradeCost` — unknown `targetType` | `eligible: false`, reason = unknown type |
| U-08 | `applyUpgrade` — to life membership | `membershipType = life`, `expiryDate = null`, `joinDate` unchanged |
| U-09 | `applyUpgrade` — to `fiveYearFamily` | `expiryDate = July 4, currentYear+5 or currentYear+6` depending on today |
| U-10 | `applyUpgrade` — to `annualFamily` from `annualSingle` | `expiryDate` unchanged (same as before) |
| U-11 | `activateMembership` — member was `expired` | `consecutiveSince` set to today |
| U-12 | `activateMembership` — member was `active` (renewal) | `consecutiveSince` unchanged |
| U-13 | `activateMembership` — `patron` type | `expiryDate = null` (now in `NO_EXPIRY_TYPES`) |
| U-14 | `activateMembership` — `benefactor` type | `expiryDate = null` |
| U-15 | `recordPayment` — `paymentType = upgrade` | calls `applyUpgrade`, not `activateMembership` |
| U-16 | `recordPayment` — `paymentType = membership` | calls `activateMembership` |
| U-17 | `getUpgradeOptions` — active annualFamily ($40), paid $40 | Returns fiveYearFamily, lifeWard, life, patron, benefactor with correct fees |
| U-18 | `getUpgradeOptions` — benefactor member | Returns empty options array |
| U-19 | `getUpgradeOptions` — honoraryNoVote member | Returns empty options array |
| U-20 | `getUpgradeOptions` — expired member | Returns empty options array |

Remove existing tests that conflict with spec:
- "returns eligible=true for member expired within 1 year" — **delete** (spec: active-only)
- "excludes patron and benefactor tiers from cumulative total" — **update** (they now count after seed fix)

### 13.2 Route tests to update — `app/api/payments/upgrade-session/route.test.ts`

| Test ID | Scenario | Expected |
|---------|----------|----------|
| R-01 | POST with `targetType = fiveYearFamily` and cost > $0 | Returns Stripe URL |
| R-02 | POST with expired member | Returns 400 with active-only error |
| R-03 | DELETE (remove test) | "recently expired eligible" test removed |

### 13.3 E2E tests — `apps/web/e2e/membership-upgrade.spec.ts` (new)

| Test ID | Scenario |
|---------|----------|
| E-01 | Annual member sees upgrade section on dashboard |
| E-02 | Benefactor member does not see upgrade section |
| E-03 | $0 upgrade: confirm prompt appears, tier updated after confirm |
| E-04 | Paid upgrade: redirected to Stripe URL |
| E-05 | Upgrade section also visible on profile page |
| E-06 | Cumulative total displayed correctly |

---

## 14. Data Flow

### Paid upgrade (fee > $0)
```
Member selects tier → clicks "Upgrade"
→ POST /api/payments/upgrade-session { targetType: 'life' }
    withAuth → calculateUpgradeCost(memberId, 'life')
      → member.memberStatus === 'active' ✓
      → targetFee = { amountDollars: 200 }
      → calculateCumulativePaid() → filters by consecutiveSince → 4000 cents
      → costCents = max(0, 20000 - 4000) = 16000
      → { eligible: true, costCents: 16000, autoActivate: false }
    → createUpgradeSession(memberId, email, 16000, 'life') → Stripe URL
→ 200 { url: 'https://checkout.stripe.com/...' }
→ window.location.href = url

[Member completes Stripe payment]

→ POST /api/webhooks/stripe (checkout.session.completed)
    handleCheckoutCompleted(session):
      meta: { memberId, paymentType: 'upgrade', membershipType: 'life' }
      recordPayment({ ..., paymentType: 'upgrade', amountCents: 16000, status: 'completed' })
        → prisma.$transaction:
            paymentRecord.create(...)
            applyUpgrade(memberId, 'life')
              → member.expiryDate preserved then overwritten: expiryDate = null
              → member.update({ membershipType: 'life', expiryDate: null })
→ 200 OK

[Member returns to /dashboard — refreshed server component shows 'Life' membership]
```

### $0 upgrade
```
Member selects tier → clicks "Upgrade" → confirming=true → clicks "Confirm Upgrade"
→ POST /api/payments/upgrade-session { targetType: 'life' }
    → costCents = 0, autoActivate = true
    → recordPayment({ ..., paymentType: 'upgrade', amountCents: 0 })
        → applyUpgrade(memberId, 'life')
→ 200 { activated: true }
→ router.refresh()
```

---

## 15. Files NOT to Modify

| File | Reason |
|------|--------|
| `app/api/webhooks/stripe/route.ts` | No changes needed; routes to `handleCheckoutCompleted` which already handles `upgrade` paymentType |
| `lib/payments/webhook-handlers.ts` | No changes needed; `recordPayment` now correctly branches on paymentType |
| `app/api/memberships/me/route.ts` | No changes needed for this spec |
| Any file outside `apps/web/` | No monorepo boundary crossings |

---

## 16. Design Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| How to trigger upgrade after $0 path | `router.refresh()` vs `window.location.reload()` vs redirect | `router.refresh()` | Keeps client state; Next.js App Router best practice for re-fetching server component data |
| `applyUpgrade` vs modifying `activateMembership` | Extend existing fn with a flag / separate fn | Separate `applyUpgrade()` | `activateMembership` is called from multiple paths; touching it risks regressions. Surgical change: new function, one-line branch in `recordPayment`. |
| Where upgrade options are fetched on dashboard | HTTP fetch from client / direct service call from server component | Direct service call (`getUpgradeOptions(user.id)`) | Dashboard is a server component; no HTTP overhead, no extra auth round-trip. Profile page must HTTP-fetch (it uses the API pattern). |
| Stripe success/cancel URL | `/membership/success` (existing) / `/dashboard` | `/dashboard` | Spec requirement; membership/success page is for new memberships, not upgrades. |
| `consecutiveSince` on null safety | Reject upgrade / sum all history | Sum all history | Backfill will cover all active members; null should not occur post-backfill. Defensive fallback avoids blocking members during transition. |

---

**Design Status:** ✅ Ready for Implementation

---

## Handoff to Implementation Agent

**Implementation Priority:**
1. Steps 1–4 (schema + bug fixes in payment-service) — must be done first; all other steps depend on them
2. Steps 5–8 (stripe, seed, new routes) — can be done in any order after step 4
3. Steps 9–12 (components + UI) — do last; depend on the API routes being correct

**Critical Constraints:**
- Do NOT modify `activateMembership`'s call signature — only add the `consecutiveSince` logic internally
- The `applyUpgrade` function must fetch the member to read `expiryDate` before computing the new value — do not rely on the caller passing it
- `NO_EXPIRY_TYPES` is imported by both `membership-service.ts` and `payment-service.ts`; the fix in `constants.ts` propagates automatically once patron/benefactor are added
- Tests for "expired member eligible" must be deleted (not updated) — the old behavior is wrong per spec

**Reference Files:**
- `lib/payments/payment-service.ts` — read in full before editing; contains `calculateCumulativePaid`, `calculateUpgradeCost`, `activateMembership`, `recordPayment`
- `app/profile/ProfileClient.tsx` — study the `getToken()` pattern and state management before writing `UpgradeSection`
- `app/api/payments/upgrade-session/route.test.ts` — must be updated to remove conflicting tests
