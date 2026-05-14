#!/usr/bin/env bash
# db-setup.sh — One-time database setup (run once per environment, not on every deploy)
#
# Usage:
#   ./scripts/db-setup.sh           # push schema + seed
#   ./scripts/db-setup.sh --seed    # seed only (schema already pushed)
#   ./scripts/db-setup.sh --schema  # schema only, skip seed
#
# Run from the repository root.

set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)/apps/web"
SEED=true
SCHEMA=true

for arg in "$@"; do
  case $arg in
    --seed)   SCHEMA=false ;;
    --schema) SEED=false ;;
  esac
done

echo "→ Working directory: $WEB_DIR"
cd "$WEB_DIR"

if [ "$SCHEMA" = true ]; then
  echo ""
  echo "▶ Pushing schema to database..."
  pnpm prisma db push
  echo "✔ Schema pushed"
fi

echo ""
echo "▶ Generating Prisma client..."
pnpm prisma generate
echo "✔ Prisma client generated"

if [ "$SEED" = true ]; then
  echo ""
  echo "▶ Seeding database (chapters, award names, membership fees)..."
  pnpm prisma:seed
  echo "✔ Database seeded"
fi

echo ""
echo "✔ Database setup complete"
