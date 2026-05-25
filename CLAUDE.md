# CLAUDE.md — Claude Code Instructions

This file instructs Claude Code (claude.ai/code) when operating in the OSA Community Platform repository.

---

## ⚠️ IMPORTANT: Master Guidelines

This repository uses a central **Unified Agent Control Center** for all AI rules, engineering principles, stack commands, directory boundaries, and the Spec-Driven Development workflow.

**YOU MUST UNCONDITIONALLY READ AND FOLLOW THE RULES SPECIFIED IN [AGENTS.md](file:///Users/utkalnayak/Documents/code/membership-event-registration/AGENTS.md) AT THE START OF EVERY SESSION.**

### Core Engineering Principles (from AGENTS.md — always apply these)

1. **Think before you type. Name confusion out loud.**
   State assumptions before writing code. If a request is ambiguous, STOP and ask — do not guess and proceed.

2. **Simplicity is the goal. Complexity is the failure.**
   Write the absolute minimum code required. No speculative abstractions or future-proofing that was not explicitly requested.

3. **Surgical changes only. Touch only what is assigned.**
   Modify only the files strictly required for the target task. Do not refactor neighboring code, fix formatting outside your changes, or touch unrelated modules.

4. **Make it verifiable before you make it work.**
   Convert requirements into concrete, executable targets before writing production code.

5. **No code without a spec.**
   All new features must follow the 4-phase spec-driven workflow (Analyst → Architect → Implementer → QA). No implementation without an approved `02-design.md`.

---

## 🔍 Semantic Codebase Navigation (Graphify)

This repository contains an AST-based knowledge graph in `graphify-out/`. To explore the codebase without overloading your context window, run the following CLI commands:

```bash
# Query the knowledge graph for questions
graphify query "How does membership billing integrate with Stripe?"

# Find the dependency/relationship path between two symbols
graphify path "MemberService" "payment-service"

# Explain a specific class, method, or concept in-depth
graphify explain "withAuth"

# Update the knowledge graph after code changes (AST-only, no API cost)
graphify update .
```

*Note: If a structured wiki index exists, you can navigate it at `graphify-out/wiki/index.md`.*

---

## 📈 Telemetry & Session Reporting

To audit token usage, caching efficiency, and session costs:

```bash
# Run the session reporter
pnpm run agent:report
```

---

## 🛠️ Essential Claude Quick Commands

### Setup & Dev
- Install deps: `pnpm install`
- Start local Supabase: `supabase start`
- Start dev server: `pnpm dev`
- Generate Prisma client: `cd apps/web && npx prisma generate`
- Push schema changes: `cd apps/web && npx prisma db push`

### Running Tests
- Jest unit tests: `pnpm --filter=web test`
- Playwright E2E tests: `pnpm --filter=web test:e2e`
- Single Playwright spec: `cd apps/web && npx playwright test e2e/memberships.spec.ts`
