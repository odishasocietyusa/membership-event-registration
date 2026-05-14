# Phase 2: Architecture & Design

> **Spec:** SPEC-6-member-messaging
> **Architect Agent:** Claude Code
> **Date:** 2026-05-14
> **Status:** Ready for Review

---

## 1. Design Overview

### 1.1 Solution Summary
Add a `messages` table to Prisma, a thin service module (`message-service.ts`) that performs an "insert-first, relay-after" send, and three Next.js Route Handlers under `app/api/messages/`. The service treats the DB record as the source of truth and swallows Resend transport errors. All endpoints are protected by `withAuth()`; admin can read any message, members can read only their own. The recipient's email is fetched server-side inside the service and never returned to the client — Prisma queries explicitly project a fixed set of message-only fields.

### 1.2 Design Principles Applied
- **Least privilege / defense in depth** — application-level filtering AND DB RLS both gate access; explicit `select` clauses prevent accidental email leakage.
- **Insert-first, side-effect-after** — the audit log is the system of record; Resend is best-effort.
- **Single responsibility** — `resend.ts` owns transport, `message-service.ts` owns persistence + policy, route files own HTTP shape.
- **Match existing patterns** — mirror `member-service.ts` / `app/api/members/` layout, error codes, and test mocking style exactly.

---

## 2. Codebase Analysis

### 2.1 Existing Patterns Identified
| Pattern | Location | Will Reuse? |
|---------|----------|-------------|
| `withAuth(handler, { role })` route wrapper | `lib/auth/with-auth.ts` | Yes |
| `jsonResponse(status, body)` helper in route files | `app/api/members/route.ts` | Yes (inline copy per route file, as is convention) |
| Service functions throw `Object.assign(new Error(...), { code: 'NOT_FOUND' \| 'FORBIDDEN' \| 'CONFLICT' })` | `lib/members/member-service.ts` | Yes |
| `serviceErrorToResponse(err)` translator in route files | `app/api/members/[id]/route.ts` | Yes |
| Zod schemas in `lib/validation/<feature>.schema.ts` exporting both schema and `z.infer<>` type | `lib/validation/member.schema.ts` | Yes |
| Jest unit tests with `jest.mock('@/lib/db/prisma', …)` and typed mocks | `lib/members/member-service.test.ts` | Yes |
| Route handler tests with controllable `withAuth` mock | `app/api/admin/link-member/route.test.ts` | Yes |
| `PaginatedResult<T>` shape `{ data, total, page, limit }` | `lib/members/member-service.ts` | Yes |

### 2.2 Related Existing Code
| File | Relevance | Action |
|------|-----------|--------|
| `lib/auth/with-auth.ts` | Provides `withAuth` + `MemberRow` ctx type | Reference (import only) |
| `lib/db/prisma.ts` | Singleton Prisma client | Reference (import only) |
| `lib/members/member-service.ts` | Source of the patterns to mirror; provides member lookups | Reference (import `getMemberById`) |
| `prisma/schema.prisma` | Add `Message` model + inverse relations on `Member` | Modify |
| `app/api/members/route.ts`, `app/api/members/[id]/route.ts` | Layout / error handling templates | Reference |

### 2.3 Conventions to Follow
- **Naming:** Files kebab-case (`message-service.ts`), models PascalCase singular (`Message`), table name snake_case plural (`messages`), columns snake_case via `@map`.
- **File structure:** Each feature has `lib/<feature>/<feature>-service.ts` + tests co-located; routes under `app/api/<feature>/...`.
- **Error handling:** Services throw tagged errors (`code: 'NOT_FOUND' | 'FORBIDDEN' | 'BAD_REQUEST'`); routes translate via `serviceErrorToResponse`. Resend errors do **not** propagate — caught inside service.
- **Testing:** Jest, unit-level, with prisma mocked. Route tests mock `withAuth` and the service.

---

## 3. Architecture Design

### 3.1 Component Diagram
```
┌─────────────────────────┐
│  app/api/messages/      │
│    route.ts (GET, POST) │
│    [id]/route.ts (GET)  │
└──────────┬──────────────┘
           │ Zod-validated input + ctx.user (from withAuth)
           ▼
┌─────────────────────────────┐
│  lib/messaging/             │
│    message-service.ts       │  ← business rules: self-send 400,
│                             │     missing recipient 404,
│                             │     RBAC on read, ordering
│                             │
│  inserts row, then calls ──▶│
└──────────┬──────────────────┘
           │
           ├──▶ prisma.message.create / findMany / findUnique
           │       (explicit select — no member relation projection)
           │
           └──▶ lib/messaging/resend.ts (singleton)
                    │ try/catch — failure is logged, not thrown
                    ▼
                 Resend API (transactional email)
```

### 3.2 Data Flow — Send
```
1. POST /api/messages  { recipient_member_id, subject, body }
2. withAuth → ctx.user (sender Member)
3. Zod validate body
4. Service.sendMessage(senderId, input):
     a. if senderId === recipient_member_id → throw BAD_REQUEST
     b. recipient = getMemberById(recipient_member_id)  (excludes soft-deleted)
        if !recipient → throw NOT_FOUND
     c. message = prisma.message.create({ data, select: MESSAGE_FIELDS })
     d. try { resend.emails.send({ from, to: recipient.email, subject, html }) }
        catch (e) { console.error('Resend send failed', { messageId: message.id, error: e }) }
     e. return message  // never includes recipient.email
5. Route returns 201 (created) with message body
```

### 3.3 Key Interfaces/Contracts

```typescript
// lib/validation/message.schema.ts
export const CreateMessageSchema = z.object({
  recipientMemberId: z.string().uuid(),
  subject:           z.string().min(1).max(200),
  body:              z.string().min(1).max(10_000),
})
export type CreateMessageInput = z.infer<typeof CreateMessageSchema>

export const ListMessagesQuerySchema = z.object({
  type:  z.enum(['sent', 'received']),
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

// lib/messaging/message-service.ts
export interface MessageRow {
  id:                string
  senderMemberId:    string
  recipientMemberId: string
  subject:           string
  body:              string
  sentAt:            Date
}
// Note: NO email field. Ever.

export async function sendMessage(
  senderMemberId: string,
  senderFullName: string | null,
  input: CreateMessageInput
): Promise<MessageRow>

export async function listMessagesForMember(
  memberId: string,
  type: 'sent' | 'received',
  page: number,
  limit: number
): Promise<PaginatedResult<MessageRow>>

export async function getMessageForViewer(
  messageId: string,
  viewer: { id: string; role: 'member' | 'admin' }
): Promise<MessageRow>   // throws NOT_FOUND or FORBIDDEN

// lib/messaging/resend.ts
export interface RelayEmailInput {
  to:          string
  subject:     string
  senderName:  string   // "First Last"
  senderCity:  string   // from sender's profile address
  senderState: string   // from sender's profile address
  body:        string
}
export async function sendRelayEmail(input: RelayEmailInput): Promise<void>
```

The Prisma `select` projection that the service uses everywhere:

```typescript
const MESSAGE_SELECT = {
  id: true,
  senderMemberId: true,
  recipientMemberId: true,
  subject: true,
  body: true,
  sentAt: true,
} as const
```

---

## 4. File Structure

### 4.1 New Files to Create

| File Path | Purpose | Template/Base |
|-----------|---------|---------------|
| `apps/web/lib/messaging/resend.ts` | Resend client singleton + `sendRelayEmail` | new |
| `apps/web/lib/messaging/resend.test.ts` | Unit test for the relay helper (mock fetch / SDK) | mirrors `supabase-admin.test.ts` |
| `apps/web/lib/messaging/message-service.ts` | Persistence + policy | mirrors `member-service.ts` |
| `apps/web/lib/messaging/message-service.test.ts` | Unit tests for service | mirrors `member-service.test.ts` |
| `apps/web/lib/validation/message.schema.ts` | Zod schemas | mirrors `member.schema.ts` |
| `apps/web/app/api/messages/route.ts` | `GET` (list with `type` query), `POST` (send) | mirrors `app/api/members/route.ts` |
| `apps/web/app/api/messages/route.test.ts` | Route tests | mirrors `app/api/admin/link-member/route.test.ts` |
| `apps/web/app/api/messages/[id]/route.ts` | `GET` only | mirrors `app/api/members/[id]/route.ts` |
| `apps/web/app/api/messages/[id]/route.test.ts` | Route tests | mirrors existing patterns |
| `apps/web/supabase/migrations/<timestamp>_messages_rls.sql` (or include in Prisma migration as raw SQL) | RLS policies for `messages` | mirrors existing RLS migration if present |

### 4.2 Files to Modify

| File Path | Changes | Impact |
|-----------|---------|--------|
| `apps/web/prisma/schema.prisma` | Add `Message` model + `sentMessages` / `receivedMessages` relation arrays on `Member` | Low |
| `apps/web/package.json` | Add `resend` to `dependencies` | Low |

### 4.3 Files NOT to Touch
| File Path | Reason |
|-----------|--------|
| `apps/web/lib/auth/with-auth.ts` | Spec §4.4 forbids modification |
| `apps/web/lib/db/prisma.ts` | Spec §4.4 forbids modification |
| `apps/web/lib/members/member-service.ts` | Read-only per teammate brief (only import `getMemberById`) |

---

## 5. Implementation Plan

### 5.1 Implementation Sequence

```
Step 1: Prisma model + relations
   └── Modifies: apps/web/prisma/schema.prisma

Step 2: Add resend dep + Resend client singleton
   └── Modifies: apps/web/package.json
   └── Creates:  apps/web/lib/messaging/resend.ts, resend.test.ts

Step 3: Zod schemas
   └── Creates:  apps/web/lib/validation/message.schema.ts

Step 4: Service layer (TDD — test first)
   └── Creates:  apps/web/lib/messaging/message-service.test.ts (RED)
   └── Creates:  apps/web/lib/messaging/message-service.ts      (GREEN)

Step 5: Route handlers (TDD — test first)
   └── Creates:  apps/web/app/api/messages/route.test.ts        (RED)
   └── Creates:  apps/web/app/api/messages/route.ts             (GREEN)
   └── Creates:  apps/web/app/api/messages/[id]/route.test.ts   (RED)
   └── Creates:  apps/web/app/api/messages/[id]/route.ts        (GREEN)

Step 6: RLS migration SQL (raw SQL for Supabase)
   └── Creates:  apps/web/supabase/migrations/<ts>_messages_rls.sql
```

### 5.2 Detailed Steps

#### Step 1: Prisma model
- **Goal:** Add `messages` table with two FKs to `members`.
- **Schema snippet:**
  ```prisma
  model Message {
    id                String   @id @default(uuid()) @db.Uuid
    senderMemberId    String   @map("sender_member_id") @db.Uuid
    recipientMemberId String   @map("recipient_member_id") @db.Uuid
    subject           String
    body              String
    sentAt            DateTime @default(now()) @map("sent_at") @db.Timestamptz

    sender    Member @relation("SentMessages",     fields: [senderMemberId],    references: [id])
    recipient Member @relation("ReceivedMessages", fields: [recipientMemberId], references: [id])

    @@index([senderMemberId,    sentAt(sort: Desc)])
    @@index([recipientMemberId, sentAt(sort: Desc)])
    @@map("messages")
  }
  ```
  And on `Member`: add `sentMessages Message[] @relation("SentMessages")` and `receivedMessages Message[] @relation("ReceivedMessages")`.
- **Complexity:** Low

#### Step 2: Resend client
- **Goal:** A single source of email transport that can be cleanly mocked in tests and that never throws upward.
- **`resend.ts`:** Lazy singleton over the `resend` SDK; `sendRelayEmail` returns `void` on success and throws on transport error (so the service can catch). The service catches; the route never sees the error.
- **Email body composition:** `${senderName} from ${senderCity}, ${senderState} sent you this message via the OSA platform:\n\n${body}`. From: `process.env.RESEND_FROM_EMAIL ?? 'noreply@odishasociety.org'`.
- **Sender profile lookup:** `sendMessage` queries `prisma.profile.findUnique({ where: { memberId: senderId }, select: { firstName, lastName, address } })` to obtain name and location. `address` is a jsonb field — extract `address.city` and `address.state`. If profile is missing or address incomplete, fall back to member's email local-part for name and omit the location clause gracefully.
- **Complexity:** Low

#### Step 3: Zod schemas
- **Goal:** `CreateMessageSchema` and `ListMessagesQuerySchema` — see §3.3.
- **Complexity:** Low

#### Step 4: Service
- **Goal:** Three pure functions over Prisma with all policy in one place.
- **Key rules:**
  - `sendMessage`: self-send → `BAD_REQUEST`; recipient missing/soft-deleted → `NOT_FOUND`; insert with `select: MESSAGE_SELECT`; relay via `sendRelayEmail` in try/catch; return record.
  - `listMessagesForMember`: `where: type === 'sent' ? { senderMemberId: memberId } : { recipientMemberId: memberId }`, `select: MESSAGE_SELECT`, `orderBy: { sentAt: 'desc' }`, paginated.
  - `getMessageForViewer`: `findUnique` with `select: MESSAGE_SELECT`; if not found → `NOT_FOUND`; else if viewer.role !== 'admin' and viewer.id is neither sender nor recipient → `FORBIDDEN`; else return.
- **Complexity:** Medium

#### Step 5: Route handlers
- **`POST /api/messages`**: `withAuth` (member), Zod-validate body, call `sendMessage(user.id, user.fullName, input)`, return 201.
- **`GET /api/messages`**: `withAuth` (member), Zod-validate query (`type` required), call `listMessagesForMember`. Return `{ data, total, page, limit }`.
- **`GET /api/messages/:id`**: `withAuth` (member), call `getMessageForViewer({ id: user.id, role: user.role })`. Translate errors.
- Each route imports a local `jsonResponse` + `serviceErrorToResponse` per existing convention.
- **Complexity:** Low

#### Step 6: RLS SQL
- **Goal:** Enforce at DB level even if app logic is bypassed.
- **SQL:**
  ```sql
  ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

  CREATE POLICY messages_select_own ON messages FOR SELECT
    USING (
      EXISTS (SELECT 1 FROM members m
              WHERE m.id IN (sender_member_id, recipient_member_id)
                AND m.user_id = auth.uid())
    );

  CREATE POLICY messages_insert_self ON messages FOR INSERT
    WITH CHECK (
      EXISTS (SELECT 1 FROM members m
              WHERE m.id = sender_member_id AND m.user_id = auth.uid())
    );

  -- No DELETE policy → DELETE is denied by default once RLS is on.
  ```
  Admins use the Supabase service role (RLS-bypassing) via `supabaseAdmin`, so admin reads work naturally.
- **Complexity:** Low

---

## 6. Testing Strategy

### 6.1 Test Files to Create
| Test File | Tests For | Type |
|-----------|-----------|------|
| `lib/messaging/resend.test.ts` | Singleton construction + that errors propagate to caller | Unit |
| `lib/messaging/message-service.test.ts` | All service-level cases | Unit |
| `app/api/messages/route.test.ts` | POST + list GET HTTP shapes | Unit (route) |
| `app/api/messages/[id]/route.test.ts` | Read-by-id HTTP shapes | Unit (route) |

### 6.2 Test Cases — One Per Spec §3.2 Scenario (Plus Necessary Implicit Coverage)

| ID | Scenario (from spec §3.2 unless noted) | File | Mocked |
|----|----------------------------------------|------|--------|
| MSG-01 | **Send message**: valid recipient → DB record created, Resend called with recipient email | service.test | prisma, resend |
| MSG-02 | **Recipient email not exposed**: serialized POST response contains no `email` field and no `@` in unexpected places | route.test (POST) | service |
| MSG-03 | **Recipient email not exposed**: serialized GET-by-id response contains no `email` field | route.test ([id] GET) | service |
| MSG-04 | **View sent**: `GET /api/messages?type=sent` returns only sender-matching rows | service.test + route.test | prisma / service |
| MSG-05 | **View received**: `GET /api/messages?type=received` returns only recipient-matching rows | service.test + route.test | prisma / service |
| MSG-06 | **Cross-member read**: viewer is neither sender nor recipient (and not admin) → service throws FORBIDDEN, route returns 403 | service.test + route.test | prisma / service |
| MSG-07 | **Send to non-existent member**: recipient lookup returns null → 404 | service.test + route.test | prisma / service |
| MSG-08 | **Send to self**: sender id === recipient id → 400, no prisma.create, no Resend call | service.test + route.test | prisma, resend / service |
| MSG-09 | **Resend failure**: `sendRelayEmail` throws → DB record still returned, `console.error` called, 201 returned | service.test + route.test | prisma, resend |
| MSG-10 | (implicit) **Admin reads any message**: admin viewer bypasses sender/recipient check | service.test + route.test | prisma / service |
| MSG-11 | (implicit) **No DELETE endpoint**: importing `DELETE` from `app/api/messages/[id]/route` is `undefined` | route.test ([id]) | — |
| MSG-12 | (implicit) **Missing/invalid `type` query** → 400 | route.test (list) | service |
| MSG-13 | (implicit) **Invalid POST body (missing subject)** → 400, service not called | route.test (POST) | service |
| MSG-14 | (implicit) **Unauthenticated request** → 401 (controlled via withAuth mock) | route.test | — |
| MSG-15 | (implicit) **Send happy path returns 201 with message body shape** | route.test (POST) | service |
| MSG-16 | (implicit) **List ordering**: prisma called with `orderBy: { sentAt: 'desc' }` and pagination | service.test | prisma |
| MSG-17 | (implicit) **Email leak guard at service level**: service `select` clause excludes member relations (assert via spy on prisma.message.findMany / create call args) | service.test | prisma |

### 6.3 Test Coverage Goals
- [x] Every public service function exercised on happy path
- [x] Every spec §3.2 row mapped to at least one test
- [x] Privacy assertions are concrete string-content checks, not just shape
- [x] Resend failure branch executed
- [x] No DELETE export

### 6.4 Test Data Requirements
- `baseMessage`, `baseMember`, `adminMember`, `otherMember` fixtures local to each test file (matching the inline-fixture style used in `member-service.test.ts`).
- No DB; everything mocked.

---

## 7. Dependencies

### 7.1 New Dependencies Required
| Package | Version | Reason |
|---------|---------|--------|
| `resend` | `^4.0.0` (latest stable at time of writing) | Email relay SDK |

Environment variables:
- `RESEND_API_KEY` — required at runtime, not in tests.
- `RESEND_FROM_EMAIL` — optional, defaults to `noreply@odishasociety.org`.

### 7.2 No Other Changes
No new TypeScript / build config changes.

---

## 8. Migration / Rollback Plan

### 8.1 Breaking Changes
- [x] No breaking changes (additive schema + new endpoints).

### 8.2 Rollback Strategy
1. Revert the Prisma schema change and run `prisma db push` (drops the `messages` table). Equivalent for prod: a follow-up migration `DROP TABLE messages`.
2. Revert the RLS migration SQL.
3. Remove the new files. `withAuth`, `prisma`, and member-service are untouched, so nothing else depends on this work.

---

## 9. Design Decisions

| Decision | Options Considered | Chosen | Rationale |
|----------|-------------------|--------|-----------|
| Where to enforce "no recipient email in response" | (a) Trust route to omit it, (b) Service-layer explicit `select`, (c) Both | (b)+(c) — service uses fixed `select`; route tests assert no `email` in output | Defense in depth; service-layer guarantee survives even if a future route file changes |
| When to call Resend relative to DB write | (a) Resend first, then DB; (b) DB first, then Resend | (b) DB first | Spec §3.2 row 8: DB record must exist even if Resend fails — DB is system of record |
| Resend failure surfacing | (a) 502 to caller, (b) 201 with warning, (c) 200 silently | (c) silent 201 + `console.error` | Matches team-lead brief; user-visible failure invites retries that would double-send |
| Admin read access | (a) Separate `/api/admin/messages/:id` route, (b) Same route, role check inside service | (b) | Less surface area; admin check inlines cleanly into `getMessageForViewer` |
| Pagination defaults | Match `listMembers` defaults | `page=1, limit=50, max=100` | Consistency |
| `DELETE` endpoint | (a) Define and return 405, (b) Don't define at all | (b) Don't define | Spec §3.1: "No `DELETE /api/messages/:id` endpoint exists" — Next.js returns 405 automatically when only `GET` is exported |
| Self-send check location | Route vs. service | Service | Single source of truth; routes are thin |
| Recipient soft-delete handling | (a) Treat as not found, (b) Allow but still relay | (a) | Soft-deleted accounts are "deactivated" per `withAuth`; sending mail to them would be unexpected |
| Sender info passed to Resend | (a) Read sender from DB inside service, (b) Have route pass it in | (b) | The route already has `ctx.user` from `withAuth`; avoids a redundant DB read |
| Where to compute relay email HTML | Inside `resend.ts` | Yes | Keeps service free of transport concerns |

---

## 10. Design Review Checklist

- [x] Follows existing codebase patterns (mirrors `member-service` / `app/api/members`)
- [x] No unnecessary complexity (no thread/reply model, no rate limit, no retry logic)
- [x] Clear separation of concerns (transport vs. service vs. route)
- [x] Testable design (Prisma mocked, Resend mocked, withAuth mocked)
- [x] No breaking changes
- [x] Security: explicit `select` to prevent email leak; RLS at DB layer; self-send blocked; soft-deleted recipients rejected
- [x] Performance: composite indexes on `(senderMemberId, sentAt desc)` and `(recipientMemberId, sentAt desc)` cover the only two list queries

**Design Status:** Ready for Implementation (pending team-lead approval)

---

## Handoff to Implementation Agent

**Implementation Priority:**
1. Prisma schema change first (so `@prisma/client` types are available to the service).
2. Resend client + Zod schemas (pure, no dependencies on other new code).
3. Service with tests (TDD: write each MSG-XX test first, then implement).
4. Routes with tests (TDD again).
5. RLS SQL migration last.

**Critical Constraints:**
- The recipient's email must NEVER appear in any API response body. Enforce via Prisma `select` AND assert via route tests that the serialized response string does not include the recipient's email value.
- Resend errors are caught and logged inside the service. The route handler must never observe a Resend exception.
- No `DELETE` export from `app/api/messages/[id]/route.ts`. Add a test that imports the route module and asserts `DELETE === undefined`.
- Do not modify `lib/auth/with-auth.ts`, `lib/db/prisma.ts`, or `lib/members/member-service.ts`.

**Reference Files:**
- `apps/web/lib/members/member-service.ts` — service patterns
- `apps/web/lib/members/member-service.test.ts` — service test patterns
- `apps/web/app/api/admin/link-member/route.test.ts` — route test mock harness
- `apps/web/app/api/members/[id]/route.ts` — `serviceErrorToResponse` pattern
