import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config()
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

function logEnvStatus() {
  const urlExists = Boolean(url)
  const keyExists = Boolean(key)
  console.log(`NEXT_PUBLIC_SUPABASE_URL exists: ${urlExists}`)
  console.log(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY exists: ${keyExists}`)

  if (urlExists) {
    try {
      const hostname = new URL(url).hostname
      console.log(`Supabase hostname: ${hostname}`)
    } catch {
      console.log('Supabase URL is not a valid URL')
    }
  } else {
    console.log('Supabase hostname: (not available - URL missing)')
  }

  if (keyExists) {
    console.log(`Publishable key length: ${key.length}`)
    console.log(`Publishable key prefix: ${key.startsWith('sb_publishable_') ? 'sb_publishable_' : '(unexpected prefix)'}`)
  } else {
    console.log('Publishable key length: (not available - key missing)')
  }
}

logEnvStatus()

if (!url || !key) {
  console.error('Missing required environment variables. Ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set in .env.local')
  process.exit(1)
}

let supabase
try {
  supabase = createClient(url, key)
  console.log('Supabase client initialized successfully')
} catch (err) {
  console.error('Failed to create Supabase client:', err instanceof Error ? err.message : String(err))
  process.exit(1)
}

try {
  const { data, error } = await supabase.from('phase_templates').select('slug').limit(1)
  if (error) {
    if (error.code === 'PGRST205' || error.message.includes('Could not find the table')) {
      console.error('Migration missing: phase_templates table not found (PGRST205). Apply supabase/migrations/0001_ascend_foundation.sql then 0002_phase_system.sql via Supabase Dashboard → SQL Editor.')
      process.exit(2)
    }
    console.error(`phase_templates query failed: ${error.message} (code: ${error.code ?? 'unknown'})`)
    process.exit(3)
  }
  console.log(`phase_templates query succeeded: found ${data?.length ?? 0} row(s)`)
  process.exit(0)
} catch (err) {
  console.error('Unexpected error querying phase_templates:', err instanceof Error ? err.message : String(err))
  process.exit(3)
}
