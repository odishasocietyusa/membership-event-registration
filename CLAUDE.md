# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ⚠️ IMPORTANT: Spec-Driven Development

**This project uses a spec-driven development workflow.** Before implementing any feature:

1. **Check for existing specs** in `specs/active/`
2. **Create a new spec** if one doesn't exist (use template in `specs/templates/`)
3. **Follow the 4-phase agent workflow:**
   - Phase 1: **Analyst** → `01-analysis.md`
   - Phase 2: **Architect** → `02-design.md`
   - Phase 3: **Implementer** → `03-implementation.md`
   - Phase 4: **QA** → `04-qa-report.md`

📖 **Full documentation:** See `specs/README.md` and the [Spec-Driven Development Workflow](#spec-driven-development-workflow) section below.

---

## Project Overview

OSA Community Platform - A full-stack membership and event management system for The Odisha Society of the Americas. Built as a Turborepo monorepo with Next.js frontend and NestJS backend.

📐 **Architecture reference:** See [`docs/osa-architecture.md`](docs/osa-architecture.md) for the target system design — stack, user roles, data flows, database schema (Supabase), CMS schema (Sanity), and content boundaries.

**Key Features:**
- Membership application & approval workflow with credit system
- Honorary memberships with admin override capabilities
- Event registration with waitlist management (planned)
- Supabase Auth with JIT (Just-In-Time) user sync
- Stripe payment integration
- Role-based access control (GUEST, MEMBER, CONTRIBUTOR, ADMIN)

## Tech Stack

- **Frontend**: Next.js 15.1.4 with App Router, Tailwind CSS, React 19
- **Backend**: NestJS 10.4.8 with Express
- **Database**: PostgreSQL via Supabase
- **ORM**: Prisma 6.2.0
- **Auth**: Supabase Auth (Google + Microsoft OAuth)
- **Payments**: Stripe
- **Monorepo**: Turborepo 2.3.3 + pnpm 10.17.1
- **Testing**: Jest (unit), Playwright (API E2E)
- **Package Manager**: pnpm (required - NOT npm or yarn)

## Monorepo Structure

```
membership-event-registration/
├── specs/                      # 📋 SPEC-DRIVEN DEVELOPMENT
│   ├── templates/              # Templates for specs and agent artifacts
│   ├── active/                 # Specs currently being implemented
│   ├── completed/              # Successfully implemented specs
│   └── artifacts/              # Agent outputs (analysis, design, impl, qa)
├── apps/
│   ├── web/                    # Next.js frontend (port 3000) - MINIMAL UI
│   │   ├── app/
│   │   │   ├── layout.tsx      # Root layout
│   │   │   ├── page.tsx        # Placeholder home page
│   │   │   └── globals.css     # Tailwind CSS
│   │   └── [NO components/ or lib/ directories yet]
│   └── api/                    # NestJS backend (port 3001) - FULLY IMPLEMENTED
│       ├── src/
│       │   ├── modules/
│       │   │   ├── auth/       # ✅ Supabase Auth integration, JWT guards
│       │   │   ├── memberships/# ✅ Credit system, honorary memberships
│       │   │   ├── payments/   # ✅ Stripe integration, webhooks
│       │   │   └── users/      # ✅ Profile management, GDPR
│       │   ├── common/         # Shared decorators, guards
│       │   └── prisma/         # Prisma service module
│       ├── prisma/
│       │   ├── schema.prisma   # ✅ 14+ models defined
│       │   ├── migrations/     # ✅ Database migrations
│       │   └── seed.ts         # ✅ Seed data (4 membership types)
│       └── tests/              # ⚠️ Setup only, test files pending
│           ├── auth.setup.ts   # Auth configuration
│           └── README.md       # Test documentation
├── packages/
│   ├── shared-types/           # Shared TypeScript types
│   ├── validation/             # Zod validation schemas
│   └── config/                 # Shared ESLint, TypeScript, Tailwind configs
├── postman/                    # 📮 API TESTING COLLECTION
│   ├── OSA-Platform-API.postman_collection.json    # 28 endpoints
│   ├── OSA-Platform-Local.postman_environment.json # Environment variables
│   └── README.md               # Setup and usage guide
├── scripts/                    # 🛠️ UTILITY SCRIPTS
│   ├── claude-session-report.py    # Track Claude Code usage & costs
│   ├── session-report.sh           # Quick wrapper for session report
│   ├── get-auth-token.sh           # Generate Supabase auth tokens
│   └── get-auth-token.ts           # TypeScript version (requires deps)
├── docs/                       # Session logs & progress tracking
├── prompts/                    # Architecture & specification docs
└── turbo.json                  # Turborepo task configuration
```

## Common Development Commands

### Initial Setup

```bash
# Install dependencies (always use pnpm)
pnpm install

# Start local Supabase (required for database)
supabase start

# Generate Prisma Client and run migrations
cd apps/api
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
cd ../..
```

### Development

```bash
# Start all apps (Next.js + NestJS)
pnpm dev

# Start specific app
pnpm dev --filter=web    # Next.js frontend only
pnpm dev --filter=api    # NestJS backend only

# Build all apps
pnpm build

# Build specific app
pnpm build --filter=web
pnpm build --filter=api

# Lint all code
pnpm lint

# Format all code
pnpm format
```

### Testing

#### ✅ API Tests (Playwright) - **IMPLEMENTED**
Comprehensive Playwright API tests covering 28 endpoints across 3 modules.

**Test Files:**
- ✅ `apps/api/tests/api/users.api.spec.ts` - ~30 tests (Profile management, roles, GDPR)
- ✅ `apps/api/tests/api/memberships.api.spec.ts` - ~28 tests (CRUD, credit system, honorary)
- ✅ `apps/api/tests/api/payments.api.spec.ts` - ~20 tests (Stripe integration, webhooks)
- ✅ `apps/api/tests/fixtures/api-helpers.ts` - HTTP request helpers & assertions
- ✅ `apps/api/tests/fixtures/test-data.ts` - Test data factories
- ✅ `apps/api/tests/fixtures/supabase-helpers.ts` - User creation/deletion
- ✅ `apps/api/tests/fixtures/stripe-helpers.ts` - Webhook payload generation

**Running Tests:**
```bash
# IMPORTANT: Playwright auto-starts the server - don't run pnpm dev manually!

# Run all API tests (from root directory)
pnpm test:api

# Run in interactive UI mode
pnpm test:api:ui

# Run in debug mode
pnpm test:api:debug

# If you have the server running manually, use CI mode:
CI=true pnpm test:api
```

**Test Coverage:**
- ~78 tests total covering authentication, CRUD operations, RBAC, credit system, GDPR compliance
- Many tests marked with `.skip()` - require admin user promotion or real Stripe configuration

#### Unit Tests (Jest)
```bash
# Run all unit tests
pnpm test

# Run tests in watch mode
cd apps/api
pnpm test:watch

# Run tests with coverage
pnpm test:cov
```

#### 📮 Postman Collection - **IMPLEMENTED**
Complete Postman collection for manual API testing and exploration.

**Files:**
- ✅ `postman/OSA-Platform-API.postman_collection.json` - 28 endpoints with auto-capture scripts
- ✅ `postman/OSA-Platform-Local.postman_environment.json` - Environment variables
- ✅ `postman/README.md` - Complete setup guide with workflows

**Quick Setup:**
1. Import collection and environment into Postman
2. Get auth token: `./scripts/get-auth-token.sh`
3. Set token in Postman environment (`auth_token` variable)
4. Start testing! Try "Get Current User" first

**See:** [postman/README.md](postman/README.md) for detailed instructions

## Testing & Database Troubleshooting

### Common Issues When Running Tests

#### ❌ Port Already in Use (EADDRINUSE :::3001)

**Problem:** Playwright tries to start the API server, but port 3001 is already in use.

**Solution:**
```bash
# Option 1: Let Playwright manage the server (RECOMMENDED)
# Stop any manually running API server (Ctrl+C), then:
pnpm test:api

# Option 2: Keep manual server running
# If you already have the API running, use CI mode:
CI=true pnpm test:api
```

**Why:** Playwright auto-starts the server via `webServer` config. Don't run `pnpm dev` manually unless using `CI=true`.

---

#### ❌ Supabase Configuration Missing

**Problem:** `Error: Supabase configuration is missing` when starting the API.

**Solution:** Check environment variable names in `apps/api/.env`:
```bash
# ✅ CORRECT (what NestJS expects):
SUPABASE_SERVICE_KEY=eyJhbG...

# ❌ WRONG:
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...  # Note the extra "_ROLE"
```

**Why:** The NestJS `SupabaseService` looks for `SUPABASE_SERVICE_KEY`, not `SUPABASE_SERVICE_ROLE_KEY`.

---

#### ❌ PostgreSQL Collation Version Mismatch

**Problem:**
```
ERROR: template database "template1" has a collation version mismatch
DETAIL: The template database was created using collation version 153.120,
but the operating system provides version 153.121.
```

**Solution (Nuclear Option - works reliably):**
```bash
# Stop Supabase and remove all data
supabase stop --no-backup

# Start fresh
supabase start

# Rebuild database
cd apps/api
pnpm prisma db push
pnpm prisma:seed
```

**Why:** macOS collation library was updated but the database template wasn't refreshed. Easiest fix is fresh start.

---

#### ❌ Prisma Migration Errors (Type Does Not Exist)

**Problem:**
```
Error: Migration failed to apply cleanly to the shadow database.
ERROR: type "MembershipStatus" does not exist
```

**Solution:** Use `db push` instead of migrations for local dev:
```bash
cd apps/api

# Skip migrations entirely - push schema directly
pnpm prisma db push

# Then seed
pnpm prisma:seed
```

**Why:** Migration files have ordering issues where enums are used before they're created. `db push` reads the complete schema and creates everything in the correct order.

---

#### ❌ Playwright Timeout (120s)

**Problem:** `Error: Timed out waiting 120000ms from config.webServer.`

**Solution:** Server is failing to start. Run manually to see the error:
```bash
cd apps/api
pnpm run start:dev

# Watch for errors like:
# - Missing Prisma Client → run `pnpm prisma:generate`
# - Database connection errors → check Supabase is running
# - Missing environment variables → check .env file
```

**Why:** Playwright waits for the server to respond on `http://localhost:3001`. If the server crashes on startup, it times out.

---

### Quick Start Checklist (First Time Setup)

**Before running any tests, verify these steps:**

1. **Start Supabase**
   ```bash
   supabase start
   ```

2. **Get Supabase Credentials**
   ```bash
   supabase status
   # Copy: service_role key, anon key, JWT secret
   ```

3. **Update Environment Variables** (`apps/api/.env`)
   ```bash
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_SERVICE_KEY=<service_role-key-from-status>  # NOT _ROLE_KEY!
   SUPABASE_ANON_KEY=<anon-key-from-status>
   SUPABASE_JWT_SECRET=<jwt-secret-from-status>
   DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
   ```

4. **Setup Database**
   ```bash
   cd apps/api
   pnpm prisma db push    # Use db push, not migrate
   pnpm prisma:seed       # Seed 4 membership types
   cd ../..
   ```

5. **Run Tests**
   ```bash
   # From project root (Playwright will auto-start the server)
   pnpm test:api
   ```

---

### Database (Prisma)

```bash
# All Prisma commands should be run from apps/api/

cd apps/api

# Open Prisma Studio (visual database browser)
pnpm prisma:studio

# Generate Prisma Client (after schema changes)
pnpm prisma:generate

# Create a new migration
pnpm prisma migrate dev --name <migration_name>

# Apply migrations to database
pnpm prisma:migrate

# Seed the database
pnpm prisma:seed

# Reset database (⚠️ deletes all data)
pnpm prisma migrate reset

# Format schema file
pnpm prisma format
```

### Supabase

```bash
# Start Supabase local stack
supabase start

# Stop Supabase
supabase stop

# View Supabase status
supabase status

# Access services:
# - Studio: http://127.0.0.1:54323
# - API: http://127.0.0.1:54321
# - Mailpit: http://127.0.0.1:54324
# - PostgreSQL: localhost:54322
```

### Utility Scripts

#### Claude Code Session Report
Track token usage, costs, and model information after each Claude Code session.

```bash
# Generate report for current project
python3 scripts/claude-session-report.py

# Or use the quick wrapper
./scripts/session-report.sh
```

**Output includes:**
- Model used (Opus/Sonnet/Haiku 4.5)
- Token usage (input, output, cache)
- Cost estimate (based on Claude API pricing)
- Context usage (% of 200K window)
- Session timing

**Report saved to:** `.claude-session-report.txt` (git-ignored)

**See:** [scripts/README.md](scripts/README.md) for detailed documentation

#### Get Supabase Auth Token
Generate auth tokens for Postman or manual API testing.

```bash
# Create new test user and get token
./scripts/get-auth-token.sh

# Get token for existing user
./scripts/get-auth-token.sh user@example.com Password123
```

**Output:**
- JWT access token (valid for 1 hour)
- User credentials (email, password, ID)
- Instructions for using in Postman

**Use case:** Testing API endpoints via Postman or curl

### Clean Up

```bash
# Clean all build artifacts and node_modules
pnpm clean

# Stop and remove Supabase containers
supabase stop --all
docker system prune -f
```

## Architecture Patterns

### NestJS Module Structure

Each feature module follows this pattern:

```
src/modules/<feature>/
├── <feature>.module.ts        # Module definition
├── <feature>.controller.ts    # HTTP routes & validation
├── <feature>.service.ts       # Business logic
├── dto/                       # Data Transfer Objects
│   ├── create-<feature>.dto.ts
│   └── update-<feature>.dto.ts
└── interfaces/                # TypeScript interfaces
```

**Key Modules:**
- `auth/` - Supabase Auth integration, JWT validation, guards
- `users/` - User profiles, GDPR exports, role management
- `memberships/` - Membership CRUD, approval workflow, credit system
- `payments/` - Stripe integration, webhooks, admin overrides
- `prisma/` - **Database access module** (see explanation below)

### Prisma Module - Database Access Layer

The **Prisma module** (`src/prisma/`) is a special NestJS module that provides database access across the entire application:

**What it does:**
1. **PrismaService** - A singleton service that manages the database connection
2. **Type-safe database queries** - Converts your code into SQL automatically
3. **Shared across all modules** - Auth, Users, Memberships, and Payments all inject `PrismaService`

**Files:**
- `src/prisma/prisma.module.ts` - Exports PrismaService globally
- `src/prisma/prisma.service.ts` - Wraps Prisma Client with lifecycle hooks
- `prisma/schema.prisma` - **Blueprint** of your database (tables, columns, relations)

**How modules use it:**
```typescript
// In any service (e.g., memberships.service.ts)
constructor(private prisma: PrismaService) {}

async getMembership(id: string) {
  // Type-safe query - no SQL needed!
  return this.prisma.membership.findUnique({
    where: { id },
    include: { user: true, membershipType: true }
  });
}
```

**Benefits:**
- ✅ No manual SQL queries
- ✅ TypeScript auto-completion for all database operations
- ✅ Automatic migrations from schema changes
- ✅ Prevents SQL injection attacks
- ✅ Single source of truth for database structure

### Authentication & Authorization

The API uses Supabase JWT tokens for authentication:

1. **JwtAuthGuard** - Validates JWT tokens on protected routes
2. **RolesGuard** - Enforces role-based access control
3. **@CurrentUser()** decorator - Extracts user from request
4. **@Roles()** decorator - Specifies required roles for endpoints

Example usage:
```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Get('admin-only')
async adminEndpoint(@CurrentUser() user: User) {
  // Only ADMIN role can access
}
```

**User Roles (hierarchical):**
- `GUEST` - Default, can view public content only
- `MEMBER` - Can register for events, manage profile
- `CONTRIBUTOR` - Can create/edit content
- `ADMIN` - Full access to all operations

### Prisma Schema Organization

The schema (`apps/api/prisma/schema.prisma`) is organized into domains:

1. **Enums** - Status types for users, memberships, registrations, payments
2. **User Domain** - Users and profiles
3. **Membership Domain** - Membership types and user memberships
4. **Event Domain** - Events, categories, registrations, waitlists
5. **Content Domain** - Articles and static pages
6. **Payment Domain** - Payments and Stripe integration
7. **System Domain** - Media uploads and audit logs

**Key Models:**
- `User` - Core user accounts (synced from Supabase Auth)
- `Profile` - Extended user info (name, address, preferences)
- `Membership` - User membership records with credit system
- `MembershipType` - Available tiers (seeded with 4 types)
- `Payment` - Transaction records with Stripe integration

### Database Triggers (Supabase Functions)

Three critical database triggers are installed:

1. **Auth User Sync** - Auto-creates `User` record when signing up via Supabase Auth
2. **Seat Counter** - Auto-updates event capacity when registrations change
3. **Waitlist Position** - Auto-assigns queue position when joining waitlist

### Credit System

The membership credit system tracks expired memberships and provides credit toward renewals:

**Rules:**
- Credits apply only within 365 days of expiration
- Credit amount = original payment amount
- Credits automatically applied at checkout
- One-time use (prevents reuse after application)

**Implementation:**
- Stored in `Membership.creditAmount` and `Membership.creditExpiresAt`
- Applied via `Membership.creditAppliedFrom` reference
- Calculated in `MembershipsService.calculateCheckoutAmount()`

### Honorary Memberships

Admin-only feature to grant free memberships:

**Characteristics:**
- Price: $0 (no payment required)
- Status: Immediately ACTIVE (no approval needed)
- Role: User auto-promoted to MEMBER role
- Hidden: Not shown in public membership type listings

**Usage:** For special recognition, board members, or lifetime achievements

### Admin Overrides

Admins can override system-calculated values:

- Membership status changes (PENDING → ACTIVE without payment)
- Payment amount adjustments (charge different amount than system default)
- All overrides logged in `AuditLog` table for accountability

## Environment Variables

Required environment variables are documented in `.env.example` files:

### Frontend (`apps/web/.env.local`)
```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from-supabase-status>

# API
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Backend (`apps/api/.env`)
```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Supabase
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=<from-supabase-status>
SUPABASE_SERVICE_ROLE_KEY=<from-supabase-status>
SUPABASE_JWT_SECRET=<from-supabase-status>

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Server
PORT=3001
NODE_ENV=development
```

**Get Supabase credentials:**
```bash
supabase status
# Copy the values for anon key, service_role key, and JWT secret
```

## Important Notes

### Package Manager
- **ALWAYS use `pnpm`** - This project requires pnpm, NOT npm or yarn
- Turborepo is optimized for pnpm workspaces
- If you encounter "command not found", install pnpm: `npm install -g pnpm`

### Running Commands
- Monorepo commands: Run from **root directory** (uses Turborepo)
- Database commands: Run from **apps/api/** directory
- Test commands: Run from **root directory** (test:api) or **apps/api/** (test:watch)

### Database Migrations
- **Never** edit migration files directly
- Always create new migrations for schema changes
- Test migrations locally before committing
- Seed data is version-controlled (`prisma/seed.ts`)

### Testing Best Practices
- Playwright API tests run against live local server
- Tests create/clean up their own data (no shared state)
- Use `auth.setup.ts` to create test users with different roles
- Each test project (Guest, Member, Contributor, Admin) runs independently

### Code Quality
- TypeScript strict mode enabled
- ESLint configured for NestJS and Next.js
- Prettier for code formatting
- Use class-validator for DTO validation in NestJS
- Use Zod for runtime validation in Next.js

### Common Pitfalls
1. **Supabase not running** - Always run `supabase start` before `pnpm dev`
2. **Missing Prisma Client** - Run `pnpm prisma:generate` after schema changes
3. **Stale Turbo cache** - Run `pnpm clean` if builds seem outdated
4. **Port conflicts** - Default ports: 3000 (web), 3001 (api), 54321-54324 (Supabase)
5. **Wrong directory** - Prisma commands must run from `apps/api/`

## Current Implementation Status

- **Phase 1**: ✅ Complete - Foundation, database, local dev setup
- **Phase 2**: ✅ Complete - Backend API + Testing
  - ✅ Authentication module (Supabase Auth, JIT sync, JWT guards)
  - ✅ Users module (profiles, roles, GDPR compliance)
  - ✅ Memberships module (credit system, honorary memberships, admin overrides)
  - ✅ Payments module (Stripe integration, webhook handlers)
  - ✅ Database schema (14+ Prisma models with migrations)
  - ✅ API E2E tests (78 Playwright tests, 100% pass rate)
  - ✅ Postman collection (28 endpoints with auto-capture scripts)
  - ✅ Testing utilities (auth token generation, session reports)
- **Phase 3**: 📋 Not Started - Frontend UI implementation
  - ✅ Next.js app structure exists
  - ❌ No authentication pages (login/signup)
  - ❌ No membership application flow UI
  - ❌ No event browsing/registration UI
  - ❌ No user dashboard or admin panel
- **Phase 4+**: 📋 Planned - CMS, events module, full event registration

**Current Working Features:**
- Backend API fully functional with Stripe payments, membership credit system, and RBAC
- Comprehensive test coverage (78 Playwright tests covering 28 endpoints)
- Complete Postman collection for manual testing and exploration
- Utility scripts for session tracking and auth token generation
- Ready for frontend integration

See `docs/progress.md` for detailed progress tracking and `prompts/` directory for architecture specifications.

---

## Spec-Driven Development Workflow

This project uses a **spec-driven development** approach. All features should be implemented through the following 4-phase agent workflow.

### Overview

```
User creates spec → Analyst → Architect → Implementer → QA → User approves
                      ↓           ↓            ↓          ↓
                 01-analysis  02-design  03-implement  04-qa-report
```

### Directory Structure

```
specs/
├── templates/          # Templates for specs and phase artifacts
├── active/             # Specs currently being worked on
├── completed/          # Successfully implemented specs
└── artifacts/          # Agent outputs organized by spec ID
    └── [SPEC-ID]/
        ├── 01-analysis.md
        ├── 02-design.md
        ├── 03-implementation.md
        └── 04-qa-report.md
```

### How to Use

1. **Create a spec** from the template:
   ```bash
   cp specs/templates/feature-spec.template.md specs/active/SPEC-YYYY-MM-DD-feature-name.md
   ```

2. **Fill in the spec** with requirements, acceptance criteria, and constraints

3. **Start the workflow** by telling Claude:
   ```
   Please implement specs/active/[spec-id].md using the spec-driven workflow
   ```

### Agent Phases

#### Phase 1: Analyst Agent
- **Role:** Understand and validate requirements
- **Input:** Spec file
- **Output:** `specs/artifacts/[SPEC-ID]/01-analysis.md`
- **Actions:**
  - Parse and interpret the spec
  - Extract all functional/non-functional requirements
  - Identify edge cases, risks, and dependencies
  - List any clarifying questions
- **User Action:** Approve analysis or answer questions

#### Phase 2: Architect Agent
- **Role:** Design the solution
- **Input:** Analysis + current codebase
- **Output:** `specs/artifacts/[SPEC-ID]/02-design.md`
- **Actions:**
  - Explore existing code patterns
  - Design component architecture
  - Plan file changes (create/modify/delete)
  - Define implementation sequence
  - Specify testing strategy
- **User Action:** Approve design or request changes

#### Phase 3: Implementer Agent
- **Role:** Write the code
- **Input:** Design document
- **Output:** Code changes + `specs/artifacts/[SPEC-ID]/03-implementation.md`
- **Actions:**
  - Create/modify files as designed
  - Follow existing code patterns
  - Handle errors appropriately
  - Log all changes made
- **User Action:** Review implementation

#### Phase 4: QA Agent
- **Role:** Test and validate
- **Input:** Implementation + spec
- **Output:** `specs/artifacts/[SPEC-ID]/04-qa-report.md`
- **Actions:**
  - Write automated tests
  - Run test suite
  - Perform code review
  - Check security and performance
  - Verify acceptance criteria
- **User Action:** Approve or request fixes

### Workflow Rules

1. **Sequential Execution:** Each phase must complete before the next begins
2. **Artifact Handoff:** Each phase reads the previous phase's artifact
3. **User Approval:** User must approve each phase before proceeding
4. **No Skipping:** All 4 phases are mandatory
5. **Iteration:** If issues are found, return to the appropriate phase

### Example Commands

```bash
# Start full workflow
"Implement specs/active/SPEC-2024-01-15-playwright-tests.md"

# Run specific phase
"Run Analysis phase for specs/active/SPEC-2024-01-15-playwright-tests.md"
"Run Design phase for specs/active/SPEC-2024-01-15-playwright-tests.md"
"Run Implementation phase for specs/active/SPEC-2024-01-15-playwright-tests.md"
"Run QA phase for specs/active/SPEC-2024-01-15-playwright-tests.md"

# Resume after approval
"Continue with Design phase for SPEC-2024-01-15-playwright-tests"
```

### Best Practices

- **Be specific in specs:** Vague requirements lead to clarifying questions
- **Review each phase:** Don't rush approvals
- **Keep specs updated:** If requirements change mid-development
- **Archive completed specs:** Move to `specs/completed/` when done

See `specs/README.md` for complete documentation.
