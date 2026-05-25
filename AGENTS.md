# OSA Community Platform — Agent Rules of Engagement & Guidelines
## 🧭 Unified Agent Control Center

This file serves as the single source of truth for **all AI agents** (including *Claude Code* and *Antigravity / agy*) interacting with the OSA Community Platform codebase. It consolidates our engineering principles, repository architecture, setup commands, and safety boundaries.

---

## ⚠️ Core Engineering Principles

All AI agents must unconditionally adhere to these five operational principles:

1. **Think before you type. Name confusion out loud.**
   State your assumptions before writing code. If a request is ambiguous, STOP and ask for clarification—do not guess and proceed. If a simpler path exists, raise it. Confusion left unspoken becomes a bug in production.
2. **Simplicity is the goal. Complexity is the failure.**
   Write the absolute minimum code required to solve the problem. Avoid speculative abstractions, generic wrappers, or "future-proofing" that was not explicitly requested.
3. **Surgical changes only. Touch only what is assigned.**
   Modify only the files and directories strictly required for the target task. Do not refactor neighboring code, fix formatting outside your changes, or touch other modules.
4. **Make it verifiable before you make it work.**
   Convert requirements into concrete, executable targets (such as unit/integration tests) *before* writing production code.
5. **TDD RED → GREEN → REFACTOR cycle.**
   Write a failing test (RED). Implement the minimal code to make it pass (GREEN). Refactor clean code without modifying behaviour (REFACTOR). Never commit code that lacks test coverage.

---

## 📋 Spec-Driven Development Workflow

All new features and functional modifications must be implemented through our strict **4-phase spec-driven workflow**. No code may be written in the main codebase without completing the preceding phases.

```
User Spec ──▶ Analyst (01-analysis.md) ──▶ Architect (02-design.md) ──▶ Implementer (Code + 03-implementation.md) ──▶ QA (04-qa-report.md)
```

### Phase Details & Output Files
- **Phase 1: Analyst** → `specs/artifacts/[spec-id]/01-analysis.md`
  - Parse the spec, map out functional/non-functional requirements, identify edge cases, risks, and raise blocking questions.
- **Phase 2: Architect** → `specs/artifacts/[spec-id]/02-design.md`
  - Map files to create/modify, plan schema changes, design service-layer interfaces, and specify the RED test cases.
- **Phase 3: Implementer** → Code Modifications + `specs/artifacts/[spec-id]/03-implementation.md`
  - Execute the implementation sequence using strict RED-GREEN-REFACTOR test-driven loops. Keep a log of edits.
- **Phase 4: QA / Tester** → `specs/artifacts/[spec-id]/04-qa-report.md`
  - Run the full suite of unit/E2E tests, audit security rules, measure performance constraints, and verify all acceptance criteria are met.

> [!IMPORTANT]
> **Sequential Gatekeeping**: An agent must never execute a phase unless the previous phase's artifact is present, complete, and approved by the human operator.

---

## 🗂️ Monorepo Directory Boundaries & Ownership

This is a Turborepo monorepo managed with **pnpm**. To prevent branch conflicts, specs strictly own directories. **Never write to a directory owned by another active spec.**

```
membership-event-registration/
├── specs/                          # 📋 Spec files and agent artifacts
│   ├── active/                     # Active specs currently being implemented
│   ├── completed/                  # Archived, successfully implemented specs
│   └── artifacts/                  # Agent deliverables (analysis, design, etc.)
├── apps/
│   └── web/                        # Next.js App Router (port 3000)
│       ├── app/
│       │   ├── api/                # Backend route handlers (Auth, Members, Stripe, etc.)
│       │   └── (pages)/            # Frontend UI routes
│       ├── lib/                    # Service layer (auth/, db/, memberships/, payments/)
│       ├── e2e/                    # Playwright E2E tests
│       ├── prisma/                 # PostgreSQL schema and seed script
│       └── sanity/                 # Sanity CMS config, schemas, queries
├── packages/                       # Shared Tailwind, TypeScript, ESLint, and types
├── scripts/                        # Management, token, and report scripts
└── docs/                           # Architectural references & design docs
```

---

## 🛠️ Stack & Commands Reference

Always run commands using `pnpm` from the correct working directory.

### Environment & Startup
- Start Local Supabase: `supabase start`
- Get Local Supabase Status & Keys: `supabase status`
- Stop Supabase Stack: `supabase stop` or `supabase stop --no-backup`

### Database & ORM (Prisma)
Always run Prisma commands from inside `apps/web/` or with proper filters.
- **Push Schema (Preferred for Dev)**: `npx prisma db push` (Do not use `prisma migrate dev` for local schema edits).
- **Run Database Seed**: `npx prisma db seed`
- **Prisma Client Generation**: `npx prisma generate`
- **Open Prisma Studio (Visual DB)**: `npx prisma studio`
- **Reset Local Database (⚠️ Destructive)**: `npx prisma migrate reset`

### Local Development Server
- Run Web & API Dev Server: `pnpm dev` or `pnpm dev --filter=web`

### Testing Suites
- **Playwright E2E Tests**: `pnpm --filter=web test:e2e` (Ensure Supabase is running beforehand).
- **Interactive Playwright UI**: `pnpm --filter=web test:e2e:ui`
- **Single Playwright Spec**: `cd apps/web && npx playwright test e2e/memberships.spec.ts`
- **Jest Unit Tests**: `pnpm --filter=web test`
- **Jest Coverage**: `pnpm --filter=web test:coverage`

### Authentication JWT Retrieval (Manual API Testing)
Generate temp Supabase Auth tokens for testing:
- Create temp user and output JWT: `./scripts/get-auth-token.sh`
- Use existing credentials: `./scripts/get-auth-token.sh user@example.com password`

---

## ⚡ Database & Testing Troubleshooting Checklist

1. **Playwright Timeout (120000ms from config.webServer)**:
   Run `cd apps/web && pnpm dev` manually to check for missing environment variables, failing Prisma initialization, or container conflicts.
2. **`globalSetup` Fails (Missing `.auth/test-user.json`)**:
   Verify Supabase is active (`supabase status`) and that you have run `npx prisma db push` before running Playwright.
3. **PostgreSQL Collation Mismatch**:
   Run `supabase stop --no-backup` followed by `supabase start`, then re-apply Prisma push/seed.
4. **Prisma Type Does Not Exist / Enum Missing**:
   Ensure you run `npx prisma generate` and `npx prisma db push` rather than database migrations.

---

## 🔄 Multi-Agent Coordination Protocol

When working alongside another agent (e.g. Claude Code starting a spec, and `agy` resuming it, or vice versa):
1. **Sign-Off Check**: Before initiating any implementation phase, read the last artifact in `specs/artifacts/[spec-id]/`. Confirm that the human operator has explicitly approved it.
2. **Branch Check**: Ensure you are on the correct branch corresponding to the spec (e.g., `spec/N-feature-name`). Do not make modifications on the `main` branch.
3. **Locking**: Check if there are active session locks or files indicate another agent is currently running. If so, request confirmation before taking over.
4. **AST Navigation (Graphify)**: Both agents should always consult the `graphify-out/` knowledge graph to trace symbols, imports, and relationships.
