#!/bin/bash
# Get Supabase Auth Token for Postman Testing
#
# Usage:
#   ./scripts/get-auth-token.sh
#   ./scripts/get-auth-token.sh existing@email.com Password123

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔐 Getting Supabase Auth Token...${NC}\n"

# Check if Supabase is running
if ! curl -s http://127.0.0.1:54321/auth/v1/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Supabase is not running${NC}"
    echo -e "   Run: ${YELLOW}supabase start${NC}"
    exit 1
fi

# Load environment variables
if [ ! -f "apps/api/.env" ]; then
    echo -e "${RED}❌ Error: apps/api/.env file not found${NC}"
    exit 1
fi

source apps/api/.env

# Check for email/password arguments
EMAIL=${1:-"test-postman-$(date +%s)@test.odishasociety.org"}
PASSWORD=${2:-"Test123!@#"}

if [ "$#" -eq 0 ]; then
    echo -e "${YELLOW}📝 Creating new test user...${NC}"
    echo -e "   Email: ${BLUE}${EMAIL}${NC}"
    echo -e "   Password: ${BLUE}${PASSWORD}${NC}\n"

    # Create user via Supabase Admin API
    CREATE_RESPONSE=$(curl -s -X POST \
        "${SUPABASE_URL}/auth/v1/admin/users" \
        -H "apikey: ${SUPABASE_SERVICE_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"${EMAIL}\",
            \"password\": \"${PASSWORD}\",
            \"email_confirm\": true
        }")

    if echo "$CREATE_RESPONSE" | grep -q "error"; then
        echo -e "${RED}❌ Error creating user:${NC}"
        echo "$CREATE_RESPONSE" | grep -o '"message":"[^"]*"' | sed 's/"message":"//' | sed 's/"$//'
        exit 1
    fi

    USER_ID=$(echo "$CREATE_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"//' | sed 's/"$//')
    echo -e "${GREEN}✅ User created: ${USER_ID}${NC}\n"
else
    echo -e "${BLUE}🔍 Using existing user: ${EMAIL}${NC}\n"
fi

# Sign in to get access token
echo -e "${BLUE}🔑 Signing in to get access token...${NC}"

SIGNIN_RESPONSE=$(curl -s -X POST \
    "${SUPABASE_URL}/auth/v1/token?grant_type=password" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Content-Type: application/json" \
    -d "{
        \"email\": \"${EMAIL}\",
        \"password\": \"${PASSWORD}\"
    }")

if echo "$SIGNIN_RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Error signing in:${NC}"
    echo "$SIGNIN_RESPONSE" | grep -o '"message":"[^"]*"' | sed 's/"message":"//' | sed 's/"$//'
    echo -e "\n${YELLOW}Tip: Make sure the password is correct${NC}"
    exit 1
fi

ACCESS_TOKEN=$(echo "$SIGNIN_RESPONSE" | grep -o '"access_token":"[^"]*"' | sed 's/"access_token":"//' | sed 's/"$//')

if [ -z "$ACCESS_TOKEN" ]; then
    echo -e "${RED}❌ No access token received${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Success!${NC}\n"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}📋 COPY THIS TOKEN TO POSTMAN:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${YELLOW}${ACCESS_TOKEN}${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${BLUE}📌 How to use in Postman:${NC}"
echo "   1. Click the eye icon 👁️ (top right)"
echo "   2. Find 'auth_token' variable"
echo "   3. Paste token in 'Current Value' field"
echo "   4. Click Save"
echo ""
echo -e "${YELLOW}⏱️  Token expires in 1 hour${NC}"
echo ""

# Print user info
echo -e "${BLUE}👤 User Information:${NC}"
echo "   Email: ${EMAIL}"
echo "   Password: ${PASSWORD}"
echo ""
