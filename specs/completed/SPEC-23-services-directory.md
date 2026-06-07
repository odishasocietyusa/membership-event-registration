# Feature Specification: Teacher Directory & Discrete Messaging

> **Spec ID:** SPEC-23-teacher-directory
> **Status:** Draft
> **Author:** Antigravity
> **Created:** 2026-05-30

---

## 1. Overview

### 1.1 Summary
A dedicated directory for community teachers to showcase special classes/services they offer (such as Odissi Dance, Odissi Song, Odia Art, Odia Language, etc.). The directory allows teachers to register themselves, specify whether they support remote learning/online classes, and list details about their training and experience. 

For safety and exclusivity, the directory is readable by logged-in members, but only authenticated **active** OSA members can initiate messages to these teachers. To protect teacher privacy, contact is initiated discretely through a server-mediated form without exposing the teacher's email address on the client side. Active OSA members are distinguished with a visible "OSA Member" badge.

### 1.2 Goals
- [ ] Provide a self-registration flow for teachers to submit and manage their teaching profiles.
- [ ] Display a responsive, highly polished directory page of registered teachers.
- [ ] Support filtering by subject (Odissi Dance, Odissi Song, Odia Art, Odia Language, etc.), online class availability, and OSA membership.
- [ ] Display an "OSA Member" label on the profiles of teachers who are linked to active OSA membership records.
- [ ] Implement a discrete contact system that allows active, authenticated members to send message requests directly to teachers via email (via Resend server-side API) without revealing the teacher's email address in the UI or API payloads.
- [ ] Enforce security checks: visitors/expired members cannot send messages, and non-members cannot browse the directory (only members can view).

### 1.3 Non-Goals (Out of Scope)
- Built-in full-chat UI or continuous message threads (replies are conducted directly over regular email after the initial contact).
- Class scheduling, student booking systems, or payment integration for classes (payments and tutoring schedules are handled off-platform between teacher and student).
- Automatic moderation/validation of teacher credentials (profiles go live immediately, though admins can disable profiles).

---

## 2. Requirements

### 2.1 Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-01 | **Teacher Profile Registration**: Members can submit a form to register as a teacher, providing Name, Bio, Specializations (select multiple: Odissi Dance, Odissi Song, Odia Art, Odia Language, Other), Online Classes support (boolean), Contact Phone (optional), Social/Web links (optional), and Contact Email. | Must Have | |
| FR-02 | **Teacher Directory Page**: A clean, premium card-based directory at `/teachers` displaying all registered teachers. | Must Have | Logged-in member view only |
| FR-03 | **Subject & Remote Filtering**: Ability to filter teachers by specializations/subjects and a toggle for "Provides Online Classes". | Must Have | Client-side/Prisma query |
| FR-04 | **OSA Member Verification & Badge**: Automatically check if the teacher's email matches an active `Member` record in the database, and display a premium "OSA Member" badge. | Must Have | Dynamic db check or schema relation |
| FR-05 | **Discrete Contact Form**: Clicking "Contact Teacher" opens a modal with a contact form (Subject, Message). The form does **not** expose the teacher's email. | Must Have | Exposing email via DOM, JS variables, or API payloads is strictly prohibited. |
| FR-06 | **Active Member Authorization**: Restrict contact submission strictly to authenticated users with `memberStatus === 'active'`. Non-active or unauthenticated users receive clear prompt overlays. | Must Have | API-level and UI-level block |
| FR-07 | **Server-Mediated Email Relay**: Submitting the contact form triggers a server-side route that uses **Resend** to dispatch an email to the teacher. The sender's name and email are included in the email body as reply-to coordinates, allowing the teacher to reply directly. | Must Have | |
| FR-08 | **My Teacher Profile Panel**: Logged-in teachers can edit or delete their teaching profiles from their dashboard or profile settings. | Should Have | |
| FR-09 | **Admin Moderation**: Admins can view, edit, or delete any teacher profile via the Admin Panel. | Should Have | |

### 2.2 Non-Functional Requirements

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-01 | **Privacy (Zero Email Leak)** | Teacher's personal email is never sent to the client browser in JSON payloads or HTML. | Server-side lookup only |
| NFR-02 | **Spam Protection** | Limit a member to sending a maximum of 5 teacher contact messages per hour. | Rate limiter / sliding window in API |
| NFR-03 | **Design & Aesthetics** | Beautiful modern cards with subtle hover animations, clear typography, and elegant "OSA Member" badge styling (gold/premium look). | Adheres to modern CSS & premium rules |
| NFR-04 | **Responsiveness** | Mobile-first grid layout that scales beautifully to tablet and desktop. | Tailwind CSS grid |

---

## 3. Acceptance Criteria

### 3.1 Definition of Done
- [ ] Database schema updated via Prisma to support `TeacherProfile` and optional `TeacherContactLog` models.
- [ ] Directory page `/teachers` created, protected by member auth middleware.
- [ ] Subject specialization multi-select and Online Classes filtering works.
- [ ] Discrete contact modal implements server-mediated Resend dispatch.
- [ ] API routes verified with tests:
  - Non-members / unauthenticated users blocked from listing teachers and contacting.
  - Expired/suspended members blocked from contacting (returns `403 Forbidden`).
  - Active members can successfully send a message (returns `200 OK` and initiates Resend API call).
- [ ] Playwright E2E and Jest unit tests added to cover teacher registration, filtering, and discrete messaging flows.

### 3.2 Test Scenarios

| Scenario | Given | When | Then |
|----------|-------|------|------|
| View Directory - Public | Unauthenticated user | `GET /teachers` | Redirects to login |
| View Directory - Member | Authenticated member | `GET /teachers` | Renders cards and filtering controls |
| Register as Teacher | Logged-in member | Submit teacher registration form | Profile created, visible in directory |
| Verify Member Badge | Teacher profile email exists in `members` table with status `active` | Viewing card in `/teachers` | Card displays "OSA Member" badge |
| Discrete Messaging - Active | Authenticated active member | Submit discrete message form | API sends email via Resend, returns success. UI shows "Message sent" without exposing email. |
| Discrete Messaging - Expired | Authenticated expired member | Attempt to submit discrete message | Button disabled / API returns `403 Forbidden` |
| Discrete Messaging - Privacy Check | Inspecting network traffic | Submit contact form or fetch teacher lists | No email addresses of teachers are present in the response payloads |

---

## 4. Technical Constraints

### 4.1 Technologies
- **Frontend/Backend**: Next.js App Router (React 19)
- **Database**: PostgreSQL (via Supabase & Prisma ORM)
- **Authentication**: Supabase Auth (enforced via `withAuth()` server-side utilities)
- **Email Delivery**: Resend SDK
- **Styling**: Tailwind CSS, consistent with the existing theme

### 4.2 Content Boundary
Unlike events or news (which are handled in Sanity CMS by editorial authors), teacher profiles are member-contributed data that requires strict database relationships, edit permissions, rate-limiting, and privacy protections. Therefore, all Teacher Profiles are stored in the PostgreSQL database.

### 4.3 Proposed Database Models

#### `TeacherProfile`
```prisma
model TeacherProfile {
  id             String    @id @default(uuid()) @db.Uuid
  memberId       String?   @unique @map("member_id") @db.Uuid // Linked if registered by a member
  email          String    @unique // Contact email where messages are routed (not exposed)
  fullName       String    @map("full_name")
  bio            String    @db.Text
  specializations String[]  // Array of subjects: Odissi Dance, Odissi Song, Odia Art, Odia Language, etc.
  onlineClasses  Boolean   @default(false) @map("online_classes")
  phone          String?
  websiteUrl     String?   @map("website_url")
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  isActive       Boolean   @default(true) @map("is_active") // Admin toggle for moderation

  // Relations
  member         Member?   @relation(fields: [memberId], references: [id], onDelete: Cascade)
  contactLogs    TeacherContactLog[]

  @@map("teacher_profiles")
}
```

#### `TeacherContactLog`
```prisma
model TeacherContactLog {
  id               String   @id @default(uuid()) @db.Uuid
  teacherProfileId String   @map("teacher_profile_id") @db.Uuid
  senderMemberId   String   @map("sender_member_id") @db.Uuid
  subject          String
  body             String   @db.Text
  sentAt           DateTime @default(now()) @map("sent_at") @db.Timestamptz

  // Relations
  teacher          TeacherProfile @relation(fields: [teacherProfileId], references: [id], onDelete: Cascade)
  sender           Member         @relation(fields: [senderMemberId], references: [id])

  @@map("teacher_contact_logs")
}
```

*Note: The existing `Member` model in Prisma needs to be updated with back-relations for `TeacherProfile` and `TeacherContactLog`.*

---

## 5. Dependencies

### 5.1 Upstream Dependencies
- **Auth Layer (SPEC-2)**: Requires `withAuth()` and Supabase session management to verify user state and `memberStatus`.
- **Email Configuration**: The Resend integration must be functional with a verified domain to handle outbound teacher messages.

---

## 6. Open Questions

| Question | Status | Answer |
|----------|--------|--------|
| Should teachers be able to upload a profile picture, or should we fetch from their linked `Member` profile? | Open | Defaulting to their Member profile image or initials, with a future goal to support custom uploads. |
| Can a non-member sign up to teach, or is registration limited to OSA members? | Open | Members only can register profiles, but we allow specifying the email where they wish to receive class requests. |

---

## 7. References
- [Existing Member Messaging Spec](file:///Users/utkalnayak/Documents/code/membership-event-registration/specs/completed/SPEC-17-member-messaging.md)
- [Prisma Schema Reference](file:///Users/utkalnayak/Documents/code/membership-event-registration/apps/web/prisma/schema.prisma)

---

## Agent Workflow Tracking

### Phase 1: Analysis
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-23-teacher-directory/01-analysis.md`

### Phase 2: Design
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-23-teacher-directory/02-design.md`

### Phase 3: Implementation
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-23-teacher-directory/03-implementation.md`

### Phase 4: QA & Testing
- **Status:** Not Started
- **Artifact:** `specs/artifacts/SPEC-23-teacher-directory/04-qa-report.md`
