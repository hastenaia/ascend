/**
 * Phase 6 integration test — Journey + Achievements
 * Requires: TEST_EMAIL / TEST_PASSWORD env vars (email confirm ON blocks self-signup).
 *
 * Verifies:
 *  1. Achievement catalog is seeded and readable
 *  2. Completing a real quest triggers FIRST STEP unlock + achievement XP ledger row
 *  3. Unlock is idempotent — no duplicate unlocks/XP on repeat completions
 */
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const email = process.env.TEST_EMAIL
const password = process.env.TEST_PASSWORD

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

const supabase = createClient(url, key)
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
if (authErr || !auth?.session) {
  console.error(`Login failed: ${authErr?.message}`)
  process.exit(1)
}
const token = auth.session.access_token
const authed = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } } })
console.log(`Logged in as ${email}`)

// 1) Catalog seeded
const { data: catalog } = await authed.from("achievements").select("slug,name,xp_reward,sort_order").order("sort_order")
check("catalog has >= 6 achievements", (catalog ?? []).length >= 6, `got ${(catalog ?? []).length}`)

// Baseline unlocks
const { data: baselineUnlocks } = await authed.from("user_achievements").select("achievement_id")
const hadFirstStep = ((baselineUnlocks ?? []).length ?? 0) > 0

// 2) Ensure a parent phase exists (quests_parent constraint), create quest, complete via RPC
let { data: parentPhase } = await authed
  .from("phases")
  .select("id")
  .eq("user_id", auth.user.id)
  .is("goal_id", null)
  .limit(1)
if (!parentPhase || parentPhase.length === 0) {
  const ins = await authed
    .from("phases")
    .insert({ user_id: auth.user.id, title: "P6 Test Phase", order_index: 99, status: "active" })
    .select("id")
    .single()
  if (ins.error) {
    console.error(`Phase bootstrap failed: ${ins.error.message}`)
    process.exit(1)
  }
  parentPhase = [ins.data]
}

const { data: quest, error: qErr } = await authed
  .from("quests")
  .insert({
    user_id: auth.user.id,
    phase_id: parentPhase[0].id,
    title: `P6 test ${Date.now()}`,
    category: "intellect",
    difficulty: "medium",
    xp_reward: 20,
    estimated_duration: 30,
    recurrence: "none",
    status: "active",
  })
  .select("id")
  .single()
if (qErr || !quest) {
  console.error(`Quest insert failed: ${qErr?.message}`)
  process.exit(1)
}

const { data: result, error: rpcErr } = await authed.rpc("complete_quest", { p_quest_id: quest.id })
if (rpcErr) {
  console.error(`complete_quest failed: ${rpcErr.message}`)
  process.exit(1)
}
check("complete_quest ok", result?.ok === true, JSON.stringify(result))
check("quest XP awarded > 0", (result?.xp_awarded ?? 0) > 0)

const unlocked = result?.unlocked_achievements ?? []
if (!hadFirstStep) {
  check("FIRST STEP unlocked by first completion", unlocked.some((a) => a.slug === "first-step"), JSON.stringify(unlocked))
} else {
  check("no duplicate unlock when already owned", Array.isArray(unlocked) && unlocked.length === 0, JSON.stringify(unlocked))
}

// Achievement XP landed in the ledger exactly once
const { data: achTx } = await authed
  .from("xp_transactions")
  .select("amount,source_key")
  .eq("source_key", "achievement:first-step")
check("achievement XP ledger row exists", (achTx ?? []).length === 1, `rows=${(achTx ?? []).length}`)

// 3) Idempotency: complete again → no new unlocks, no duplicate rows
await new Promise((r) => setTimeout(r, 300))
const { data: dup } = await authed.rpc("complete_quest", { p_quest_id: quest.id })
check("repeat completion reports already_completed", dup?.already_completed === true)
check("repeat completion unlocks nothing", ((dup?.unlocked_achievements ?? []) ?? []).length === 0)

const { data: uaRows } = await authed
  .from("user_achievements")
  .select("achievement_id")
  .eq("user_id", auth.user.id)
const distinct = new Set((uaRows ?? []).map((r) => r.achievement_id))
check("user_achievements rows unique per achievement", distinct.size === (uaRows ?? []).length)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
