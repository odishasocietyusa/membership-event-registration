# OSA Community Platform

> Membership and Event Management System for The Odisha Society of the Americas

A full-stack platform for managing memberships, event registrations, and community content — built as a single Next.js application with Supabase Auth, Prisma ORM, Stripe payments, and Sanity CMS.

## 🏗️ Tech Stack

- **Framework**: Next.js 15.1.4 (App Router) + Tailwind CSS + React 19
- **API**: Next.js Route Handlers (`app/api/`) — no separate backend
- **Database**: PostgreSQL via Supabase · Prisma 6.2.0 ORM
- **Auth**: Supabase Auth (email/password + Google OAuth)
- **CMS**: Sanity (events, news, announcements, static pages)
- **Payments**: Stripe
- **Email**: Resend
- **Monorepo**: Turborepo + pnpm workspaces

## 📁 Project Structure

```
osa-community-platform/
├── apps/
│   ├── web/          # Next.js app (port 3000) — frontend + API + Prisma
│   └── supabase/     # Local Supabase config
├── packages/
│   ├── shared-types/ # Shared TypeScript types
│   ├── validation/   # Zod validation schemas
│   └── config/       # Shared configuration
├── docs/             # Architecture reference
└── specs/            # Feature specs and SDD workflow
```

## 💻 Local Developer Setup

Complete these steps **once** before running the project for the first time.

---

### 1. Node.js (v20 or higher)

```bash
node --version   # must be >= 20.0.0

# Install via nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.zshrc
nvm install 22 && nvm use 22
```

---

### 2. pnpm (v11 or higher)

```bash
pnpm --version   # must be >= 11.0.0
npm install -g pnpm@latest
```

---

### 3. Docker Desktop

Required to run Supabase locally.

```bash
docker --version
# Install from https://www.docker.com/products/docker-desktop/
# Open Docker Desktop and wait for "Engine running" before continuing.
```

---

### 4. Supabase CLI

```bash
supabase --version   # must be >= 2.0.0
brew install supabase/tap/supabase   # macOS
supabase login
```

---

### 5. Stripe CLI (optional — for webhook testing)

```bash
brew install stripe/stripe-cli/stripe
stripe login
```

---

### Verify All Tools

```bash
echo "Node:     $(node --version)"
echo "pnpm:     $(pnpm --version)"
echo "Docker:   $(docker --version)"
echo "Supabase: $(supabase --version)"
```

---

## 🚀 How to Run

### Initial Setup

```bash
# 1. Clone and install
git clone <repo-url>
cd membership-event-registration
pnpm install

# 2. Start local Supabase (PostgreSQL + Auth + Studio + Mailpit)
supabase start

# 3. Configure environment
cp apps/web/.env.example apps/web/.env.local
# Fill in the values printed by: supabase status

# 4. Push schema and seed data
cd apps/web
npx prisma db push
npx prisma db seed
cd ../..
```

### Start Development

```bash
pnpm dev                   # starts Next.js on http://localhost:3000
```

**Services available at:**
| Service | URL |
|---------|-----|
| Frontend + API | http://localhost:3000 |
| Supabase Studio | http://127.0.0.1:54323 |
| Mailpit (email) | http://127.0.0.1:54324 |

### Verify Installation

```bash
curl http://localhost:3000               # Next.js responds
curl http://localhost:3000/api/memberships/types  # returns membership fee tiers

cd apps/web && npx prisma studio         # visual DB browser on :5555
```

## 🧪 Testing

### Playwright E2E Tests

```bash
# Run all e2e tests (Playwright auto-starts Next.js)
pnpm --filter=web test:e2e

# Interactive UI mode
pnpm --filter=web test:e2e:ui

# Single spec
cd apps/web && npx playwright test e2e/memberships.spec.ts
```

### Jest Unit Tests

```bash
pnpm --filter=web test
```

### Manual API Testing

```bash
# Get a token
./scripts/get-auth-token.sh

# Use it
curl http://localhost:3000/api/members/me \
  -H "Authorization: Bearer <token>"
```

## 🔌 API Endpoints (summary)

All endpoints live at `http://localhost:3000/api/...`.

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/auth/me` | ✅ | Get current user |

### Members
| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `GET` | `/api/members/me` | ✅ | Any | Get own record |
| `PUT` | `/api/members/me` | ✅ | Any | Update profile |
| `DELETE` | `/api/members/me` | ✅ | Any | Soft-delete account |
| `GET` | `/api/members/me/family` | ✅ | Any | List family members |
| `POST` | `/api/members/me/family` | ✅ | Any | Add family member |
| `GET` | `/api/members/me/export` | ✅ | Any | GDPR data export |
| `GET` | `/api/members/search` | ✅ | Active | Search members |
| `GET` | `/api/members` | ✅ | Admin | List all members |
| `PUT` | `/api/members/:id/role` | ✅ | Admin | Update role |

### Memberships
| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| `GET` | `/api/memberships/types` | ❌ | Public | List membership fee tiers |
| `POST` | `/api/memberships` | ✅ | Any | Apply for membership |
| `GET` | `/api/memberships/me` | ✅ | Any | Get own membership status |
| `DELETE` | `/api/memberships/me` | ✅ | Any | Cancel membership |
| `GET` | `/api/memberships/me/history` | ✅ | Any | Membership history |
| `GET` | `/api/memberships` | ✅ | Admin | List all memberships |
| `POST` | `/api/memberships/:id/approve` | ✅ | Admin | Approve pending |
| `POST` | `/api/memberships/:id/reject` | ✅ | Admin | Reject pending |
| `POST` | `/api/memberships/honorary/assign` | ✅ | Admin | Grant honorary membership |

### Payments
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/payments/me` | ✅ | Own payment history |
| `POST` | `/api/payments/checkout-session` | ✅ | Create Stripe checkout |
| `POST` | `/api/payments/upgrade-session` | ✅ | Create Stripe upgrade checkout |
| `POST` | `/api/webhooks/stripe` | — | Stripe webhook handler |

**Example — apply for membership:**
```bash
curl -X POST http://localhost:3000/api/memberships \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "membershipType": "annualSingle" }'
```

**Example — create checkout session:**
```bash
curl -X POST http://localhost:3000/api/payments/checkout-session \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{ "membershipType": "annualSingle" }'
```

## 🛠️ Common Commands

```bash
# Dev
pnpm dev
pnpm build
pnpm lint
pnpm format

# Database (from apps/web/)
cd apps/web
npx prisma db push       # sync schema to local DB
npx prisma db seed       # seed membership fee tiers
npx prisma studio        # visual DB browser
npx prisma generate      # regenerate Prisma client after schema change

# Supabase
supabase start
supabase stop
supabase status

# Clean up
pnpm clean
supabase stop --all && docker system prune -f
```

## 📖 Documentation

- **Architecture**: `docs/osa-architecture.md`
- **Feature Specs**: `specs/active/`
- **SDD Workflow**: `specs/README.md`

## 🎯 Implementation Status

- ✅ Turborepo monorepo + Supabase local stack + Prisma schema
- ✅ Supabase Auth — email/password + Google OAuth
- ✅ Full API layer — members, memberships, payments, messages, chapters, webhooks
- ✅ Frontend pages — login, register, dashboard, profile, membership, admin, public content
- ✅ Playwright e2e suite (~66 tests) + Jest unit tests
- ✅ Sanity CMS integration — events, news, announcements
- 📋 Events registration module — planned

## 🤝 Contributing

1. Read `docs/osa-architecture.md` for system design
2. Review active specs in `specs/active/`
3. Follow the spec-driven development workflow (`specs/README.md`)
4. Use TypeScript strict mode, Zod for validation, ESLint + Prettier

## 📝 License

[Add license information]

---

**Built with ❤️ for The Odisha Society of the Americas**
