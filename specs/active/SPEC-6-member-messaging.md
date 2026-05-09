# Feature Specification: Member Messaging

> **Spec ID:** SPEC-6-member-messaging
> **Status:** Draft
> **Author:** Utkal Nayak

---

## 1. Overview

### 1.1 Summary
Implement private member-to-member messaging via a server-side email relay. Members can send messages to other members without either party's email address being exposed. The API looks up the recipient's email server-side, relays the message via Resend, and logs the exchange in the `messages` table.

### 1.2 Goals
- [ ] Member can send a message to another member by member ID (not email)
- [ ] Recipient's email is never exposed to the sender or in API responses
- [ ] Message relayed via Resend transactional email
- [ ] Full message log stored in `messages` table
- [ ] Member can view their own sent and received messages
- [ ] No messages can be deleted (audit trail)

### 1.3 Non-Goals (Out of Scope)
- Real-time messaging or websockets (email relay only)
- Message threading or replies (flat log)
- Push or in-app notifications

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | Authenticated member can send a message to another member | Must Have | By `recipient_member_id` |
| FR-02 | Recipient email is resolved server-side from `members` table | Must Have | Never returned to client |
| FR-03 | Message is relayed via Resend to recipient's email | Must Have | |
| FR-04 | Message is logged in `messages` table after successful send | Must Have | |
| FR-05 | Member can view messages they sent | Must Have | `GET /api/messages?type=sent` |
| FR-06 | Member can view messages they received | Must Have | `GET /api/messages?type=received` |
| FR-07 | Member cannot view messages between other members | Must Have | RLS enforced |
| FR-08 | Messages cannot be deleted via API | Must Have | No DELETE endpoint |
| FR-09 | Admin can view all messages | Should Have | For moderation |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Recipient email privacy | Never in API response | Server-side only lookup |
| NFR-02 | RLS on `messages` table | SELECT sender OR recipient only | Enforced at DB layer |
| NFR-03 | Resend delivery | Best-effort with error logging | Non-blocking — log failure but don't error the request |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] `POST /api/messages` sends email via Resend and creates DB record
- [ ] Recipient email is absent from all API responses
- [ ] `GET /api/messages?type=sent` returns messages where sender is current user
- [ ] `GET /api/messages?type=received` returns messages where recipient is current user
- [ ] Member cannot `GET` a message where they are neither sender nor recipient (403)
- [ ] No `DELETE /api/messages/:id` endpoint exists
- [ ] Resend failure is logged but message record is still saved
- [ ] All tests passing

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Send message | Authenticated member, valid `recipient_member_id` | `POST /api/messages` with subject + body | DB record created, Resend called with recipient email |
| Recipient email not exposed | Message sent | `GET /api/messages/:id` | Response contains no email field |
| View sent messages | Authenticated member | `GET /api/messages?type=sent` | Returns only messages sent by current user |
| View received messages | Authenticated member | `GET /api/messages?type=received` | Returns only messages received by current user |
| Cross-member read | Member A | `GET /api/messages/:id` where they are neither sender nor recipient | Returns 403 |
| Send to non-existent member | Authenticated member | `POST /api/messages` with invalid `recipient_member_id` | Returns 404 |
| Send to self | Authenticated member | `POST /api/messages` with own id as recipient | Returns 400 |
| Resend API failure | Resend returns error | `POST /api/messages` | DB record still created, error logged, 200 returned |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Resend SDK for email delivery, Prisma, Zod, `withAuth()` from SPEC-2
- **Must Avoid:** Exposing `members.email` in any response body

### 4.2 Patterns to Follow
- Look up recipient email inside the API route handler, never pass it to the client
- Log Resend failures with `console.error` but do not fail the request — the message log is the source of truth
- RLS policy: `SELECT sender_member_id = auth.uid() OR recipient_member_id = auth.uid()`

### 4.3 Files/Modules to Create
- `prisma/schema.prisma` — add `messages` model
- `lib/messaging/message-service.ts` — send + query logic
- `lib/messaging/resend.ts` — Resend client singleton
- `app/api/messages/route.ts` — GET (with `type` query param), POST
- `app/api/messages/[id]/route.ts` — GET only (no DELETE)
- `lib/validation/message.schema.ts` — Zod schemas

### 4.4 Files NOT to Modify
- `lib/auth/with-auth.ts`
- `lib/db/prisma.ts`

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- SPEC-2 (foundation-auth) — `withAuth()` required
- SPEC-3 (member-module) — `members` table must exist to look up recipient email

### 5.2 Downstream Impact
- GDPR export in SPEC-3 must include sent and received messages

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should the sender's name appear in the relay email, or should it be sent from a generic OSA address? | Resolved | Sent from OSA address (noreply@odishasociety.org). Sender's name and member ID appear in the email body. Recipient replies to OSA, not directly to sender. |
| Is there a rate limit on how many messages a member can send per day? | Resolved | No rate limit at launch. Revisit if abuse becomes an issue. |

---

## 7. References

- [`docs/osa-architecture.md`](../../docs/osa-architecture.md) — `messages` schema, RLS policies, member message relay data flow

---

## Agent Workflow Tracking

### Phase 1: Analysis
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-6-member-messaging/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-6-member-messaging/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-6-member-messaging/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-6-member-messaging/04-qa-report.md`
