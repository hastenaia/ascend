/**
 * Phase 7 integration test — Goals + Personalized Journeys
 * Requires: TEST_EMAIL / TEST_PASSWORD env vars.
 *
 * Verifies the full upward flow with REAL mechanisms:
 *   quest complete (RPC) -> milestone auto-complete ->
 *   phase completed -> goal auto-completes (award_phase_xp v3)
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
const uid = auth.user.id
console.log(`Logged in as ${email}`)

// Blueprints readable (migration 0007 applied?)
const { data: blueprints } = await authed.from("journey_blueprints").select("slug,phases").order("slug")
check("journey blueprints seeded", (blueprints ?? []).length >= 3, `got ${(blueprints ?? []).length}`)

// 1) Create goal
const goalTitle = `P7 flow test ${Date.now()}`
const { data: goal, error: gErr } = await authed
  .from("goals")
  .insert({
    user_id: uid,
    title: goalTitle,
    category: "skills",
    priority: "high",
    desired_outcome: "Automated verification of upward progress.",
    status: "active",
  })
  .select("id,status")
  .single()
if (gErr || !goal) {
  console.error(`Goal insert failed: ${gErr?.message}`)
  process.exit(1)
}
check("goal created", goal.status === "active")

// 2) Attach a two-phase journey (phase A active, B locked)
const { data: phases, error: pErr } = await authed
  .from("phases")
  .insert([
    { user_id: uid, goal_id: goal.id, title: "P7 Phase A", objective: "first", order_index: 1, phase_number: 1, status: "active", reward_xp: 10 },
    { user_id: uid, goal_id: goal.id, title: "P7 Phase B", objective: "second", order_index: 2, phase_number: 2, status: "locked", reward_xp: 10 },
  ])
  .select("id,title,status")
if (pErr || !phases || phases.length !== 2) {
  console.error(`Phases insert failed: ${pErr?.message}`)
  process.exit(1)
}
const phaseA = phases.find((p) => p.title.includes("A"))
const phaseB = phases.find((p) => p.title.includes("B"))
check("phases attached to goal", !!phaseA && !!phaseB && phaseA.status === "active")

// 3) Attach milestones to phase A + a quest on milestone M1
const { data: milestones, error: mErr } = await authed
  .from("milestones")
  .insert([
    { phase_id: phaseA.id, title: "M1", sort_order: 0, status: "pending", xp_reward: 5, is_final_challenge: false },
    { phase_id: phaseA.id, title: "M2", sort_order: 1, status: "pending", xp_reward: 5, is_final_challenge: false },
  ])
  .select("id,title,status")
if (mErr || !milestones || milestones.length !== 2) {
  console.error(`Milestones insert failed: ${mErr?.message}`)
  process.exit(1)
}
const m1 = milestones.find((m) => m.title === "M1")
const m2 = milestones.find((m) => m.title === "M2")

const { data: quest, error: qErr } = await authed
  .from("quests")
  .insert({ user_id: uid, milestone_id: m1.id, title: "P7 quest", xp_reward: 15, recurrence: "none", status: "active" })
  .select("id")
  .single()
if (qErr || !quest) {
  console.error(`Quest insert failed: ${qErr?.message}`)
  process.exit(1)
}

// 4) Complete the quest -> M1 flips automatically inside complete_quest RPC
const { data: res } = await authed.rpc("complete_quest", { p_quest_id: quest.id })
check("quest completion ok", res?.ok === true, JSON.stringify(res))
check("milestone auto-completed from quest", res?.milestone_updated === true)

const { data: m1After } = await authed.from("milestones").select("status").eq("id", m1.id).single()
check("M1 persisted as completed", m1After?.status === "completed")

// 5) Finish remaining milestone, then close both phases (as the UI actions do)
await authed.from("milestones").update({ status: "completed" }).eq("id", m2.id)
await authed.from("phases").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", phaseA.id).eq("user_id", uid)
await authed.from("phases").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", phaseB.id).eq("user_id", uid)

// 6) award_phase_xp triggers GOAL auto-completion (last incomplete phase closed)
const { data: award } = await authed.rpc("award_phase_xp", { p_phase_id: phaseA.id })
check("award_phase_xp ok", award?.ok === true, JSON.stringify(award))
check("rpc reports goal_completed", award?.goal_completed === true, JSON.stringify(award))

const { data: goalAfter } = await authed.from("goals").select("status,completed_at").eq("id", goal.id).single()
check("goal auto-completed (upward flow)", goalAfter?.status === "completed" && !!goalAfter?.completed_at, JSON.stringify(goalAfter))

// Idempotency: re-award doesn't break anything
const { data: award2 } = await authed.rpc("award_phase_xp", { p_phase_id: phaseA.id })
check("re-award idempotent", award2?.ok === true && award2?.already_awarded === true)

// Cleanup test journey (phases detach via FK set-null; goal removed)
await authed.from("phases").delete().in("id", [phaseA.id, phaseB.id])
await authed.from("goals").delete().eq("id", goal.id)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
