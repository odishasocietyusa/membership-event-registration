# Work Orchestration Guide

This document defines the implementation sequence, file ownership boundaries, and coordination rules for all contributors. Read this before starting any work.

---

## Implementation Waves

Work is divided into three sequential waves. **Do not start a wave until the previous one is merged to `main`.**

```
Wave 1 ──────────────────────────────────────────────────────────
  SPEC-2: Foundation & Auth
  (everyone else is blocked until this merges)

Wave 2 ──────────────────────────────────────────────────────────
  SPEC-3: Member Module
  (SPEC-4, 5, 6 are blocked until this merges)

Wave 3 ──────────────────────────────────────────────────────────
  SPEC-4: Payments    SPEC-5: Awards    SPEC-6: Messaging    SPEC-7: CMS    SPEC-8: Obituary
  (all run in parallel on separate branches)
  Note: SPEC-8 additionally requires SPEC-7 merged before starting

Wave 4 ──────────────────────────────────────────────────────────
  Integration merge + smoke test
  (orchestrator only — do not touch)
```

SPEC-7 (CMS / Sanity) has no database dependency and can technically start after Wave 1. It is placed in Wave 3 to keep branch management simple.

---

## Spec Assignments

| Spec | Role | Branch | Blocked By |
|------|------|--------|------------|
| SPEC-2 | Backend developer | `spec/2-foundation-auth` | Nothing — start here |
| SPEC-3 | Backend developer | `spec/3-member-module` | SPEC-2 merged |
| SPEC-4 | Payment developer | `spec/4-payment-module` | SPEC-3 merged |
| SPEC-5 | Backend developer | `spec/5-awards-module` | SPEC-3 merged |
| SPEC-6 | Messaging developer | `spec/6-member-messaging` | SPEC-3 merged |
| SPEC-7 | UX / frontend developer | `spec/7-static-content-cms` | SPEC-2 merged |
| SPEC-8 | Full-stack developer | `spec/8-obituary-page` | SPEC-3 + SPEC-7 merged |
| SPEC-9 | Frontend developer | `spec/9-about-us-page` | SPEC-7 merged |

---

## File Ownership

Each spec owns the directories listed below exclusively. **Do not create or edit files in another spec's directories.** If you need something from another spec's area, raise it in a PR comment or ask the owner.

### SPEC-2 — Foundation & Auth
**Owns (write access):**
```
lib/auth/                   ← withAuth(), roles, Supabase admin client
lib/db/                     ← Prisma singleton
middleware.ts               ← page-level auth redirect
app/api/auth/               ← /api/auth/me route
prisma/schema.prisma        ← initial schema (members table only)
```

**Produces for others (read-only after merge):**
```
lib/auth/with-auth.ts       ← all other specs import this
lib/auth/roles.ts           ← role hierarchy constant
lib/db/prisma.ts            ← Prisma singleton
```

---

### SPEC-3 — Member Module
**Owns (write access):**
```
lib/members/                ← member-service.ts
app/api/members/            ← all /api/members/* routes
app/api/chapters/           ← /api/chapters route
app/api/admin/              ← /api/admin/link-member route
lib/validation/member.schema.ts
prisma/schema.prisma        ← adds members, family_members, chapters models
```

**Read-only (from SPEC-2):**
```
lib/auth/with-auth.ts
lib/db/prisma.ts
```

---

### SPEC-4 — Payment Module
**Owns (write access):**
```
lib/payments/               ← stripe.ts, webhook-handlers.ts
app/api/payments/           ← all /api/payments/* routes
app/api/webhooks/stripe/    ← /api/webhooks/stripe route
lib/validation/payment.schema.ts
prisma/schema.prisma        ← adds payments model
```

**Read-only (from SPEC-2 and SPEC-3):**
```
lib/auth/with-auth.ts
lib/db/prisma.ts
lib/members/member-service.ts   ← payment success promotes user role
```

**Reference implementation to port from:**
```
apps/api/src/modules/payments/stripe.service.ts
apps/api/src/modules/payments/payments.controller.ts
```

---

### SPEC-5 — Awards Module
**Owns (write access):**
```
lib/awards/                 ← award-service.ts
app/api/awards/             ← all /api/awards/* routes
lib/validation/award.schema.ts
prisma/schema.prisma        ← adds awards, award_names models
prisma/seed.ts              ← adds award_names seed data
```

**Read-only (from SPEC-2 and SPEC-3):**
```
lib/auth/with-auth.ts
lib/db/prisma.ts
```

---

### SPEC-6 — Member Messaging
**Owns (write access):**
```
lib/messaging/              ← message-service.ts, resend.ts
app/api/messages/           ← all /api/messages/* routes
lib/validation/message.schema.ts
prisma/schema.prisma        ← adds messages model
```

**Read-only (from SPEC-2 and SPEC-3):**
```
lib/auth/with-auth.ts
lib/db/prisma.ts
lib/members/member-service.ts   ← used to look up recipient email
```

---

### SPEC-7 — Static Content & CMS
**Owns (write access):**
```
sanity/                     ← Sanity config, schemas, GROQ queries
app/events/                 ← events pages (ISR)
app/news/                   ← news pages (ISR)
app/about/                  ← static page from Sanity
app/constitution/           ← MDX page
app/bylaws/                 ← MDX page
app/studio/                 ← embedded Sanity Studio
content/                    ← constitution.mdx, bylaws.mdx
```

**Read-only (from SPEC-2):**
```
lib/auth/with-auth.ts       ← for member-gated announcement pages
middleware.ts               ← page-level auth redirect
```

**Does not touch:**
```
lib/db/prisma.ts            ← CMS has no database writes
prisma/schema.prisma        ← no new DB models
app/api/                    ← no API routes needed
```

---

### SPEC-8 — Obituary Page
**Owns (write access):**
```
sanity/schemas/obituary.ts          ← Sanity obituary schema
app/obituaries/                     ← listing and detail pages (ISR)
lib/obituaries/                     ← comment-service.ts
app/api/obituaries/                 ← /api/obituaries/[slug]/comments routes
lib/validation/obituary-comment.schema.ts
prisma/schema.prisma                ← adds ObituaryComment model
```

**Read-only (from SPEC-2, SPEC-3, SPEC-7):**
```
lib/auth/with-auth.ts               ← for authenticated comment POST
lib/db/prisma.ts
lib/members/member-service.ts       ← to resolve commenter's full name
sanity/lib/client.ts                ← import only, do not modify
sanity/lib/queries.ts               ← extend with obituary GROQ queries
```

**Does not touch:**
```
app/events/, app/news/, app/about/  ← owned by SPEC-7
lib/payments/, lib/messaging/       ← owned by SPEC-4 and SPEC-6
```

---

## Shared Files — Coordination Required

These files are touched by multiple specs. Follow the rules below to avoid conflicts.

### `prisma/schema.prisma`
The most conflict-prone file. Rules:
- **SPEC-2** writes the initial schema (User model only)
- **SPEC-3** adds `Member`, `FamilyMember`, `Chapter` models in Wave 2
- **SPEC-4, 5, 6** each add their models in Wave 3 — on separate branches
- Each Wave 3 spec adds only its own models; do not edit models added by another spec
- The orchestrator resolves any schema merge conflicts at integration time (Wave 4)

### `prisma/seed.ts`
- **SPEC-5 only** modifies this file (adds `award_names` seed)
- All other specs must not edit `seed.ts`

### `package.json` (root and app-level)
- Add dependencies only in your own branch
- Declare them in the correct `package.json` (root for monorepo-wide tools, `apps/web/package.json` for app-level)
- Do not upgrade existing dependencies without flagging it in your PR

---

## Git Workflow

### Branch naming
```
spec/2-foundation-auth
spec/3-member-module
spec/4-payment-module
spec/5-awards-module
spec/6-member-messaging
spec/7-static-content-cms
```

### Starting your branch

**Wave 1 and 2** — branch from `main`:
```bash
git checkout main && git pull
git checkout -b spec/2-foundation-auth
```

**Wave 3** — branch from `main` only after SPEC-3 has merged:
```bash
git checkout main && git pull   # must include SPEC-3 merge commit
git checkout -b spec/4-payment-module
```

### Before opening a PR
- [ ] All tests pass (`pnpm test`)
- [ ] No TypeScript errors (`pnpm build`)
- [ ] `prisma/schema.prisma` changes are isolated to your own models
- [ ] Spec's Definition of Done (section 3.1) is fully checked off
- [ ] `specs/active/SPEC-N-*.md` Agent Workflow Tracking section is updated

### PR rules
- Target branch: `main`
- Title format: `feat(spec-N): short description`
- Link the spec file in the PR description
- At least one approval required (CODEOWNERS enforced)
- Do not merge your own PR

---

## How to Start

### Step 1 — Read your spec
Your spec file is in `specs/active/SPEC-N-*.md`. Read it fully, especially:
- Section 2: Requirements
- Section 3: Acceptance criteria and test scenarios
- Section 4: Files to create and files not to modify
- Section 7: Reference files to port logic from

### Step 2 — Read the framework
Read `specs/README.md` for the 4-phase workflow and core principles. Implementation follows RED → GREEN → REFACTOR — write a failing test before any production code.

### Step 3 — Set up locally
Follow `README.md` → Local Developer Setup, then How to Run.

### Step 4 — Create your branch and start Phase 1 (Analysis)
Write `specs/artifacts/SPEC-N-*/01-analysis.md` before touching any code. This is your contract — confirm your understanding of the spec before building.

---

## Contacts and Decisions

If you encounter a requirement that conflicts with another spec's domain, or need to extend a shared file beyond what's defined here, **do not proceed unilaterally**. Open a GitHub issue tagged `coordination` and tag `@utkaln` for a decision before writing code.
