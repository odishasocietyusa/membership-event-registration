#!/bin/bash
# -----------------------------------------------------------------------------
# OSA Community Platform — Dynamic Target URL E2E Runner
# -----------------------------------------------------------------------------
# This script executes Playwright E2E tests against dynamic deployments
# safely and securely using environment variables.
# -----------------------------------------------------------------------------

set -e

# Curated HSL-tailored Hues for Premium UX Console outputs
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${CYAN}${BOLD}======================================================================${NC}"
echo -e "${CYAN}${BOLD}      OSA Community Platform — Dynamic E2E Test Suite Runner        ${NC}"
echo -e "${CYAN}${BOLD}======================================================================${NC}"

# 1. Pre-flight checks & Validation
errors=0

if [ -z "$BASE_URL" ]; then
  echo -e "${RED}❌ Error: 'BASE_URL' environment variable is not defined.${NC}"
  errors=$((errors + 1))
fi

if [ -z "$TEST_USER_EMAIL" ]; then
  echo -e "${RED}❌ Error: 'TEST_USER_EMAIL' environment variable is not defined.${NC}"
  errors=$((errors + 1))
fi

if [ -z "$TEST_USER_PASSWORD" ]; then
  echo -e "${RED}❌ Error: 'TEST_USER_PASSWORD' environment variable is not defined.${NC}"
  errors=$((errors + 1))
fi

if [ $errors -ne 0 ]; then
  echo -e "\n${YELLOW}💡 Usage Guide (Secure Environment Variable Execution):${NC}"
  echo -e "  To prevent credentials from appearing in your shell history or process list, run:"
  echo -e "  ${BOLD}BASE_URL=\"https://staging.your-website.com\" \\"
  echo -e "  TEST_USER_EMAIL=\"staging-member@your-website.com\" \\"
  echo -e "  TEST_USER_PASSWORD=\"StagingPassword123!\" \\"
  echo -e "  NEXT_PUBLIC_SUPABASE_URL=\"https://xxxx.supabase.co\" \\"
  echo -e "  NEXT_PUBLIC_SUPABASE_ANON_KEY=\"eyJhbG...\" \\"
  echo -e "  ./scripts/run-dynamic-tests.sh${NC}\n"
  exit 1
fi

# Export required environment variables
export BASE_URL="$BASE_URL"
export TEST_USER_EMAIL="$TEST_USER_EMAIL"
export TEST_USER_PASSWORD="$TEST_USER_PASSWORD"

# Optional remote Supabase configuration
if [ -n "$NEXT_PUBLIC_SUPABASE_URL" ]; then
  export NEXT_PUBLIC_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL"
fi
if [ -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]; then
  export NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY"
fi

echo -e "${BLUE}🎯 Target Deployment URL:${NC} ${BOLD}$BASE_URL${NC}"
echo -e "${BLUE}👤 Authenticating User :${NC} ${BOLD}$TEST_USER_EMAIL${NC}"
echo -e "${BLUE}🧪 Initializing E2E Runner...${NC}\n"

# 2. Trigger Playwright E2E Suite via PNPM filter
# Use a trap to ensure we return appropriate exit codes and display results gracefully
set +e
pnpm --filter=web test:e2e:dynamic
exit_code=$?
set -e

# 3. Post-execution report summary
echo -e "\n${CYAN}${BOLD}======================================================================${NC}"
if [ $exit_code -eq 0 ]; then
  echo -e "${GREEN}${BOLD}🎉 SUCCESS: All E2E test suites passed against $BASE_URL!${NC}"
else
  echo -e "${RED}${BOLD}🚨 FAILURE: One or more E2E tests failed. See details above.${NC}"
  echo -e "${YELLOW}💡 Tip: Check HTML reports inside apps/web/playwright-report/ for full traces & screenshots.${NC}"
fi
echo -e "${CYAN}${BOLD}======================================================================${NC}"

exit $exit_code
