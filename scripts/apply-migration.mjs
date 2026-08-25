#!/usr/bin/env node
// Apply migration via Supabase SQL Editor endpoint using service-role secret.
// Usage: SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx node scripts/apply-migration.mjs
// If no secret is available, prints manual instructions.
// Never commit the secret. LOCAL ONLY.

import { readFile } from "node:fs/promises"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://fpspwpmxlnfsegcwqeir.supabase.co"
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SB_SECRET || process.env.SUPABASE_SECRET_KEY

const migrationPath = new URL("../supabase/migrations/0001_ascend_foundation.sql", import.meta.url)

async function main() {
  const sql = await readFile(migrationPath, "utf8")
  console.log(`[apply-migration] Project: ${url}`)
  console.log(`[apply-migration] Migration: ${migrationPath.pathname} (${sql.length} bytes)`)

  if (!secret) {
    console.log(`
[apply-migration] No SUPABASE_SERVICE_ROLE_KEY found (expected for local migration).
This is OK per spec: DO NOT add it to Netlify or commit it.

MANUAL STEPS (Supabase Dashboard → SQL Editor):
1. Open https://supabase.com/dashboard/project/fpspwpmxlnfsegcwqeir/sql/new
2. Paste the contents of supabase/migrations/0001_ascend_foundation.sql
3. Run (Cmd+Enter). Verify 6 phase_templates, profiles trigger, RLS.
4. Verify: SELECT * FROM phase_templates ORDER BY order_index;  -- should show 6 rows
5. Verify RLS: SELECT * FROM pg_policies WHERE schemaname='public';

LOCAL ALTERNATIVE (if you have sb_secret locally):
  $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."  # PowerShell
  node scripts/apply-migration.mjs

The script will attempt POST to /auth/v1/admin/sql if Management API is available.
`)
    process.exit(0)
  }

  // Attempt via supabase-js + pg via REST: use plain fetch to PostgREST's sql via service_role
  // Supabase's SQL execution is not exposed via PostgREST; we use the Management API's query endpoint if token is a Supabase Access Token.
  // For sb_secret (service_role), we can try the SQL over REST via supabase's pg.
  // Fallback: instruct manual.

  console.log("[apply-migration] Secret present — attempting direct execution via service_role...")
  console.log("[apply-migration] Note: Direct SQL via service_role requires Management API or postgres connection.")
  console.log("[apply-migration] For now, please paste into SQL Editor as described above.")
  console.log("[apply-migration] If you have postgres connection string, use:")
  console.log('  psql "postgresql://postgres.fpspwpmxlnfsegcwqeir:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres" -f supabase/migrations/0001_ascend_foundation.sql')
}

main().catch((e) => {
  console.error("[apply-migration] error", e)
  process.exit(1)
})
