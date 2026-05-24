#!/usr/bin/env ts-node
/**
 * Get a Supabase auth token for manual API testing (curl, Insomnia, etc.)
 *
 * Usage:
 *   npx tsx scripts/get-auth-token.ts
 *   npx tsx scripts/get-auth-token.ts test@example.com Test123!@#
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

// Load environment variables from apps/web/.env.local
dotenv.config({ path: resolve(__dirname, '../apps/web/.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  console.error('   Check apps/web/.env.local file');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function getAuthToken(email?: string, password?: string) {
  // Use provided credentials or defaults
  const testEmail = email || `test-postman-${Date.now()}@test.odishasociety.org`;
  const testPassword = password || 'Test123!@#';

  console.log('🔐 Getting auth token...\n');

  // If no email provided, create a new user
  if (!email) {
    console.log('📝 Creating new test user...');
    console.log(`   Email: ${testEmail}`);
    console.log(`   Password: ${testPassword}\n`);

    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true, // Auto-confirm for testing
    });

    if (createError) {
      console.error('❌ Error creating user:', createError.message);
      process.exit(1);
    }

    console.log('✅ User created:', userData.user?.id);
  } else {
    console.log('🔍 Using existing user...');
    console.log(`   Email: ${testEmail}\n`);
  }

  // Sign in to get access token
  console.log('🔑 Signing in to get access token...');
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });

  if (signInError) {
    console.error('❌ Error signing in:', signInError.message);
    console.error('   Make sure the password is correct');
    process.exit(1);
  }

  const accessToken = signInData.session?.access_token;

  if (!accessToken) {
    console.error('❌ No access token received');
    process.exit(1);
  }

  console.log('✅ Success!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 COPY THIS TOKEN TO POSTMAN:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(accessToken);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📌 How to use:');
  console.log('   curl http://localhost:3000/api/members/me \\');
  console.log('     -H "Authorization: Bearer $TOKEN"');
  console.log('\n🔄 Token expires in 1 hour\n');

  // Also print user info
  console.log('👤 User Information:');
  console.log(`   Email: ${testEmail}`);
  console.log(`   Password: ${testPassword}`);
  console.log(`   User ID: ${signInData.user?.id}`);
  console.log(`   Role: ${signInData.user?.role || 'authenticated'}`);
  console.log('');
}

// Parse command line arguments
const args = process.argv.slice(2);
const email = args[0];
const password = args[1];

getAuthToken(email, password).catch((error) => {
  console.error('❌ Unexpected error:', error.message);
  process.exit(1);
});
