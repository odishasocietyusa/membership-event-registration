---
name: spec-phase
description: Automates or guides the 4-phase Spec-Driven Development Workflow using agy subagents.
---

# Workflow: Spec-Driven Phase Orchestration

This workflow automates or coordinates the execution of a specific phase of the spec-driven development cycle for a target spec ID (e.g., `SPEC-1-membership`).

## How to Trigger

You can ask `agy` to run this workflow for a specific phase:
- `"Run spec-phase Analyst for SPEC-1-membership"`
- `"Run spec-phase Architect for SPEC-1-membership"`
- `"Run spec-phase Implementer for SPEC-1-membership"`
- `"Run spec-phase QA for SPEC-1-membership"`

---

## Workflow Phases & Actions

### 🕵️ Phase 1: Analyst
1. **Explore & Read**:
   - Locate the spec at `specs/active/[spec-id].md`.
   - Read the template file at `specs/templates/01-analysis.template.md` to see required formatting.
2. **Analysis Subagent**:
   - Invoke a `research` subagent:
     - **Role**: "Spec Analyst"
     - **Prompt**: "Read specs/active/[spec-id].md. Extract all functional/non-functional requirements, identify edge cases, structural risks, database model requirements, and compile any clarifying questions. Output the analysis to specs/artifacts/[spec-id]/01-analysis.md following the template."
3. **Review**: Wait for user review and approval before proceeding to Phase 2.

---

### 📐 Phase 2: Architect
1. **Pre-requisite Check**: Verify `specs/artifacts/[spec-id]/01-analysis.md` exists and is signed off.
2. **Context Gathering**:
   - Run a `graphify` query to examine current module structures and service patterns.
   - Read `specs/templates/02-design.template.md`.
3. **Design Subagent**:
   - Invoke a `research` subagent:
     - **Role**: "Software Architect"
     - **Prompt**: "Read specs/active/[spec-id].md and specs/artifacts/[spec-id]/01-analysis.md. Design the implementation strategy. List all files to create, modify, or delete. Define the database schema changes (Prisma), service layer interfaces, and explicit unit/E2E test scenarios for every acceptance criterion. Output to specs/artifacts/[spec-id]/02-design.md following the template."
4. **Review**: Wait for explicit user approval of the design.

---

### 💻 Phase 3: Implementer
1. **Pre-requisite Check**: Verify `specs/artifacts/[spec-id]/02-design.md` exists and is signed off.
2. **Task Creation**:
   - Switch `agy` into **Planning Mode**.
   - Create or update the `task.md` planning artifact with the implementation checklist.
3. **TDD Execution Loop**:
   - Step 3a: Write a failing test in the relevant test suite (Jest or Playwright).
   - Step 3b: Implement the minimal code in the service/API layers.
   - Step 3c: Run tests to confirm green status.
   - Step 3d: Refactor code, re-run tests, and repeat.
4. **Generate Log**: Compile a summary of modified files, database migrations/pushes, and added tests into `specs/artifacts/[spec-id]/03-implementation.md`.

---

### 🧪 Phase 4: QA / Tester
1. **Pre-requisite Check**: Verify `specs/artifacts/[spec-id]/03-implementation.md` exists.
2. **Automated Auditing**:
   - Spawn a background task to run the tests: `pnpm --filter=web test` and `pnpm --filter=web test:e2e`.
   - Run ESLint and TypeScript compilation: `pnpm lint` and `pnpm build`.
3. **Report Compilation**:
   - Compile test metrics, code quality logs, and test coverage stats into `specs/artifacts/[spec-id]/04-qa-report.md` following the template.
