// Ascend Phase 4 integration test — quests, XP security, levels.
// Requires an existing test account:
//   TEST_EMAIL=you@example.com TEST_PASSWORD=secret node scripts/test-phase4.mjs
import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const email = process.env.TEST_EMAIL
const password = process.env.TEST_PASSWORD

if (!url || !key || !email || !password) {
  console.log("SKIP: set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, TEST_EMAIL, TEST_PASSWORD to run.")
  process.exit(0)
}

const results = []
function check(name, pass, detail = "") {
  results.push({ name, pass })
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`)
}

const sb = createClient(url, key)

const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email, password })
if (authErr || !auth.user) {
  console.error("FATAL: sign-in failed:", authErr?.message)
  process.exit(1)
}
const userId = auth.user.id
console.log(`Signed in as ${email}`)

// JS mirror of the SQL level formula
const jsXpForLevel = (l) => (l <= 1 ? 0 : Math.round(25 * Math.pow(l - 1, 2.35)))

let createdQuestId = null

try {
  // Formula parity between TS and Postgres
  const { data: sqlXp8 } = await sb.rpc("xp_for_level", { p_level: 8 })
  check("level formula parity L8", Number(sqlXp8) === jsXpForLevel(8), `sql=${sqlXp8} js=${jsXpForLevel(8)}`)

  // CREATE quest
  const { data: q, error: qErr } = await sb
    .from("quests")
    .insert({
      user_id: userId,
      title: "[TEST] Phase4 integration quest",
      category: "intellect",
      difficulty: "medium",
      xp_reward: 40,
      estimated_duration: 15,
      recurrence: "none",
      status: "active",
    })
    .select("id")
    .single()
  if (qErr) throw new Error("create failed: " + qErr.message)
  createdQuestId = q.id
  check("create quest", true)

  // VIEW quest
  const { data: seen } = await sb.from("quests").select("*").eq("id", createdQuestId).single()
  check("view quest", !!seen && seen.title.includes("[TEST]"))

  const beforeXp = await sb.from("xp_transactions").select("amount").eq("user_id", userId)
  const beforeTotal = (beforeXp.data ?? []).reduce((s, r) => s + r.amount, 0)

  // COMPLETE quest
  const first = await sb.rpc("complete_quest", { p_quest_id: createdQuestId })
  const r1 = first.data
  check("complete quest ok", r1?.ok === true && r1.already_completed === false, JSON.stringify(r1))
  check("xp awarded", r1?.xp_awarded === 40, `awarded=${r1?.xp_awarded}`)
  check("quest marked completed", (await sb.from("quests").select("status").eq("id", createdQuestId).single()).data?.status === "completed")

  // DUPLICATE completion prevention
  const second = await sb.rpc("complete_quest", { p_quest_id: createdQuestId })
  const r2 = second.data
  check("duplicate blocked", r2?.ok === true && r2.already_completed === true && r2.xp_awarded === 0, JSON.stringify(r2))

  // XP ledger integrity
  const afterXp = await sb.from("xp_transactions").select("amount").eq("user_id", userId)
  const afterTotal = (afterXp.data ?? []).reduce((s, r) => s + r.amount, 0)
  check("xp total delta == 40", afterTotal - beforeTotal === 40, `delta=${afterTotal - beforeTotal}`)
  const dupRows = (afterXp.data ?? []).length - (beforeXp.data ?? []).length
  check("exactly one xp transaction", dupRows === 1, `added=${dupRows}`)
} catch (e) {
  check("unexpected error", false, e instanceof Error ? e.message : String(e))
} finally {
  if (createdQuestId) {
    await sb.from("xp_transactions").delete().eq("user_id", userId).like("source_key", `quest:${createdQuestId}%`)
    await sb.from("quests").delete().eq("id", createdQuestId).eq("user_id", userId)
    console.log("cleanup done")
  }
}

const failed = results.filter((r) => !r.pass)
console.log(failed.length === 0 ? "\nALL CHECKS PASSED" : `\n${failed.length} CHECK(S) FAILED`)
process.exit(failed.length === 0 ? 0 : 2)
