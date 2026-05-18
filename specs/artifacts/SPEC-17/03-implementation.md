# Phase 3 Implementation — SPEC-17: Member Messaging

> **Spec:** `specs/active/SPEC-17-member-messaging.md`
> **Status:** Complete
> **Date:** 2026-05-17
> **Depends on:** `02-design.md`

---

## Files Created

### `apps/web/app/api/members/message/route.ts`
POST-only route. Enforces active-status on caller, validates body with `SendMemberMessageSchema`, guards against self-messaging, looks up recipient email server-side via Prisma, calls `sendRelayEmail()` inside try/catch (500 on failure), returns `{ ok: true }` on success. No Prisma write anywhere.

---

## Files Modified

### `apps/web/lib/validation/member.schema.ts`
Appended `SendMemberMessageSchema` (`toMemberId: uuid`, `message: string 1–1000 chars`) and `SendMemberMessageInput` type.

### `apps/web/app/members/search/page.tsx`
Added `senderName` derivation (`user?.fullName ?? user?.email ?? 'OSA Member'`) using the `user` object already in scope from the `/api/auth/me` call. Passes it as a prop to `<MemberSearchClient senderName={senderName} />`.

### `apps/web/app/members/search/MemberSearchClient.tsx`
Five targeted edits:
1. Added `useRef` to the React import
2. Added `{ senderName }` prop to the component signature
3. Added overlay state: `dialogRef`, `overlayRecipientId`, `overlayRecipientName`, `messageText`, `sending`, `sendError`
4. Added `openOverlay()`, `closeOverlay()`, `handleSend()` handlers after `handleSubmit`
5. Replaced `<a href="/messages/new?to=...">Send Message</a>` with `<button onClick={() => openOverlay(...)}>Send Message</button>`
6. Added `<dialog>` element with TO/FROM fields, textarea (maxLength=1000), character counter, Send/Cancel buttons — placed before the closing `</>`

---

## Deviations from Design

None.

---

## Build Verification

```
tsc --noEmit  →  zero errors in modified files
pnpm build --filter=web  →  Tasks: 1 successful
```

---

## Acceptance Criteria Coverage

| Criterion | Covered by |
|-----------|-----------|
| "Send Message" is a button, not an anchor | `MemberSearchClient.tsx:281` |
| Clicking opens overlay without navigation | `openOverlay()` → `dialogRef.current?.showModal()` |
| Overlay shows TO / FROM | `<dialog>:318-319` |
| Textarea max 1 000 chars + live counter | `maxLength={1000}` + `{1000 - messageText.length}` |
| Empty body blocks Send | `disabled={!messageText.trim() \|\| sending}` |
| Cancel closes overlay, results intact | `closeOverlay()` resets state without touching search results |
| Escape key closes overlay | `<dialog onClose={closeOverlay}>` — browser handles Escape natively |
| Send calls correct API | `POST /api/members/message` with Bearer token |
| Recipient email never in client response | `select: { email: true }` — only used server-side in `sendRelayEmail` |
| Email sent with correct subject/body | `sendRelayEmail({ subject: \`${senderName} from OSA has sent you a message\` ... })` |
| noreply enforced, no reply-to | `sendRelayEmail` in `resend.ts` — hardcoded, not configurable by caller |
| On success overlay closes, results stay | `closeOverlay()` called after 200 response |
| On failure error shown in overlay | `setSendError(...)` — overlay stays open |
| API 401 / 403 / 400 / 404 / 500 | `route.ts` — all status codes handled |
