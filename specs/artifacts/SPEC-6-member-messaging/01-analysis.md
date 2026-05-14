# Phase 1: Requirement Analysis

> **Spec:** SPEC-6-member-messaging
> **Analyst Agent:** Claude Code
> **Date:** 2026-05-14
> **Status:** Complete

---

## 1. Spec Understanding

### 1.1 Feature Summary
Member-to-member private messaging via a server-side email relay. The sender identifies the recipient by `member_id` only; the API looks up the recipient's email server-side, sends a transactional email through Resend from the OSA address (`noreply@odishasociety.org`) with the sender's name and member ID inside the email body, and persists the exchange in a new `messages` table. Senders and recipients can list and read their own messages. Messages are an immutable audit trail (no DELETE).

### 1.2 Key Objectives
1. Prevent email address leakage between members (recipient email never appears in any API response).
2. Provide a durable audit log of every relayed message (DB record is the source of truth, even if Resend fails).
3. Enforce per-member access control through both application logic and DB RLS.

---

## 2. Requirements Breakdown

### 2.1 Extracted Requirements

| ID | Requirement | Type | Complexity | Dependencies |
|----|-------------|------|------------|--------------|
| REQ-01 | `POST /api/messages` accepts `{ recipient_member_id, subject, body }`, persists to DB, relays via Resend | Functional | Med | SPEC-2, SPEC-3 |
| REQ-02 | Recipient email looked up server-side via `members` table; never returned in any response | Functional / Privacy | Low | REQ-01 |
| REQ-03 | `GET /api/messages?type=sent` returns messages where `sender_member_id = current user` | Functional | Low | REQ-01 |
| REQ-04 | `GET /api/messages?type=received` returns messages where `recipient_member_id = current user` | Functional | Low | REQ-01 |
| REQ-05 | `GET /api/messages/:id` returns the message if and only if requester is sender or recipient (otherwise 403) | Functional | Low | REQ-01 |
| REQ-06 | Admin can `GET` any message (and list all) | Functional | Low | REQ-05 |
| REQ-07 | No `DELETE` endpoint exists on `/api/messages/:id` | Functional | Low | — |
| REQ-08 | Resend send failure → log via `console.error`, still persist record, return 200 | Functional / NFR | Med | REQ-01 |
| REQ-09 | Sender cannot send to themselves → 400 | Functional | Low | REQ-01 |
| REQ-10 | Sending to a non-existent (or soft-deleted) member → 404 | Functional | Low | REQ-01 |
| REQ-11 | `messages` table added to Prisma schema with FKs to `members` and `sent_at` auto timestamp | Functional / Data | Low | — |
| REQ-12 | RLS policy: `SELECT sender_member_id = auth.uid() OR recipient_member_id = auth.uid()`; `INSERT` authenticated; no `DELETE` | NFR / Security | Med | REQ-11 |
| REQ-13 | Zod schemas validate inputs (`recipient_member_id` UUID; subject/body length bounds) | Functional | Low | — |
| REQ-14 | Resend client encapsulated as a singleton in `lib/messaging/resend.ts` | Functional | Low | — |

### 2.2 Implicit Requirements
- [ ] Add `resend` SDK as a dependency (`apps/web/package.json`).
- [ ] Add `RESEND_API_KEY` and (optionally) `RESEND_FROM_EMAIL` env vars (the latter defaulting to `noreply@odishasociety.org`).
- [ ] Use `withAuth()` (member role minimum) on all endpoints.
- [ ] All endpoints must return JSON via the same `jsonResponse` helper pattern used in `app/api/members/`.
- [ ] The `messages` Prisma model needs a relation name pair (sender / recipient both FK to `Member`) so Prisma can disambiguate the two relations.
- [ ] On the `Member` model, add inverse relation arrays (`sentMessages`, `receivedMessages`).
- [ ] `GET /api/messages` without a `type` param (or with an invalid value) → 400.
- [ ] Listing must be ordered (newest first by `sent_at desc`) for deterministic test output.
- [ ] Soft-deleted members: reject sends to them (FR-02 implies the recipient must be active). Sender's own `deletedAt` is already covered by `withAuth` (returns 401).
- [ ] The `auth.uid()` referenced by the spec for RLS is the Supabase user UUID; `messages.sender_member_id` / `recipient_member_id` are `members.id`. The RLS policy must therefore JOIN through `members.user_id` (or equivalently: compare `sender_member_id IN (SELECT id FROM members WHERE user_id = auth.uid())`).

### 2.3 Edge Cases Identified
1. **Resend throws / returns error** → catch, `console.error`, return 200 with DB record. Test must cover this branch.
2. **Recipient member is soft-deleted (`deletedAt != null`)** → treat as not found, return 404.
3. **Recipient member has `email = null`** → impossible at schema level (`email` is `NOT NULL UNIQUE`), so we trust the constraint.
4. **Sender sends to self** → 400 short-circuit before any DB write or Resend call.
5. **`type` query param missing or anything other than `sent` | `received`** → 400.
6. **Empty subject/body** → 400 via Zod `min(1)`.
7. **Pagination of message lists** — not in spec; for v1 return up to N most recent (cap at 100) ordered by `sent_at desc`.
8. **Concurrent send races** — none meaningful; each request creates its own row.
9. **Member auth row has `userId = null`** (admin-pre-created not yet logged in) — `withAuth` upgrades this on first login, so by the time a request reaches us `user.id` is set.

---

## 3. Scope Validation

### 3.1 In Scope (Confirmed)
- `POST /api/messages` (relay + persist)
- `GET /api/messages?type=sent|received` (list own)
- `GET /api/messages/:id` (read own; 403 otherwise; admin can read any)
- `messages` table + RLS policies
- Resend integration (with non-blocking failure)
- Zod input validation

### 3.2 Out of Scope (Confirmed)
- Real-time / WebSocket delivery
- Message threading or replies
- In-app or push notifications
- Rate limiting (deferred until abuse observed)
- `DELETE` endpoint (forbidden by spec; never to be added)
- Updating GDPR export to include messages — spec §5.2 says SPEC-3 must include them, but the spec scopes only the messages module to this work. Out of scope here.

### 3.3 Ambiguous (Needs Clarification)
- All open questions in the spec have been resolved. The team-lead briefing further clarifies "Resend failure → log and return 200" and "no rate limit at launch." No blocking questions remain.

---

## 4. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Recipient email accidentally leaked in response body | Low | High | Explicit `select` in Prisma queries that excludes member relations; route tests assert no `email` substring in serialized responses |
| Resend failure crashes the request and prevents DB record creation | Med | High | DB insert occurs first, Resend call wrapped in try/catch, error logged, 200 returned |
| Prisma migration churn — two FKs from `messages` to `Member` need named relations | Med | Low | Use `@relation("SentMessages", ...)` / `@relation("ReceivedMessages", ...)` and add inverse arrays on `Member` |
| RLS policy uses `auth.uid()` but FK references `members.id`, not `user_id` | Med | Med | Express RLS as `EXISTS (SELECT 1 FROM members WHERE id = sender_member_id AND user_id = auth.uid())` or equivalent |
| Resend SDK not in dependencies — adds a new package | Low | Low | Add as `dependencies` in `apps/web/package.json`; mock in unit tests so test runs don't require real network |
| `RESEND_API_KEY` not set in env — service must still allow DB write | Med | Low | Resend client singleton no-ops (or throws caught error) when key absent; tests mock the client entirely |

---

## 5. Questions for User

> No blocking questions. All open items from the spec have been resolved by the spec itself or the team-lead briefing.

---

## 6. Recommendations

### 6.1 Suggested Additions
- Add ordering (`sent_at desc`) and a small page-size cap (default 50, max 100) to list endpoints — predictable behavior, cheap to implement, prevents accidental huge result sets. This matches the pattern already in `listMembers`.
- Index `(sender_member_id, sent_at desc)` and `(recipient_member_id, sent_at desc)` on the `messages` table for fast list queries.

### 6.2 Suggested Simplifications
- Treat the admin "view all" capability (FR-09) as a thin variant of `GET /api/messages/:id` (admin role bypasses the sender/recipient check) — no new endpoint. For admin list-all, allow `GET /api/messages?type=all` admin-only. Keep this small.

### 6.3 Technical Concerns
- The Resend `noreply@odishasociety.org` From address must be a verified domain in Resend before live email will deliver — operational concern, not a code concern. Document in implementation phase but don't block on it (tests mock Resend).

---

## 7. Analysis Summary

### Ready for Design Phase?
- [x] All requirements understood
- [x] No blocking questions remain
- [x] Scope is clearly defined
- [x] Risks are acceptable

**Recommendation:** Proceed to Design

---

## Handoff to Design Agent

**Key Context for Designer:**
1. **Privacy is the dominant constraint.** Every Prisma query in the messages service must use an explicit `select` that excludes the `Member` relation, or must `select` a hand-picked set of message fields only. Route tests must assert the recipient's email never appears in the serialized response.
2. **DB record is the source of truth.** Insert into `messages` first; call Resend after; swallow Resend errors with `console.error`. Tests cover the failure branch by mocking Resend to throw.
3. **`auth.uid()` ≠ `members.id`.** RLS policy must bridge through `members.user_id`. Application-level checks (sender or recipient or admin) live in the route handler.
4. **Two FKs to `Member`** require named Prisma relations and matching inverse arrays on `Member`.
5. **Follow existing patterns**: `withAuth`, `jsonResponse`, Zod schemas in `lib/validation/`, services in `lib/<feature>/`, route tests that mock `withAuth` and the service layer.
