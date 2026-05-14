# Phase 3: Implementation

> **Spec:** SPEC-6-member-messaging
> **Date:** 2026-05-14
> **Status:** Complete

---

## Files Created

| File | Purpose |
|------|---------|
| `apps/web/lib/validation/message.schema.ts` | Zod schemas: `CreateMessageSchema`, `ListMessagesQuerySchema` |
| `apps/web/lib/messaging/resend.ts` | Resend singleton + `sendRelayEmail()` |
| `apps/web/lib/messaging/message-service.ts` | `sendMessage()`, `listMessagesForMember()`, `getMessageForViewer()` |
| `apps/web/app/api/messages/route.ts` | `POST` (send), `GET` (list with `type` query) |
| `apps/web/app/api/messages/[id]/route.ts` | `GET` only — no `DELETE` export |

## Files Modified

| File | Change |
|------|--------|
| `apps/web/lib/members/member-service.ts` | Added `sentMessages` + `receivedMessages` to `MemberExport` and `exportMemberData()` |

## Key Implementation Notes

- **Insert-first**: `prisma.message.create()` runs before `sendRelayEmail()`. DB record is the source of truth.
- **Resend errors swallowed**: `sendRelayEmail` call is wrapped in try/catch inside `sendMessage()`; `console.error` logs the failure with `messageId`.
- **Email privacy**: `MESSAGE_SELECT` const excludes all member relation fields. No email field can leak from any service function.
- **No DELETE**: `app/api/messages/[id]/route.ts` exports only `GET`. Next.js returns 405 automatically for other methods.
- **GDPR export updated**: `exportMemberData` now fetches `sentMessages` and `receivedMessages` via `Promise.all` and includes them in the bundle.
- **Sender info**: `sendMessage` looks up sender's `address` from `prisma.member.findUnique` to pass `city`/`state` to the relay email; falls back gracefully if address is null.
