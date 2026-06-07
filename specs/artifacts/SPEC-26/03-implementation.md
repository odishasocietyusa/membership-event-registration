# SPEC-26 — Phase 3: Implementation Log

**Spec:** Membership Expiry Reminder Notifications
**Implementer:** Claude Code
**Date:** 2026-06-06
**Status:** Complete

---

## Changes Made

### 1. `apps/web/prisma/schema.prisma`
- Added `ExpiryNotice` model with composite unique `(memberId, noticeType, expiryDate)`
- Added `expiryNotices ExpiryNotice[]` inverse relation on `Member`
- Ran `npx prisma db push` + `npx prisma generate`

### 2. `apps/web/app/api/cron/expiry-reminders/route.ts` (replaced)
- `CHECKPOINTS` constant array drives all business logic — 4 entries: 180/90/30/7 days
- UTC-safe date arithmetic via `utcDayOffset(baseMs, days)` helper — avoids off-by-one from local timezone offsets
- Per checkpoint: 2-day look-ahead window, dedup via `expiryNotice.findUnique`, send via Resend, best-effort `expiryNotice.create` with `console.error` on DB failure
- Admin digest block removed (moved to weekly endpoint)
- `expireOverdueMemberships()` preserved as first call

### 3. `apps/web/app/api/cron/expiry-reminders/route.test.ts` (replaced)
- 9 tests: 2 auth, 1 empty, 4 checkpoint-specific, 1 dedup, 1 create-throws-continues
- Mocks `@/lib/memberships/membership-service` directly for `expireOverdueMemberships`
- `setupSingleCheckpointMember` helper positions a member in exactly one checkpoint window

### 4. `apps/web/app/api/cron/membership-digest/route.ts` (new)
- Weekly admin digest: queries active members expiring within 30 days, sends plain-text list
- Short-circuits with `{ skipped: true }` if `ADMIN_NOTIFICATION_EMAIL` not set
- Returns `{ memberCount: 0 }` without sending if no members found

### 5. `apps/web/app/api/cron/membership-digest/route.test.ts` (new)
- 4 tests: auth, empty, admin email sent, skipped when env var absent

### 6. `apps/web/vercel.json`
- Added second cron entry: `{ "path": "/api/cron/membership-digest", "schedule": "0 9 * * 1" }`

---

## Files Modified

| File | Action |
|------|--------|
| `apps/web/prisma/schema.prisma` | Added `ExpiryNotice` model + inverse relation on `Member` |
| `apps/web/app/api/cron/expiry-reminders/route.ts` | Replaced |
| `apps/web/app/api/cron/expiry-reminders/route.test.ts` | Replaced |
| `apps/web/app/api/cron/membership-digest/route.ts` | Created |
| `apps/web/app/api/cron/membership-digest/route.test.ts` | Created |
| `apps/web/vercel.json` | Added digest cron entry |
