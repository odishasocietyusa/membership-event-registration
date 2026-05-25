---
trigger: always_on
description: Enforce and guide the 4-phase Spec-Driven Development Workflow for all code generation and analysis.
---

## Spec-Driven Development Workflow (`agy` Integration)

All feature development and repository edits must adhere to the 4-phase spec-driven lifecycle documented in [AGENTS.md](file:///Users/utkalnayak/Documents/code/membership-event-registration/AGENTS.md). 

### Operational Rules

1. **Verify Active Spec**: Before initiating any code generation or analysis, check `specs/active/` for the corresponding active specification file (e.g., `specs/active/SPEC-X-feature-name.md`). If it does not exist, ask the user to create it first.
2. **Sequential Phase Enforcement**: 
   - **Phase 1 (Analyst)** must output `specs/artifacts/[spec-id]/01-analysis.md`.
   - **Phase 2 (Architect)** must output `specs/artifacts/[spec-id]/02-design.md`.
   - **Phase 3 (Implementer)** is the *only* phase allowed to modify repository code, and must output `specs/artifacts/[spec-id]/03-implementation.md`.
   - **Phase 4 (QA)** must output `specs/artifacts/[spec-id]/04-qa-report.md` along with writing relevant unit or Playwright E2E tests.
3. **Subagent Orchestration**:
   - **Phase 1 & 2**: Delegate parallel exploration and analysis to a `research` subagent to conserve parent context.
   - **Phase 3**: Run in `agy` Planning Mode. Track checklist items in the `task.md` planning artifact.
   - **Phase 4**: Proactively run Jest (`pnpm --filter=web test`) or Playwright (`pnpm --filter=web test:e2e`) tests.
4. **Surgical Scope Limit**: Keep changes tightly confined to the file ownership boundaries defined under "Monorepo Directory Boundaries & Ownership" in `AGENTS.md`. Never touch files that fall under other waves.
5. **No Shortcut Commits**: Never edit code without a green-lit `02-design.md` signed off by the human operator.
