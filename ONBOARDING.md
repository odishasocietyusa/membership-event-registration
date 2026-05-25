# Welcome to OSA Information Technology Team

## How We Use Claude

Based on usage over the last 30 days (23 sessions):

Work Type Breakdown:
  Build Feature   ████████████████░░░░  45%
  Plan / Design   ████████░░░░░░░░░░░░  25%
  Debug / Fix     █████░░░░░░░░░░░░░░░  15%
  Write Docs      ███░░░░░░░░░░░░░░░░░  10%
  Improve Quality ██░░░░░░░░░░░░░░░░░░   5%

Top Skills & Commands:
  /usage          ████████████████████  42x/month
  /compact        █████████████░░░░░░░  25x/month
  /clear          ███████░░░░░░░░░░░░░  13x/month
  /context        ███░░░░░░░░░░░░░░░░░   6x/month
  /simplify       ███░░░░░░░░░░░░░░░░░   6x/month

Top MCP Servers:
  (none configured)

## Your Setup Checklist

### Codebases
- [ ] membership-event-registration — github.com/odishasocietyusa/membership-event-registration

### MCP Servers to Activate
  (none in use — nothing to set up here)

### Skills to Know About
- `/usage` — tracks token usage and session costs; run it frequently to stay aware of context spend
- `/compact` — compresses the conversation to free up context window; use when sessions run long or get slow
- `/clear` — resets the conversation entirely; use when starting a fresh task or context is too polluted
- `/context` — shows what's currently loaded in context; helpful for debugging why Claude seems confused
- `/simplify` — simplifies a code block or explanation; useful when output is too verbose
- `/security-review` — runs a security review on current branch changes; use before any auth or payment-adjacent PR
- `/fewer-permission-prompts` — scans recent sessions and adds safe read-only commands to the allowlist; run once when getting too many prompts

## Team Tips

### Running Localhost
1. Clone the repo and install dependencies: `pnpm install`
2. Start local Supabase (required before dev server): `supabase start`
3. Copy environment variables: ensure `apps/web/.env.local` exists (ask a teammate for the values)
4. Start the dev server: `pnpm dev`
5. Open `http://localhost:3000`

### Checking the Latest Deployed Version on Vercel
1. Run `vercel ls` in the project root to list recent deployments (requires Vercel CLI: `npm i -g vercel`)
2. Or open the Vercel dashboard → select the `membership-event-registration` project → **Deployments** tab
3. The topmost deployment tagged `main` is the current production version
4. Use `/vercel:status` in Claude Code for a quick summary of deployment state from the terminal

### Development Workflow
- **Never build a feature without a spec.** All enhancements go through the Spec-Driven Development (SDD) framework. Read `AGENTS.md` and browse `specs/` before writing any code.
- Start every session by reading `AGENTS.md` — it is the authoritative source for engineering rules, stack commands, and the SDD workflow in this repo.
- Use `/compact` proactively in long sessions before context gets saturated, not after.
- Run `/security-review` before any PR touching auth, payments, or membership data.

## Get Started

Before contributing any code, your first task is to **understand the project architecture and the Spec-Driven Development framework**:

1. Read `AGENTS.md` in the project root — this is the master rulebook.
2. Browse `specs/` to see active and completed specs; each one shows how a feature goes from idea to implementation.
3. Explore the codebase: ask Claude Code `"Give me an overview of the architecture in this project"` to get oriented fast.
4. When you're ready to build something, open a new spec under `specs/active/` following the existing naming convention before writing a single line of code.

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
