# Spec-Driven Development Framework

This directory contains feature specifications and the artifacts produced during the development lifecycle.

## Overview

All features in this project follow a **spec-driven development** approach with 4 distinct phases, each handled by a specialized Claude Code agent:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  ANALYST    │───▶│  ARCHITECT  │───▶│ IMPLEMENTER │───▶│  QA/TESTER  │
│             │    │             │    │             │    │             │
│ Understand  │    │ Design      │    │ Write code  │    │ Test & QA   │
│ requirements│    │ solution    │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
      │                  │                  │                  │
      ▼                  ▼                  ▼                  ▼
 01-analysis.md    02-design.md    03-implementation.md  04-qa-report.md
```

## Core Principles

These principles govern how every agent in the workflow must behave:

1. **Think before you type. Name confusion out loud.** — State your assumptions before writing code. If the request is ambiguous, stop and ask — don't pick one interpretation and run. If a simpler path exists, push back. Confusion you hide becomes bugs you ship.
2. **Simplicity is the goal. Complexity is the failure.** — Write the minimum code that solves the problem. No speculative abstractions, no flexibility nobody asked for. Apply this test: would a senior engineer call this overcomplicated? If yes, cut more.
3. **Surgical changes only. Every line traces back to the request.** — Touch only what the task requires. Don't improve neighboring code, don't refactor what isn't broken. If a line can't be justified by the request, it doesn't belong.
4. **Make it verifiable before you make it work.** — Turn vague instructions into concrete, checkable targets before writing a line. "Add validation" becomes "write tests for invalid inputs, then make them pass." No verifiable target, no start.
5. **RED → GREEN → REFACTOR. No production code without a failing test first.** — Write a test that fails (RED). Write the minimum code to make it pass (GREEN). Then and only then clean up (REFACTOR). This cycle is the unit of work in Phase 3.

---

## Directory Structure

```
specs/
├── README.md                 # This file
├── templates/                # Templates for specs and artifacts
│   ├── feature-spec.template.md
│   ├── 01-analysis.template.md
│   ├── 02-design.template.md
│   ├── 03-implementation.template.md
│   └── 04-qa-report.template.md
├── active/                   # Specs currently being worked on
│   └── [spec-id].md
├── completed/                # Successfully implemented specs (archive)
│   └── [spec-id].md
└── artifacts/                # Agent outputs for each spec
    └── [spec-id]/
        ├── 01-analysis.md
        ├── 02-design.md
        ├── 03-implementation.md
        └── 04-qa-report.md
```

## Workflow

### 1. Create a New Spec

Copy the template and fill in your requirements:

```bash
cp specs/templates/feature-spec.template.md specs/active/SPEC-1-feature-name.md
```

Then edit the spec file with your requirements.

### 2. Invoke the Development Workflow

Tell Claude Code to start the spec-driven workflow:

```
@claude Please implement the spec at specs/active/SPEC-1-feature-name.md using the spec-driven development workflow.
```

### 3. Agent Phases

Claude Code will execute each phase sequentially, producing artifacts and waiting for your approval:

#### Phase 1: Analysis Agent
- Reads and interprets the spec
- Extracts all requirements
- Identifies edge cases and risks
- Asks clarifying questions if needed
- **Output:** `specs/artifacts/[spec-id]/01-analysis.md`
- **User Action:** Review and approve, or answer questions

#### Phase 2: Architect Agent
- Explores existing codebase
- Identifies patterns to follow
- Designs the solution
- Plans implementation steps
- **Defines test cases for every acceptance criterion** — these become the RED tests in Phase 3
- **Output:** `specs/artifacts/[spec-id]/02-design.md`
- **User Action:** Review design + test cases and approve

#### Phase 3: Implementation Agent

Follows the TDD RED → GREEN → REFACTOR cycle for each unit of work:

- **RED** — Write a failing test from the test cases defined in `02-design.md`. Run it. Confirm it fails for the right reason.
- **GREEN** — Write the minimum production code to make that test pass. No more. Run the test. Confirm it passes.
- **REFACTOR** — Clean up the code just written without changing behaviour. Run tests again. Confirm still green.
- Repeat this cycle for each test case until all pass.
- **Output:** `specs/artifacts/[spec-id]/03-implementation.md` (log of files changed and tests written)
- **User Action:** Review changes and test results

#### Phase 4: QA Agent
- Creates tests for the implementation
- Runs automated tests
- Performs code review
- Checks security and performance
- **Output:** `specs/artifacts/[spec-id]/04-qa-report.md`
- **User Action:** Review report, approve or request fixes

### 4. Complete the Spec

Once all phases pass:

```bash
mv specs/active/[spec-id].md specs/completed/
```

## Naming Conventions

### Spec IDs
Format: `SPEC-[N]-[short-description]`

Examples:
- `SPEC-1-membership`
- `SPEC-2-payments`
- `SPEC-3-user-dashboard`

### Artifact Files
Always use the numbered prefix to maintain order:
- `01-analysis.md`
- `02-design.md`
- `03-implementation.md`
- `04-qa-report.md`

## Best Practices

### Writing Good Specs
1. Be specific about requirements
2. Include acceptance criteria
3. List what's out of scope
4. Provide examples where helpful
5. Reference existing code patterns

### During Development
1. Review each phase before approving
2. Ask questions if something is unclear
3. Request changes rather than manual fixes
4. Keep the spec updated if requirements change

### After Implementation
1. Move completed specs to `completed/`
2. Keep artifacts for future reference
3. Update CLAUDE.md if patterns change

## Quick Reference

| Phase | Agent Role | Input | Output | User Action |
|-------|------------|-------|--------|-------------|
| 1 | Analyst | Spec file | analysis.md | Approve / Answer questions |
| 2 | Architect | analysis.md + codebase | design.md | Approve design |
| 3 | Implementer | design.md | Code + implementation.md | Review code |
| 4 | QA | Code + implementation.md | qa-report.md | Approve / Request fixes |

## Triggering Individual Phases

You can also trigger specific phases:

```
@claude Run only the Analysis phase for specs/active/SPEC-1-feature-name.md
@claude Run only the Design phase for specs/active/SPEC-1-feature-name.md
@claude Run only the Implementation phase for specs/active/SPEC-1-feature-name.md
@claude Run only the QA phase for specs/active/SPEC-1-feature-name.md
```

## Troubleshooting

### Spec is too vague
- Analysis phase will list questions
- Answer them before proceeding

### Design doesn't match expectations
- Provide feedback in the design review
- Ask for specific changes

### Implementation has issues
- QA phase will catch most issues
- Request fixes through the QA report

### Tests failing
- Review the QA report for details
- Either fix the code or update the spec
