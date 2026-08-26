/**
 * Phase 8 integration test — Momentum + Recovery + Reflection
 * Requires: TEST_EMAIL / TEST_PASSWORD env vars.
 *
 * Verifies (all against the live database):
 *  1. Quest completion creates/updates today's momentum ledger row
 *  2. log_recovery RPC credits recovery days and accumulates kinds
 *  3. Structured reflections persist all four answers
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
const authed = createClient(url, key, { global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } } })
const uid = auth.user.id
const todayIso = new Date().toISOString().slice(0, 10)

// Parent phase for quest inserts
let { data: parentPhase } = await authed.from("phases").select("id").eq("user_id", uid).is("goal_id", null).limit(1)
if (!parentPhase || parentPhase.length === 0) {
  const ins = await authed.from("phases").insert({ user_id: uid, title: "P8 Test Phase", order_index: 98, status: "active" }).select("id").single()
  parentPhase = [ins.data]
}

// ---- 1) Quest completion updates momentum ----
const beforeRes = await authed.from("momentum").select("score").eq("user_id", uid).eq("date", todayIso).maybeSingle()
const scoreBefore = beforeRes.data?.score ?? 0

const { data: q1 } = await authed
  .from("quests")
  .insert({ user_id: uid, phase_id: parentPhase[0].id, title: `P8 momentum ${Date.now()}`, category: "discipline", difficulty: "hard", xp_reward: 20, recurrence: "none", status: "active" })
  .select("id")
  .single()
const { data: done1 } = await authed.rpc("complete_quest", { p_quest_id: q1.id })
check("quest completion ok", done1?.ok === true, JSON.stringify(done1))

const afterRes = await authed.from("momentum").select("score,recovery").eq("user_id", uid).eq("date", todayIso).maybeSingle()
check("momentum row exists today", !!afterRes.data)
check("momentum score increased with activity", (afterRes.data?.score ?? 0) > scoreBefore, `${scoreBefore} -> ${afterRes.data?.score}`)

// ---- 2) Recovery days ----
const { data: rec1 } = await authed.rpc("log_recovery", { p_kind: "rest" })
check("recovery rest logged", rec1?.ok === true && (rec1.recovery_kinds ?? []).includes("rest"), JSON.stringify(rec1))
const { data: rec2 } = await authed.rpc("log_recovery", { p_kind: "planning" })
check("second kind accumulates on same day", rec2?.ok === true && rec2.recovery_kinds.includes("planning") && rec2.recovery_kinds.includes("rest"), JSON.stringify(rec2))
const { data: badKind } = await authed.rpc("log_recovery", { p_kind: "extreme_diet" })
check("invalid kind rejected", badKind?.ok === false, JSON.stringify(badKind))

const afterRec = await authed.from("momentum").select("score,recovery,recovery_kinds").eq("user_id", uid).eq("date", todayIso).maybeSingle()
check("recovery persisted to ledger", afterRec.data?.recovery === true && (afterRec.data?.recovery_kinds ?? []).length >= 2, JSON.stringify(afterRec.data))

// ---- 3) Structured reflection storage ----
const { data: reflPhase } = await authed
  .from("phases")
  .insert({ user_id: uid, title: "P8 Reflection Phase", order_index: 97, status: "completed", completed_at: new Date().toISOString() })
  .select("id")
  .single()

const answers = {
  learnings: "Slow weeks teach more than sprint weeks.",
  worked: "Morning quests.",
  didnt_work: "Late-night sessions.",
  change_plan: "Cap work at 21:30.",
}
const bodyText = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join("\n\n")
const { data: savedRefl, error: rErr } = await authed
  .from("reflections")
  .insert({
    user_id: uid,
    phase_id: reflPhase.id,
    body: bodyText.slice(0, 5000),
    learnings: answers.learnings,
    worked: answers.worked,
    didnt_work: answers.didnt_work,
    change_plan: answers.change_plan,
  })
  .select("learnings,worked,didnt_work,change_plan,body")
  .single()
check("structured reflection stored", !rErr && savedRefl?.learnings === answers.learnings && savedRefl?.change_plan === answers.change_plan, rErr?.message ?? "")

const { data: updRefl, error: uErr } = await authed
  .from("reflections")
  .update({ ...answers, change_plan: "Cap work at 21:00.", body: bodyText.replace("21:30", "21:00") })
  .eq("phase_id", reflPhase.id)
  .eq("user_id", uid)
  .select("change_plan")
  .single()
check("reflection update works", !uErr && updRefl?.change_plan === "Cap work at 21:00.", uErr?.message ?? "")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
