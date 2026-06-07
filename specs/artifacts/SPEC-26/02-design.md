# SPEC-26 — Phase 2: Design

**Spec:** Membership Expiry Reminder Notifications
**Architect:** Claude Code
**Date:** 2026-06-06
**Status:** Complete

---

## 1. Schema Change

### 1.1 New model — `ExpiryNotice`

Add to `apps/web/prisma/schema.prisma` after the `Member` model:

```prisma
model ExpiryNotice {
  id          String   @id @default(cuid())
  memberId    String   @map("member_id") @db.Uuid
  noticeType  String   @map("notice_type")  // six_month | three_month | one_month | one_week
  expiryDate  DateTime @map("expiry_date") @db.Date
  sentAt      DateTime @default(now()) @map("sent_at")

  member      Member   @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@unique([memberId, noticeType, expiryDate])
  @@map("expiry_notices")
}
```

### 1.2 Inverse relation on `Member`

Add inside the `Member` model relations block:

```prisma
expiryNotices  ExpiryNotice[]
```

---

## 2. Route: `expiry-reminders/route.ts` (replacement)

### 2.1 Constants

```typescript
const CHECKPOINTS = [
  { days: 180, noticeType: 'six_month',   label: 'approximately 6 months' },
  { days: 90,  noticeType: 'three_month', label: 'approximately 3 months' },
  { days: 30,  noticeType: 'one_month',   label: 'approximately 1 month'  },
  { days: 7,   noticeType: 'one_week',    label: 'approximately 1 week'   },
] as const
```

### 2.2 Date window helper

For checkpoint `N` days, the look-ahead window is `[today+N, today+N+1]` (2-day, inclusive).
To keep arithmetic timezone-safe, use UTC day boundaries:

```typescript
function utcDayOffset(baseUtcMs: number, days: number): Date {
  return new Date(baseUtcMs + days * 86_400_000)
}
```

`baseUtcMs` = `startOfToday` = `new Date(Date.UTC(y, m, d))` using today's UTC date components.

Prisma filter per checkpoint:
```
expiryDate: { gte: utcDayOffset(base, N), lt: utcDayOffset(base, N + 2) }
```

### 2.3 Handler logic (pseudocode)

```
GET handler:
  1. Auth check → 401 if fails
  2. await expireOverdueMemberships()
  3. const startOfToday = startOfUTCDay(now)
  4. let emailsSent = 0, processed = 0
  5. for each CHECKPOINT:
       a. Query active members with expiryDate in [today+N, today+N+2)
       b. for each member:
            i.  Check ExpiryNotice.findUnique(memberId, noticeType, expiryDate) → skip if found
            ii. Send Resend email (plain text, names checkpoint, links /membership)
            iii. Try ExpiryNotice.create → catch + console.error on failure
            iv. emailsSent++
       c. processed += members.length
  6. Return { processed, emailsSent }
```

### 2.4 Email template (per checkpoint)

```
Subject: Your OSA membership expires in {label}

Dear {fullName},

Your OSA membership is set to expire on {expiryDateFormatted}.

Renew or upgrade your membership at: {siteUrl}/membership

If you have already renewed, please disregard this notice.

—
Odisha Society of the Americas
```

`siteUrl` = `process.env.NEXT_PUBLIC_SITE_URL ?? 'https://odishasociety.org'`

---

## 3. Route: `membership-digest/route.ts` (new)

### 3.1 Handler logic

```
GET handler:
  1. Auth check (same CRON_SECRET pattern) → 401 if fails
  2. If ADMIN_NOTIFICATION_EMAIL not set → return { skipped: true }
  3. Query active members with expiryDate in [today, today+30]
  4. If none → return { memberCount: 0 }
  5. Build plain-text list and send to ADMIN_NOTIFICATION_EMAIL
  6. Return { memberCount: N }
```

### 3.2 Email template

```
Subject: OSA: {N} membership(s) expiring in the next 30 days

The following memberships are expiring within the next 30 days:

  - {fullName ?? email} (expires {expiryDate})
  ...

Log in to the admin panel to view full member details.
```

---

## 4. `vercel.json` change

```json
{
  "crons": [
    { "path": "/api/cron/expiry-reminders",  "schedule": "0 9 * * *"   },
    { "path": "/api/cron/membership-digest", "schedule": "0 9 * * 1"   }
  ]
}
```

---

## 5. RED Test Cases

### 5.1 `expiry-reminders/route.test.ts`

Tests marked `[NEW]` are additions; existing tests preserved.

| # | Test name | Setup | Expected |
|---|-----------|-------|----------|
| 1 | `returns 401 when CRON_SECRET does not match` | wrong secret | 401; `findMany` not called |
| 2 | `returns 401 when Authorization header is missing` | no header | 401 |
| 3 | `returns 200 { processed:0, emailsSent:0 } when no members in any window` | all `findMany` → `[]` | 200, `{ processed:0, emailsSent:0 }` |
| 4 | `[NEW] sends email and creates ExpiryNotice for 7-day checkpoint` | member in day+7 window; `findUnique` → null | email sent; `expiryNotice.create` called with `noticeType:'one_week'`; `emailsSent:1` |
| 5 | `[NEW] sends email and creates ExpiryNotice for 30-day checkpoint` | member in day+30 window | `noticeType:'one_month'`; `emailsSent:1` |
| 6 | `[NEW] sends email and creates ExpiryNotice for 90-day checkpoint` | member in day+90 window | `noticeType:'three_month'`; `emailsSent:1` |
| 7 | `[NEW] sends email and creates ExpiryNotice for 180-day checkpoint` | member in day+180 window | `noticeType:'six_month'`; `emailsSent:1` |
| 8 | `[NEW] skips member when ExpiryNotice already exists (dedup)` | `findUnique` → existing row | no email send; no `create` call; `emailsSent:0` |
| 9 | `[NEW] continues and logs error when ExpiryNotice.create throws` | email send resolves; `create` throws | `emailsSent:1`; `console.error` called; no crash |

### 5.2 `membership-digest/route.test.ts`

| # | Test name | Setup | Expected |
|---|-----------|-------|----------|
| 1 | `returns 401 for bad secret` | wrong secret | 401 |
| 2 | `returns 200 with memberCount:0 when no members expiring` | `findMany` → `[]` | 200, `{ memberCount:0 }` |
| 3 | `sends admin email listing expiring members` | 2 members returned | email sent to ADMIN_NOTIFICATION_EMAIL; `{ memberCount:2 }` |
| 4 | `skips email when ADMIN_NOTIFICATION_EMAIL is not set` | env var unset | 200, `{ skipped:true }`; no email send |

---

## 6. Prisma Mock additions for tests

The `@/lib/db/prisma` mock must gain:

```typescript
expiryNotice: {
  findUnique: jest.fn(),
  create:     jest.fn().mockResolvedValue({}),
},
```

---

## 7. Implementation Sequence

1. Schema: add `ExpiryNotice` model + inverse relation → `npx prisma db push` → `npx prisma generate`
2. Write RED tests for `expiry-reminders/route.test.ts` → confirm they fail
3. Implement `expiry-reminders/route.ts` → GREEN
4. Write RED tests for `membership-digest/route.test.ts` → confirm they fail
5. Implement `membership-digest/route.ts` → GREEN
6. Update `vercel.json`
7. Run `pnpm --filter=web lint` and `tsc --noEmit`
