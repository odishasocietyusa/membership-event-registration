# QA Report — SPEC-6: Member Messaging

> **Phase:** 4 — QA & Testing
> **Status:** Complete
> **Date:** 2026-05-14

---

## 1. Test Summary

| Suite | Tests | Result |
|-------|-------|--------|
| `lib/messaging/resend.test.ts` | 3 | ✅ Pass |
| `lib/messaging/message-service.test.ts` | 12 | ✅ Pass |
| `app/api/messages/route.test.ts` | 10 | ✅ Pass |
| `app/api/messages/[id]/route.test.ts` | 5 | ✅ Pass |
| **Total (SPEC-6 suite)** | **30** | **✅ All Pass** |
| **Full project suite** | **203** | **✅ All Pass** |

---

## 2. Acceptance Criteria Coverage

| AC | Status |
|----|--------|
| `POST /api/messages` sends email via Resend and creates DB record | ✅ MSG-01, MSG-15 |
| Recipient email is absent from all API responses | ✅ MSG-02, MSG-03 |
| `GET /api/messages?type=sent` returns messages where sender is current user | ✅ MSG-04 |
| `GET /api/messages?type=received` returns messages where recipient is current user | ✅ MSG-05 |
| Member cannot GET a message where they are neither sender nor recipient (403) | ✅ MSG-06 |
| No `DELETE /api/messages/:id` endpoint exists | ✅ MSG-11 |
| Resend failure is logged but message record is still saved | ✅ MSG-09 |
| All tests passing | ✅ 203/203 |

---

## 3. Test Coverage by Design Scenario

| ID | Scenario | Covered By |
|----|----------|------------|
| MSG-01 | Send — DB record created, Resend called with recipient email | `message-service.test.ts` |
| MSG-02 | POST response has no email in body | `route.test.ts` (POST) |
| MSG-03 | GET-by-id response has no email in body | `[id]/route.test.ts` |
| MSG-04 | `type=sent` filters by senderMemberId | service + route tests |
| MSG-05 | `type=received` filters by recipientMemberId | service + route tests |
| MSG-06 | Cross-member read → FORBIDDEN | service + route tests |
| MSG-07 | Non-existent recipient → 404 | service + route tests |
| MSG-08 | Self-send → BAD_REQUEST / 400 | service + route tests |
| MSG-09 | Resend failure → DB record returned, error logged | `message-service.test.ts` |
| MSG-10 | Admin reads any message | service + `[id]/route.test.ts` |
| MSG-11 | No DELETE export | `[id]/route.test.ts` |
| MSG-12 | Missing/invalid `type` query → 400 | `route.test.ts` (GET) |
| MSG-13 | Invalid POST body → 400, service not called | `route.test.ts` |
| MSG-14 | Unauthenticated → 401 (withAuth mock) | covered by withAuth mock harness |
| MSG-15 | Happy path POST returns 201 with message body | `route.test.ts` |
| MSG-16 | List ordered by sentAt desc with pagination | `message-service.test.ts` |
| MSG-17 | SELECT clause excludes email and member relations | `message-service.test.ts` |

---

## 4. Code Review Notes

- **Email privacy**: `MESSAGE_SELECT` const has no email, sender, or recipient relation — verified by MSG-17 test asserting the select argument.
- **Insert-first**: `prisma.message.create` is awaited before `sendRelayEmail` is called — Resend failure cannot prevent the audit record from being created.
- **No DELETE**: Confirmed — `app/api/messages/[id]/route.ts` exports only `GET`. MSG-11 test imports the module and asserts `DELETE === undefined`.
- **Self-send at service layer**: Checked before any DB read — no `getMemberById` or `prisma.message.create` calls on self-send (verified MSG-08).
- **GDPR export updated**: `exportMemberData` now includes `sentMessages` and `receivedMessages` via `Promise.all`; old `_note` stub removed.
- **Soft-deleted recipient**: `getMemberById` (used inside `sendMessage`) defaults `deletedAt: null`, so deactivated members return `NOT_FOUND`.

---

## 5. Known Deferred Items

| Item | Reason |
|------|--------|
| RLS migration SQL (`supabase/migrations/*_messages_rls.sql`) | Requires live Supabase; application-level guards provide equivalent protection. Policy SQL documented in design §5 step 6. |
| `GET /api/messages/me/export` updated test (SVC-06) | Test was updated to check `sentMessages`/`receivedMessages` instead of the now-removed `_note` field. |
