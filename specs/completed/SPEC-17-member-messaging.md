# Feature Specification: Member Messaging

> **Spec ID:** SPEC-17-member-messaging
> **Status:** Draft
> **Author:** Utkal Nayak
> **Created:** 2026-05-17

---

## 1. Overview

### 1.1 Summary
Allows any authenticated, active OSA member to send a one-way message to another member directly from the Member Search results page (SPEC-16). Clicking "Send Message" on a search result opens an inline overlay on the same page showing the sender and recipient names and a text area. On submit, an email is dispatched to the recipient's registered address via Resend. No message is stored in the database. The overlay closes on success and the user remains on the search results page. Sender privacy is strictly protected — the recipient's email address is looked up server-side only, and the outbound email uses a noreply address with no reply-to header.

### 1.2 Goals
- [ ] Active member can send a message to any member visible in search results
- [ ] Message is composed in an inline overlay without leaving the search page
- [ ] Overlay displays TO (recipient name) and FROM (sender name) clearly
- [ ] Message body capped at 1 000 characters with a visible counter
- [ ] On send, an email is dispatched to the recipient's registered email via Resend
- [ ] Overlay closes on success; user remains on the search results page with results intact
- [ ] Sender's email address is never revealed to the recipient
- [ ] No message content is stored in the database

### 1.3 Non-Goals (Out of Scope)
- Storing messages in the database or providing an inbox (deferred)
- Reply functionality within the app — one-way only
- reply-to header in the outbound email — noreply strictly enforced
- Bulk messaging (sending to multiple members at once)
- Message attachments
- Read receipts or delivery confirmation shown to the sender
- Rate limiting or spam prevention beyond active-status guard (deferred)

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | "Send Message" in search results table renders as a button (not an anchor), triggering the inline overlay | Must Have | Amends SPEC-16 `MemberSearchClient.tsx` — replaces the `<a href="/messages/new?to=...">` stub |
| FR-02 | Clicking "Send Message" opens an inline overlay on the search results page | Must Have | No page navigation |
| FR-03 | Overlay displays: TO field (recipient full name, read-only), FROM field (logged-in user's full name, read-only), message textarea, character counter, Send button, Cancel button | Must Have | |
| FR-04 | Message textarea enforces a max of 1 000 characters; a live counter shows characters remaining | Must Have | Client-side enforcement + server-side validation |
| FR-05 | Empty message body is rejected; Send button disabled when textarea is blank | Must Have | Client-side guard |
| FR-06 | Clicking Cancel or outside the overlay closes it without sending; search results remain visible | Must Have | |
| FR-07 | On Send, a POST request is made to `POST /api/members/message` with `{ toMemberId, message }` | Must Have | |
| FR-08 | API looks up the recipient's registered email server-side by `toMemberId`; email is never sent to or from the client | Must Have | Privacy: recipient email not exposed in API response |
| FR-09 | API sends an email via Resend with: To = recipient's email, From = noreply address, no reply-to header, Subject = "[Sender Name] from OSA has sent you a message", Body = message text entered by sender | Must Have | |
| FR-10 | On successful send, overlay closes and search results remain intact | Must Have | No page reload |
| FR-11 | On send failure (API error), an error message is shown inside the overlay; overlay stays open | Must Have | User can retry or cancel |
| FR-12 | API requires a valid session token and `memberStatus = active`; returns 401/403 otherwise | Must Have | |
| FR-13 | API validates `toMemberId` exists and is not soft-deleted; returns 404 if not found | Must Have | |
| FR-14 | Only one overlay can be open at a time; opening a second "Send Message" replaces the first | Should Have | |
| FR-15 | No CSS styling — bare functional HTML only | Must Have | Consistent with project-wide styling freeze |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | Sender's email address never exposed | noreply from address; no reply-to header | Privacy policy: if sender wants to be contacted, they must include their details in the message body |
| NFR-02 | Recipient's email address never returned to client | Server-side lookup only | Email resolved in API handler, never in response body |
| NFR-03 | No message stored in DB | API fires email and returns; no Prisma write | Simplifies the feature; inbox is a future concern |
| NFR-04 | Server-side message length validation | 400 if > 1 000 chars | Client validation is not trusted |
| NFR-05 | No CSS | Unstyled HTML — no className, no Tailwind, no inline styles | |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] "Send Message" in search results is a `<button>`, not an `<a>` tag
- [ ] Clicking it opens an overlay without navigating away from the search page
- [ ] Overlay shows correct TO (recipient name) and FROM (sender name)
- [ ] Textarea rejects input beyond 1 000 characters; counter updates live
- [ ] Empty body blocks submission
- [ ] Cancel closes overlay; search results remain visible and unchanged
- [ ] Successful send closes overlay; results still visible
- [ ] Recipient receives email with correct subject and body
- [ ] Email From is noreply address; no reply-to header present
- [ ] Recipient's email does not appear anywhere in the client-side response
- [ ] `POST /api/members/message` with no token → 401
- [ ] `POST /api/members/message` with non-active caller → 403
- [ ] `POST /api/members/message` with message > 1 000 chars → 400
- [ ] `POST /api/members/message` with unknown `toMemberId` → 404

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Open overlay | Active member on search results | Click "Send Message" on a result | Overlay appears with correct TO/FROM; page not navigated |
| Cancel overlay | Overlay open | Click Cancel | Overlay closes; results intact |
| Empty send blocked | Overlay open, textarea blank | Click Send | Send button disabled / validation message |
| Over-limit blocked | Overlay open | Type 1 001 characters | Input stops at 1 000; counter shows 0 remaining |
| Successful send | Valid message typed | Click Send | Overlay closes; recipient gets email |
| Email content | Recipient's inbox | After successful send | Subject = "[Sender] from OSA has sent you a message"; body = message text |
| No reply-to | Outbound email | Inspect headers | No reply-to header; From = noreply address |
| API no token | — | POST `/api/members/message` | 401 |
| API non-active caller | Expired member token | POST `/api/members/message` | 403 |
| API message too long | Active token | POST with 1 001-char message | 400 |
| API unknown recipient | Active token | POST with invalid `toMemberId` | 404 |
| API success | Active token, valid payload | POST `/api/members/message` | 200; email sent; no DB record created |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Must Use:** Next.js App Router, TypeScript, Zod, `withAuth`, Resend (already configured)
- **Must Avoid:** CSS, Tailwind, inline styles; Prisma writes for message content; exposing sender/recipient email to client

### 4.2 Patterns to Follow
- API route follows pattern in `apps/web/app/api/messages/route.ts` (withAuth + Zod + service call)
- Active-status enforcement follows pattern established in `apps/web/app/api/members/search/route.ts`
- Email sending follows existing pattern in `apps/web/lib/messaging/resend.ts` (analyst to confirm reusable function)
- Overlay state managed inside `MemberSearchClient.tsx` — no new component file needed

### 4.3 Files to Create or Modify

| File | Action | Notes |
|------|--------|-------|
| `apps/web/app/api/members/message/route.ts` | **Create** | New POST-only route; email dispatch, no DB write |
| `apps/web/app/members/search/MemberSearchClient.tsx` | **Modify** | Replace Send Message anchor with button + add overlay UI and send logic |
| `apps/web/app/members/search/page.tsx` | **Modify** | Pass logged-in user's `fullName` as prop to `MemberSearchClient` |
| `apps/web/lib/validation/member.schema.ts` | **Modify** | Add `SendMemberMessageSchema` |

### 4.4 Files NOT to Modify
- `apps/web/app/api/messages/route.ts` — existing DB-backed messaging route; access level and behaviour unchanged
- `apps/web/lib/auth/with-auth.ts` — active-status check stays local to this feature's route

---

## 5. Open Questions

| # | Question | Status | Answer |
|---|----------|--------|--------|
| OQ-1 | What does `lib/messaging/resend.ts` currently export? Is there a reusable `sendEmail()` function, or does the analyst need to add one? | Open | Analyst to verify |
| OQ-2 | What is the `RESEND_FROM_EMAIL` env var set to? Is it `noreply@odishasociety.org`? | Open | Analyst to verify — used as the From address |
| OQ-3 | Does the `Member` record for the recipient always have a non-null `email`? (It should — email is `@unique` and required at signup) | Open | Analyst to confirm no edge case |
| OQ-4 | `page.tsx` currently calls `/api/auth/me` to get `user.fullName` for the active-status check. Can this value be passed as a prop to `MemberSearchClient` without a second fetch, or does the client need to fetch it independently? | Open | Analyst to confirm prop-passing approach |

---

## 6. Dependencies

### 6.1 Upstream Dependencies
- SPEC-16 (Member Search) — complete; this spec amends `MemberSearchClient.tsx`
- Auth infrastructure (SPEC-2) — complete
- Resend email service — already configured and in use

### 6.2 Downstream Impact
- **Messaging epic** — this feature establishes the Send Message UX entry point; any future inbox or two-way messaging spec should treat this flow as the sender-side baseline
- `profileVisibility` epic — if a future spec adds `show_email` visibility controls, the server-side email lookup in this feature must respect that flag

---

## 7. Email Template

```
From:    noreply@odishasociety.org  (RESEND_FROM_EMAIL)
Reply-To: (none)
To:      <recipient's registered email — resolved server-side>
Subject: [Sender Full Name] from OSA has sent you a message

[Message body entered by sender — plain text, max 1 000 characters]
```

---

## Agent Workflow Tracking

> This section is updated by Claude Code agents during implementation

### Phase 1: Analysis
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-17/01-analysis.md`

### Phase 2: Design
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-17/02-design.md`

### Phase 3: Implementation
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-17/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Complete
- **Artifact:** `specs/artifacts/SPEC-17/04-qa-report.md`
