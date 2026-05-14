# Parallel Agent Teams — Spec-Driven Development

This document defines the agent team model for parallelizing spec-driven development across multiple phases and specs simultaneously.

---

## Core Concept

The standard 4-phase pipeline (Analyst → Architect → Implementer → QA) is sequential by design. Parallelism is introduced at two levels:

1. **Spec-level**: Multiple specs run through their own independent pipelines simultaneously
2. **Task-level**: Within Phase 3, independent task groups run in parallel (different files/domains)

---

## Agent Roles & Phase Ownership

### Sequential Phase Agents (one per spec)

| Agent Name Pattern | Phase | Owns | Produces |
|---|---|---|---|
| `analyst-{spec-id}` | Phase 1 | Requirements extraction | `01-analysis.md` |
| `architect-{spec-id}` | Phase 2 | Solution design + file ownership map | `02-design.md` |
| `qa-{spec-id}` | Phase 4 | Validation after all implementers complete | `04-qa-report.md` |

### Parallel Phase Agents (multiple per spec)

| Agent Name Pattern | Phase | Owns | Produces |
|---|---|---|---|
| `implementer-backend-{spec-id}` | Phase 3 | API, services, database, NestJS modules | Code + entries in `03-implementation.md` |
| `implementer-frontend-{spec-id}` | Phase 3 | Pages, components, hooks, Next.js routes | Code + entries in `03-implementation.md` |

> Add more implementer lanes as needed (e.g. `implementer-shared-{spec-id}` for shared packages).

---

## Naming Convention

```
{role}-{spec-id}

Examples:
  analyst-s3
  architect-s3
  implementer-backend-s3
  implementer-frontend-s3
  qa-s3
```

Use the short spec ID (e.g. `s3` for `SPEC-3-frontend-auth`) to keep names concise and scannable.

---

## Execution Model

### Single Spec with Parallel Implementation

```
analyst-s3
    │
    ▼ (01-analysis.md approved)
architect-s3
    │
    ▼ (02-design.md approved — file ownership map + contracts defined)
    ├──▶ implementer-backend-s3   ──┐
    │    (Group A tasks)            │
    │                               ├──▶ SYNC POINT (all Group tasks done)
    └──▶ implementer-frontend-s3 ──┘         │
         (Group B tasks)                      ▼
                                           qa-s3
                                              │
                                              ▼
                                     04-qa-report.md
```

### Multiple Specs in Parallel

```
SPEC-3:  analyst-s3 → architect-s3 → implementer-backend-s3  ─┐
                                    → implementer-frontend-s3 ─┴→ qa-s3

SPEC-4:  analyst-s4 → architect-s4 → implementer-backend-s4  ─┐
                                    → implementer-frontend-s4 ─┴→ qa-s4
```

Each spec pipeline is fully independent. Run as many in parallel as there are non-overlapping file domains.

---

## Agent Responsibilities in Detail

### `analyst-{spec-id}`
- **Input:** `specs/active/{spec-id}.md`
- **Goal:** Produce an unambiguous, complete understanding of what must be built
- **Actions:**
  - Parse spec and extract all functional + non-functional requirements
  - Identify edge cases, risks, and unknowns
  - Surface clarifying questions before any design begins
- **Output:** `specs/artifacts/{spec-id}/01-analysis.md`
- **Gate:** User must approve before architect begins

### `architect-{spec-id}`
- **Input:** `01-analysis.md` + codebase exploration
- **Goal:** Produce a design that parallel implementers can execute independently without stepping on each other
- **Actions:**
  - Explore existing patterns and file structure
  - Define component architecture and data flow
  - **Produce file ownership map** (which team writes which files)
  - **Define cross-team contracts** (shared interfaces/types frozen before implementation)
  - Split implementation into parallel task groups (Group A, Group B, ...)
  - Identify sync points where groups must converge
- **Output:** `specs/artifacts/{spec-id}/02-design.md`
- **Gate:** User must approve — especially the file ownership map and contracts

### `implementer-backend-{spec-id}`
- **Input:** `02-design.md` (Group A tasks only)
- **Goal:** Implement all backend tasks without touching frontend-owned files
- **Actions:**
  - Follow the TDD RED → GREEN → REFACTOR cycle for each task
  - Create/modify only files listed under Group A in the ownership map
  - Build to the cross-team contracts defined by the architect (do not change them)
  - Log all files changed and tests written
- **Output:** Code changes + `specs/artifacts/{spec-id}/03-implementation.md` (Group A section)

### `implementer-frontend-{spec-id}`
- **Input:** `02-design.md` (Group B tasks only)
- **Goal:** Implement all frontend tasks without touching backend-owned files
- **Actions:**
  - Follow the TDD RED → GREEN → REFACTOR cycle for each task
  - Create/modify only files listed under Group B in the ownership map
  - Consume cross-team contracts as read-only (do not change them)
  - Log all files changed
- **Output:** Code changes + `specs/artifacts/{spec-id}/03-implementation.md` (Group B section)

### `qa-{spec-id}`
- **Input:** All implementation code + `03-implementation.md` + original spec
- **Goal:** Validate the complete feature end-to-end after all implementers have merged
- **Actions:**
  - Write and run automated tests (unit, integration, E2E)
  - Verify every acceptance criterion from the spec
  - Perform code review across all changed files
  - Check security, performance, and edge cases
- **Output:** `specs/artifacts/{spec-id}/04-qa-report.md`
- **Gate:** User approves or sends issues back to the relevant implementer

---

## Prerequisites for Parallelism

These conditions must be met before parallel implementers can start:

1. `02-design.md` is approved — especially sections:
   - **§4.4 File Ownership Map** — no file is claimed by two teams
   - **§4.5 Cross-Team Contracts** — shared types/interfaces are frozen
   - **§5.1 Parallel Task Groups** — tasks are split into independent groups with a named sync point

2. Shared package changes (e.g. `packages/shared-types/`) are completed **before** parallel lanes begin, or assigned to exactly one team with others consuming read-only.

3. Database schema changes (`prisma/schema.prisma`) are completed by `implementer-backend` before `implementer-frontend` makes API calls that depend on new models.

---

## When NOT to Parallelize

- The spec touches a small number of files (< 5 new/modified) — sequential is simpler
- Both domains must modify the same file (e.g. `app/layout.tsx`) — resolve in design first
- Specs have a hard dependency (SPEC-4 requires SPEC-3's types to exist) — pipeline SPEC-3 first

---

## Quick Reference

```
Total agents for 1 spec (parallel):   5  (analyst, architect, impl-backend, impl-frontend, qa)
Total agents for 2 specs (parallel): 10  (×2 of the above)
Total agents for N specs (parallel): N×5 (assuming 2 implementation lanes each)
```

Naming: `{role}-{spec-id}` — e.g. `implementer-backend-s3`, `qa-s4`
