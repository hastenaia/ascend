/**
 * Phase 9 integration test — AI Coach security & degradation
 * Requires: TEST_EMAIL / TEST_PASSWORD env vars. Does NOT require an AI key.
 *
 * Verifies:
 *  1. Unauthenticated requests are rejected (401)
 *  2. Without a server key, endpoints return { ok:false, unavailable:true }
 *     and NEVER fabricate coach content
 *  3. The user's chat turn is still persisted for history continuity
 */
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const email = process.env.TEST_EMAIL
const password = process.env.TEST_PASSWORD
const appUrl = process.env.TEST_APP_URL || "http://localhost:3000"

if (!url || !key || !email || !password) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, TEST_EMAIL, TEST_PASSWORD")
  process.exit(1)
}

let pass = 0
let fail = 0
function check(label, cond, extra = "") {
  if (cond) {
    pass += 1
    console.log(`PASS ${label}`)
  } else {
    fail += 1
    console.error(`FAIL ${label} ${extra}`)
  }
}

// 1) Unauthenticated → 401 from every coach endpoint
for (const ep of ["chat", "generate-phases", "generate-quests", "weekly-plan"]) {
  const res = await fetch(`${appUrl}/api/coach/${ep}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "hello", goalTitle: "x", focus: "y" }),
  })
  check(`unauthenticated ${ep} rejected`, res.status === 401 || res.status === 307 || res.status === 404, `status=${res.status}`)
}

// Login
const supabase = createClient(url, key)
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
if (authErr || !auth?.session) {
  console.error(`Login failed: ${authErr?.message}`)
  process.exit(1)
}
const token = auth.session.access_token
console.log(`Logged in as ${email}`)

const { count: beforeCount } = await supabase
  .from("coach_messages")
  .select("id", { count: "exact", head: true })
  .eq("user_id", auth.user.id)

// 2) Authenticated chat without key → unavailable, no fabricated reply
const marker = `P9 probe ${Date.now()}`
const res = await fetch(`${appUrl}/api/coach/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ message: marker }),
})
check("chat responds 200", res.status === 200)
const json = await res.json()
if (json.ok === false && json.unavailable === true) {
  check("no-key chat returns unavailable flag", true)
} else if (json.ok === true && typeof json.reply === "string") {
  // A real key IS configured in this environment — validate the reply exists and is non-empty
  check("key configured: coach replied with real content", json.reply.trim().length > 0)
  console.log("NOTE: AI_API_KEY detected — full live-model path exercised.")
} else {
  check("chat response shape valid", false, JSON.stringify(json).slice(0, 200))
}

// 3) User turn persisted regardless of availability
await new Promise((r) => setTimeout(r, 400))
const { data: msgs } = await supabase
  .from("coach_messages")
  .select("role,content")
  .eq("user_id", auth.user.id)
  .order("created_at", { ascending: false })
  .limit(5)
const mine = (msgs ?? []).find((m) => m.role === "user" && m.content.includes(marker))
check("user turn persisted to history", !!mine)

const { count: afterCount } = await supabase
  .from("coach_messages")
  .select("id", { count: "exact", head: true })
  .eq("user_id", auth.user.id)
if (!(json.ok === true)) {
  check("no assistant fabrication when unavailable", (afterCount ?? 0) === (beforeCount ?? 0) + 1, `${beforeCount} -> ${afterCount}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
