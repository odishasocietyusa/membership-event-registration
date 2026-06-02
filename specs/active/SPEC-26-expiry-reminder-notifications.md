# Feature Specification: Membership Expiry Reminder Notifications

> **Spec ID:** SPEC-26-expiry-reminder-notifications
> **Status:** Draft
> **Author:** Utkal Nayak
> **Created:** 2026-05-30

---

## 1. Overview

### 1.1 Summary
Members with time-limited memberships (annual and five-year) must receive automated email reminders at four checkpoints before their membership expires: 6 months, 3 months, 1 month, and 1 week out. The existing cron route (`/api/cron/expiry-reminders`) only handles 30-day and 7-day windows and has no deduplication — it would email members every day they fall within a window. This spec replaces that logic with a four-checkpoint system backed by a new `ExpiryNotice` audit table that prevents duplicate sends.

### 1.2 Goals
- [ ] Send one email per checkpoint per membership cycle (6 months, 3 months, 1 month, 1 week before expiry)
- [ ] Guarantee no duplicate emails via a DB-backed deduplication table
- [ ] Naturally handle renewals — notices are keyed to the member's current `expiryDate`, so a renewed member starts a fresh cycle
- [ ] Keep the Vercel daily cron + Resend infrastructure unchanged

### 1.3 Non-Goals (Out of Scope)
- In-app / push notifications
- Admin summary digest email (can be preserved as-is or deferred)
- SMS notifications
- Notifications for lifetime / patron / benefactor / honorary members

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Four reminder checkpoints: 180 days, 90 days, 30 days, and 7 days before `expiryDate` | Must Have | Each checkpoint sends at most one email per member per expiry cycle |
| FR-02 | A new `ExpiryNotice` table tracks sent notices keyed on `(memberId, noticeType, expiryDate)` — the unique triple prevents duplicate sends | Must Have | `noticeType`: `six_month`, `three_month`, `one_month`, `one_week` |
| FR-03 | The daily cron job checks each member whose expiry falls within a 2-day look-ahead window for each checkpoint (today ≤ expiry ≤ today + checkpoint + 1) — the ±1 day buffer tolerates a single missed cron run | Must Have | 2-day window only; not a rolling window |
| FR-04 | Before sending, the handler checks `ExpiryNotice` for an existing record matching `(memberId, noticeType, expiryDate)` — if found, skip | Must Have | |
| FR-05 | After a successful Resend send, insert the `ExpiryNotice` record atomically with the email send (best-effort; log failure, do not crash) | Must Have | |
| FR-06 | Email content must name the specific checkpoint ("Your membership expires in approximately 6 months / 3 months / 1 month / 1 week") and link to the profile/membership page | Must Have | Plain-text email; no HTML template yet |
| FR-07 | The `expireOverdueMemberships()` call must be preserved at the start of the handler | Must Have | Already present in the existing route |
| FR-08 | A separate weekly cron endpoint `GET /api/cron/membership-digest` sends the admin a digest of all active members expiring within the next 30 days | Must Have | Runs Mondays at 9am — separate from the daily reminder cron |
| FR-09 | Reminder emails must include a direct link to `/membership` | Must Have | Plain-text: "Renew or upgrade your membership at: {siteUrl}/membership" |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Daily reminder cron unchanged | `0 9 * * *` | `vercel.json` gains one additional cron entry for the weekly digest |
| NFR-04 | Weekly admin digest cron | `0 9 * * 1` (Monday 9am) | New entry in `vercel.json` |
| NFR-02 | A single missed cron run must not cause a missed notification | 2-day look-ahead window + dedup table | |
| NFR-03 | Test coverage for deduplication logic and each checkpoint window | Jest unit tests | |

---

## 3. Schema Change

New Prisma model in `apps/web/prisma/schema.prisma`:

```prisma
model ExpiryNotice {
  id          String   @id @default(cuid())
  memberId    String   @map("member_id")
  noticeType  String   @map("notice_type")   // six_month | three_month | one_month | one_week
  expiryDate  DateTime @map("expiry_date") @db.Date
  sentAt      DateTime @default(now()) @map("sent_at")

  member      Member   @relation(fields: [memberId], references: [id], onDelete: Cascade)

  @@unique([memberId, noticeType, expiryDate])
  @@map("expiry_notices")
}
```

`Member` model gains the inverse relation:
```prisma
expiryNotices  ExpiryNotice[]
```

---

## 4. Acceptance Criteria

### 4.1 Definition of Done
- [ ] `ExpiryNotice` model added and schema pushed
- [ ] Existing `route.ts` replaced with four-checkpoint logic
- [ ] Deduplication verified: running the cron twice on the same day does not send duplicate emails
- [ ] Renewal case verified: member who renews gets a fresh notification cycle for the new `expiryDate`
- [ ] All existing and new unit tests pass
- [ ] `vercel.json` cron schedule unchanged

### 4.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| 6-month notice, first run | Member expiryDate = today + 180 days; no ExpiryNotice row | Cron runs | Email sent; ExpiryNotice row created |
| 6-month notice, second run | ExpiryNotice row exists for `(memberId, six_month, expiryDate)` | Cron runs again same day | No email sent |
| Member renews mid-cycle | Member had `expiryDate` = A, received one_month notice; now has new `expiryDate` = B | Cron runs | Fresh notices sent for B; old notices for A untouched |
| Lifetime member | `expiryDate = null` | Cron runs | Member excluded from query; no notice sent |
| No expiring members | No members in any window | Cron runs | Returns `{ processed: 0, emailsSent: 0 }` |
| Missing CRON_SECRET | Authorization header absent or wrong | GET request | Returns 401; no DB or email calls |

---

## 5. Technical Constraints

### 5.1 Technologies
- **Must Use:** Resend (`lib/messaging/resend.ts` pattern), Prisma, Vercel Cron
- **Must Avoid:** HTML email templates — plain text only until design is delivered

### 5.2 Patterns to Follow
- Checkpoint windows defined as a constant array — easy to add/remove checkpoints in future
- One Prisma transaction per member: `ExpiryNotice.create` + email send in sequence; rollback notice row if email throws
- Reuse `FROM` / `RESEND_FROM_EMAIL` env var pattern from existing route

### 5.3 Files to Create / Modify

| File | Change |
|------|--------|
| `apps/web/prisma/schema.prisma` | Add `ExpiryNotice` model and inverse relation on `Member` |
| `apps/web/app/api/cron/expiry-reminders/route.ts` | Replace with four-checkpoint logic + `/membership` link in email body |
| `apps/web/app/api/cron/expiry-reminders/route.test.ts` | Replace with tests covering all checkpoints and deduplication |
| `apps/web/app/api/cron/membership-digest/route.ts` | New — weekly admin digest listing members expiring within 30 days |
| `apps/web/app/api/cron/membership-digest/route.test.ts` | New — unit tests for digest endpoint |
| `apps/web/vercel.json` | Add second cron entry `{ "path": "/api/cron/membership-digest", "schedule": "0 9 * * 1" }` |

### 5.4 Files NOT to Modify
- `apps/web/lib/messaging/resend.ts` — email transport unchanged
- `apps/web/lib/memberships/membership-service.ts` — `expireOverdueMemberships` unchanged

---

## 6. Dependencies

### 6.1 Upstream Dependencies
- SPEC-24 (Rolling Expiry) — not a hard blocker. The cron will notify correctly as long as `expiryDate` is set. Members created before SPEC-24 may have approximate day-based expiry dates, but the notifications will still fire correctly.

### 6.2 Downstream Impact
- None. This is an additive background job with no user-facing UI.

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should the admin summary digest email be preserved? | Resolved | Yes — weekly digest on Mondays via a separate cron endpoint `/api/cron/membership-digest` at `0 9 * * 1`; lists all members expiring within the next 30 days |
| What is the membership renewal / upgrade URL to include in email body? | Resolved | `/membership` — the existing membership upgrade page |

---

## 7. References

- `apps/web/app/api/cron/expiry-reminders/route.ts` — existing implementation to be replaced
- `apps/web/vercel.json` — cron schedule (`0 9 * * *`)
- `apps/web/lib/messaging/resend.ts` — Resend email transport
- SPEC-24 — rolling expiry (sets `expiryDate` correctly for new payments)
- SPEC-21 — self-service upgrade (the CTA in reminder emails will link to the upgrade flow)

---

## Agent Workflow Tracking

### Phase 1: Analysis
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-26/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-26/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-26/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-26/04-qa-report.md`
