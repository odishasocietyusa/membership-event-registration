# OSA Community Platform

> Membership and Event Management System for The Odisha Society of the Americas

A comprehensive platform for managing memberships, event registrations, and community content built with modern full-stack technologies.

## 🏗️ Tech Stack

- **Frontend**: Next.js 15.1.4 (App Router) + Tailwind CSS
- **Backend**: NestJS 10.4.8 + Prisma 6.2.0
- **Database**: PostgreSQL (via Supabase)
- **Auth**: Supabase Auth (Google + Microsoft OAuth)
- **Payments**: Stripe
- **Email**: Resend
- **Monorepo**: Turborepo + pnpm workspaces

## 📁 Project Structure

```
osa-community-platform/
├── apps/
│   ├── web/          # Next.js frontend (port 3000)
│   └── api/          # NestJS reference implementation (port 3001)
├── packages/
│   ├── shared-types/ # Shared TypeScript types
│   ├── validation/   # Zod validation schemas
│   └── config/       # Shared configuration
├── docs/             # Architecture reference
└── specs/            # Feature specs and SDD workflow
```

## 💻 Local Developer Setup

Complete these steps **once** before running the project for the first time. All tools listed are required.

---

### 1. Node.js (v20 or higher)

The JavaScript runtime. Required for Next.js, NestJS, and all tooling.

```bash
# Check if already installed
node --version   # must be >= 20.0.0

# Install via nvm (recommended — lets you switch versions per project)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.zshrc          # or ~/.bashrc if using bash
nvm install 22
nvm use 22

# Or install directly from https://nodejs.org (LTS release)
```

---

### 2. pnpm (v11 or higher)

The package manager used across the entire monorepo. Do **not** use npm or yarn — the workspace setup requires pnpm.

```bash
# Check if already installed
pnpm --version   # must be >= 11.0.0

# Install via npm (one-time bootstrap)
npm install -g pnpm@latest

# Or via Homebrew
brew install pnpm
```

---

### 3. Docker Desktop

Required to run Supabase locally. The Supabase CLI spins up PostgreSQL, Auth, Storage, and Studio as Docker containers.

```bash
# Check if already installed
docker --version   # any recent version is fine

# Install Docker Desktop
# → https://www.docker.com/products/docker-desktop/
# Download the installer for your OS and follow the setup wizard.

# After install, open Docker Desktop and wait for it to show "Engine running"
# before proceeding to the Supabase step.
```

---

### 4. Supabase CLI

Manages the local Supabase stack (database, auth, storage, email).

```bash
# Check if already installed
supabase --version   # must be >= 2.0.0

# Install via Homebrew (macOS/Linux)
brew install supabase/tap/supabase

# Or via npm
npm install -g supabase

# Log in to your Supabase account (needed for remote operations only)
supabase login
```

> Docker Desktop must be running before you use any `supabase` commands.

---

### 5. Stripe CLI

Required for testing payment webhooks locally. Stripe events are forwarded to your local server.

```bash
# Check if already installed
stripe --version

# Install via Homebrew (macOS)
brew install stripe/stripe-cli/stripe

# Or download from https://stripe.com/docs/stripe-cli#install

# Log in (links CLI to your Stripe account)
stripe login
```

---

### 6. Git

Required to clone the repository and manage branches.

```bash
# Check if already installed
git --version

# Install via Homebrew
brew install git

# Or download from https://git-scm.com/downloads
```

---

### Verify All Tools

Run this block to confirm everything is installed before proceeding:

```bash
echo "Node:     $(node --version)"
echo "pnpm:     $(pnpm --version)"
echo "Docker:   $(docker --version)"
echo "Supabase: $(supabase --version)"
echo "Stripe:   $(stripe --version)"
echo "Git:      $(git --version)"
```

Expected output (versions may be higher):
```
Node:     v22.x.x
pnpm:     11.x.x
Docker:   Docker version 29.x.x
Supabase: 2.x.x
Stripe:   stripe version 1.x.x
Git:      git version 2.x.x
```

---

## 🚀 How to Run

### Prerequisites

- **Node.js**: v20.0.0 or higher
- **pnpm**: v9.0.0 or higher
- **Docker Desktop**: For running Supabase locally

### Initial Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd membership-event-registration

# 2. Install dependencies
pnpm install

# 3. Start Supabase local development
supabase start

# This will start all Supabase services:
# - PostgreSQL (localhost:54322)
# - Studio (http://127.0.0.1:54323)
# - API (http://127.0.0.1:54321)
# - Mailpit (http://127.0.0.1:54324)

# 4. Set up environment variables
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env

# Note: .env files are already configured with local Supabase credentials
# from Phase 1 setup. No changes needed for local development.

# 5. Generate Prisma Client and run migrations
cd apps/api
pnpm prisma generate
pnpm prisma migrate deploy
cd ../..

# 6. Seed the database
cd apps/api
pnpm prisma db seed
cd ../..

# Expected output:
# ✅ Event categories seeded (10 categories)
# ✅ Membership types seeded (4 types)
```

### Start Development Servers

```bash
# Start both Next.js and NestJS in development mode
pnpm dev

# Or start individually:
pnpm dev --filter=web    # Next.js only
pnpm dev --filter=api    # NestJS only
```

**Services will be available at**:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001/api
- Supabase Studio: http://127.0.0.1:54323
- Mailpit (Email): http://127.0.0.1:54324

### Verify Installation

```bash
# Check all services are running
curl http://localhost:3000        # Next.js
curl http://localhost:3001/api    # NestJS
curl http://127.0.0.1:54323       # Supabase Studio

# Check database connection
cd apps/api
pnpm prisma studio                # Opens on http://localhost:5555

# Verify seed data
docker exec -it supabase_db_apps psql -U postgres -d postgres -c \
  "SELECT COUNT(*) FROM event_categories;"
# Expected: 10

docker exec -it supabase_db_apps psql -U postgres -d postgres -c \
  "SELECT COUNT(*) FROM membership_types;"
# Expected: 4
```

## 🧪 What Can You Test Now (Phase 1)

### ✅ Currently Working

| Feature | URL/Command | What to Check |
|---------|-------------|---------------|
| **Frontend** | http://localhost:3000 | Homepage loads with OSA branding |
| **Backend** | http://localhost:3001/api | API is running (404 expected) |
| **Database** | http://127.0.0.1:54323 | View all 14 tables in Studio |
| **Seed Data** | Supabase Studio → Tables | 10 event categories, 4 membership types |
| **Prisma Studio** | `pnpm --filter=api prisma studio` | Browse database visually |
| **Email Inbox** | http://127.0.0.1:54324 | Mailpit catches all emails |

### 📊 Database Tables (14 Models)

All tables are created and ready:
- `users` - Core user accounts
- `profiles` - Extended user information
- `memberships` - User membership records
- `membership_types` - Available tiers (seeded with 4 types)
- `events` - Event listings
- `event_categories` - Event categories (seeded with 10 categories)
- `event_registrations` - Event signups
- `waitlist` - Event waitlists
- `articles` - News articles
- `static_pages` - CMS pages
- `payments` - Payment transactions
- `media` - File uploads
- `audit_logs` - Action tracking

### 🔧 Database Triggers (3 Installed)

- **Auth User Sync**: Auto-creates user record when signing up via Supabase
- **Seat Counter**: Auto-updates event capacity when registrations change
- **Waitlist Position**: Auto-assigns queue position when joining waitlist

### ❌ Not Yet Implemented (Phase 2+)

- User signup/login UI
- Event registration UI
- Stripe payment integration
- Admin dashboard UI
- Content management UI

## 🔌 API Endpoints

### Authentication

All protected endpoints require a JWT token from Supabase Auth. Include the token in the Authorization header:

```bash
Authorization: Bearer <your-jwt-token>
```

### Users API (`/api/users`)

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `GET` | `/api/users/me` | ✅ | Any | Get current user profile |
| `POST` | `/api/users/me/profile` | ✅ | Any | Create user profile |
| `PUT` | `/api/users/me/profile` | ✅ | Any | Update user profile |
| `GET` | `/api/users/me/export` | ✅ | Any | Export user data (GDPR) |
| `DELETE` | `/api/users/me` | ✅ | Any | Soft delete account |
| `GET` | `/api/users` | ✅ | ADMIN | List all users (paginated) |
| `GET` | `/api/users/:id` | ✅ | ADMIN | Get user by ID |
| `PUT` | `/api/users/:id/role` | ✅ | ADMIN | Update user role |
| `GET` | `/api/users/:id/export` | ✅ | ADMIN | Export user data by ID |
| `DELETE` | `/api/users/:id` | ✅ | ADMIN | Soft delete user by ID |

**Example: Create Profile**
```bash
curl -X POST http://localhost:3001/api/users/me/profile \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "address": {
      "street": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zip": "10001",
      "country": "USA"
    }
  }'
```

### Memberships API (`/api/memberships`)

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `POST` | `/api/memberships` | ✅ | Any | Apply for membership |
| `GET` | `/api/memberships/me` | ✅ | Any | Get own membership |
| `DELETE` | `/api/memberships/me` | ✅ | Any | Cancel own membership |
| `GET` | `/api/memberships` | ✅ | ADMIN | List all memberships |
| `GET` | `/api/memberships/:id` | ✅ | ADMIN | Get membership by ID |
| `POST` | `/api/memberships/:id/approve` | ✅ | ADMIN | Approve pending membership |
| `POST` | `/api/memberships/:id/reject` | ✅ | ADMIN | Reject pending membership |
| `DELETE` | `/api/memberships/:id` | ✅ | ADMIN | Cancel membership by ID |

**Example: Apply for Membership**
```bash
curl -X POST http://localhost:3001/api/memberships \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "membershipTypeId": "uuid-of-membership-type"
  }'
```

**Example: Approve Membership (Admin)**
```bash
curl -X POST http://localhost:3001/api/memberships/<membership-id>/approve \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "approvalNote": "Approved - Payment received via check #1234"
  }'
```

**Example: List All Memberships (Admin)**
```bash
curl -X GET "http://localhost:3001/api/memberships?skip=0&take=10&status=PENDING" \
  -H "Authorization: Bearer <admin-token>"
```

### Membership Status Flow

```
PENDING → ACTIVE → EXPIRED
   ↓         ↓
CANCELLED  CANCELLED
```

- **PENDING**: Application submitted, awaiting admin approval
- **ACTIVE**: Approved and valid membership
- **EXPIRED**: Membership passed expiry date
- **CANCELLED**: User or admin cancelled the membership

## 🛠️ Common Commands

### Development

```bash
# Start all apps
pnpm dev

# Build all apps
pnpm build

# Run tests
pnpm test

# Lint code
pnpm lint

# Format code
pnpm format
```

### Database

```bash
# Open Prisma Studio
pnpm --filter=api prisma studio

# Create a new migration
cd apps/api
pnpm prisma migrate dev --name <migration_name>

# Apply migrations
pnpm prisma migrate deploy

# Reset database (⚠️ deletes all data)
pnpm prisma migrate reset

# Seed database
pnpm prisma db seed
```

### Supabase

```bash
# Start Supabase
supabase start

# Stop Supabase
supabase stop

# View Supabase status
supabase status

# Open Supabase Studio
open http://127.0.0.1:54323
```

### Clean Up

```bash
# Clean all build artifacts
pnpm clean

# Stop Supabase and remove containers
supabase stop --all
docker system prune -f
```

## 📖 Documentation

- **Architecture**: See `docs/osa-architecture.md`
- **Work Orchestration**: See `docs/work-orchestration.md` ← start here if you're a new contributor
- **Feature Specs**: See `specs/active/`
- **SDD Workflow**: See `specs/README.md`
- **Postman Collection**: See `postman/README.md`

## 🎯 Implementation Status

- **Phase 1**: ✅ Foundation (Complete)
  - Monorepo setup with Turborepo + pnpm
  - Database schema with Prisma
  - Local development with Supabase
  - Seed data for membership types & event categories

- **Phase 2**: ⏳ User & Membership (In Progress)
  - ✅ User authentication with Supabase Auth (JIT Sync)
  - ✅ User profiles (CRUD operations)
  - ✅ Role-based access control (GUEST, MEMBER, CONTRIBUTOR, ADMIN)
  - ✅ Membership application & approval workflow
  - ✅ Admin approval system with notes
  - ⏳ Stripe payment integration (Next)
  - 📋 Email notifications

- **Phase 3-6**: 📋 Planned
  - Content Management System (Articles, Pages)
  - Event Registration & Waitlist
  - Testing & Optimization
  - Launch Preparation

## 🤝 Contributing

This project was built with Claude Code. For development:

1. Read `docs/osa-architecture.md` for system design
2. Review active specs in `specs/active/`
3. Follow coding standards (TypeScript, ESLint, Prettier)
4. Write tests for new features
5. Update documentation

## 📝 License

[Add license information]

## 🔗 Links

- **Supabase Dashboard**: https://app.supabase.com
- **Vercel Dashboard**: https://vercel.com
- **Railway Dashboard**: https://railway.app
- **Stripe Dashboard**: https://dashboard.stripe.com

---

**Built with ❤️ for The Odisha Society of the Americas**
