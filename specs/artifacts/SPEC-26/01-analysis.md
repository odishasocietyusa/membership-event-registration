# SPEC-26 — Phase 1: Analysis

**Spec:** Membership Expiry Reminder Notifications
**Analyst:** Claude Code
**Date:** 2026-06-06
**Status:** Complete

---

## 1. Existing Code Audit

### `app/api/cron/expiry-reminders/route.ts` — two confirmed bugs

| Bug | Location | Impact |
|-----|----------|--------|
| Rolling window — no dedup | `shouldNotify = daysLeft <= 7 \|\| daysLeft <= 30` | Members receive an email **every day** they are within a 30-day or 7-day window |
| Only 2 checkpoints | Same line | 6-month and 3-month notices never sent |
| Admin digest bundled with daily job | Lines 67–79 | Admin receives a digest every single day; correct behaviour is weekly on Mondays |

### Existing test coverage
- `route.test.ts` covers: 401 auth, 200 with zero members, member + admin email sent
- Mocks: `prisma.member.findMany`, `prisma.member.updateMany` (for `expireOverdueMemberships`), `resend`
- No coverage for deduplication or any individual checkpoint

---

## 2. Functional Requirements Map

| FR | Requirement | Implementation path |
|----|-------------|---------------------|
| FR-01 | 4 checkpoints: 180 / 90 / 30 / 7 days | `CHECKPOINTS` constant array; loop per checkpoint per member |
| FR-02 | `ExpiryNotice` table, unique on `(memberId, noticeType, expiryDate)` | New Prisma model; Prisma enforces DB-level unique constraint |
| FR-03 | 2-day look-ahead window per checkpoint | For checkpoint N: query `expiryDate IN [today+N, today+N+1]` |
| FR-04 | Skip if `ExpiryNotice` row exists | `prisma.expiryNotice.findUnique` before send |
| FR-05 | Insert `ExpiryNotice` after successful send; log failure, don't crash | Try/catch around `prisma.expiryNotice.create`; log error, continue |
| FR-06 | Plain-text email naming the checkpoint; link to `/membership` | Inline text template per notice type |
| FR-07 | `expireOverdueMemberships()` preserved at start | First call in handler |
| FR-08 | Weekly admin digest at `/api/cron/membership-digest`, Mondays 9am | New route + new `vercel.json` entry |
| FR-09 | Renewal link `/membership` in email body | Included in plain-text template |

---

## 3. Edge Cases & Risks

### 3.1 Date arithmetic / timezone
- `expiryDate` is `@db.Date` — stored as date-only in Postgres.
- Prisma returns it as a `Date` object at midnight UTC.
- All date arithmetic in the route must use UTC methods (`getUTCFullYear`, etc.) or construct comparison dates as start-of-UTC-day to avoid off-by-one errors from local timezone offsets.
- **Decision:** construct window bounds as `new Date(Date.UTC(y, m, d))` so the comparison is timezone-safe.

### 3.2 Renewal cycle
- When a member renews, `expiryDate` changes to a new date (expiryDate_B).
- Old `ExpiryNotice` rows keyed to `expiryDate_A` are untouched.
- New checkpoint checks against `expiryDate_B` will find no existing rows → fresh cycle. ✅ Handled by design.

### 3.3 Exact 2-day window calculation
- For checkpoint N (days), the Prisma query filter:
  ```
  expiryDate >= startOfDay(today + N)
  expiryDate <  startOfDay(today + N + 2)
  ```
  This catches members whose expiry is exactly N or N+1 days away. The dedup table prevents double-sending if both days fire.

### 3.4 `expireOverdueMemberships` mock in tests
- The existing mock covers `prisma.member.updateMany`. New tests must also add `prisma.expiryNotice.findUnique` and `prisma.expiryNotice.create` to the Prisma mock.

### 3.5 Atomicity
- Spec says best-effort: insert `ExpiryNotice` after email send succeeds, catch and log DB errors.
- Risk: if `ExpiryNotice.create` throws, the member will be re-emailed the next day. This is a known acceptable tradeoff (FR-05).

### 3.6 `SITE_URL` env var for membership link
- The email must link to `{siteUrl}/membership`. The route uses `process.env.NEXT_PUBLIC_SITE_URL` (or a fallback) — must verify this env var is available at cron runtime (server-side; `NEXT_PUBLIC_` prefix is fine on server).
- **Fallback:** `'https://odishasociety.org'`.

### 3.7 Query structure — avoid N × M queries
- Naive approach: for each of 4 checkpoints, run one `member.findMany`. That's 4 queries per cron run.
- This is acceptable at current member scale. No optimization needed.

---

## 4. No Blocking Questions

All open questions in the spec are resolved:
- Admin digest: weekly, Monday 9am, separate endpoint `/api/cron/membership-digest`
- Renewal link: `/membership`

---

## 5. Files to Touch (confirmed)

| File | Action |
|------|--------|
| `apps/web/prisma/schema.prisma` | Add `ExpiryNotice` model + `expiryNotices` relation on `Member` |
| `apps/web/app/api/cron/expiry-reminders/route.ts` | Replace with 4-checkpoint logic |
| `apps/web/app/api/cron/expiry-reminders/route.test.ts` | Replace with checkpoint + dedup tests |
| `apps/web/app/api/cron/membership-digest/route.ts` | New — weekly admin digest |
| `apps/web/app/api/cron/membership-digest/route.test.ts` | New — unit tests |
| `apps/web/vercel.json` | Add second cron entry for digest |
