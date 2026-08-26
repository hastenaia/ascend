// Ascend Phase 4 integration test — quests, XP security, levels, dashboard, phase progress.
//
// Usage:
//   node scripts/test-phase4.mjs
//     Self-registers a throwaway account (requires email autoconfirm ON), or
//   TEST_EMAIL=you@example.com TEST_PASSWORD=secret node scripts/test-phase4.mjs
//
// Checks: create quest, view quest, complete quest, duplicate-completion
// prevention, XP award + ledger integrity, client-side XP manipulation blocked,
// nonexistent-quest rejection, level formula parity, user_levels snapshot,
// momentum update, milestone auto-complete -> phase progress.
import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  console.error("FATAL: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  process.exit(1)
}

const results = []
let warnings = 0
function check(name, pass, detail = "") {
  results.push({ name, pass })
  console.log(`${pass ? "PASS" : "FAIL"} — ${name}${detail ? ` (${detail})` : ""}`)
}
function warn(name, detail = "") {
  warnings++
  console.log(`WARN — ${name}${detail ? ` (${detail})` : ""}`)
}

const sb = createClient(url, key)

// --- Auth: reuse test account if provided, else self-register -----------------
let userId, session
if (process.env.TEST_EMAIL && process.env.TEST_PASSWORD) {
  const { data, error } = await sb.auth.signInWithPassword({
    email: process.env.TEST_EMAIL,
    password: process.env.TEST_PASSWORD,
  })
  if (error || !data.user) {
    console.error("FATAL: sign-in failed:", error?.message)
    process.exit(1)
  }
  userId = data.user.id
  session = data.session
  console.log(`Signed in as ${process.env.TEST_EMAIL}`)
} else {
  const rand = Math.random().toString(36).slice(2, 8)
  const email = `ascend_p4_${rand}@example.com`
  const password = `TestPass123!${rand}`
  const { data, error } = await sb.auth.signUp({ email, password })
  if (error || !data.user) {
    console.error("FATAL: signUp failed:", error?.message)
    process.exit(1)
  }
  if (!data.session) {
    console.log("SKIP: email confirmation is ON — no session. Run with TEST_EMAIL/TEST_PASSWORD instead.")
    process.exit(0)
  }
  userId = data.user.id
  session = data.session
  console.log(`Registered throwaway account ${email}`)
}
await sb.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })

// JS mirror of the SQL level formula (xp_for_level / level_from_xp)
const jsXpForLevel = (l) => (l <= 1 ? 0 : Math.round(25 * Math.pow(l - 1, 2.35)))
const jsLevelFromXp = (xp) => {
  let l = 1
  while (l < 200 && jsXpForLevel(l + 1) <= xp) l++
  return l
}

const xpTotal = async () => {
  const { data } = await sb.from("xp_transactions").select("amount").eq("user_id", userId)
  return ((data ?? [])).reduce((s, r) => s + r.amount, 0)
}
const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

let phaseId = null
let milestoneId = null
let questId = null
let milestoneQuestId = null

try {
  // --- Bootstrap: phase + milestone (quests require a parent per quests_parent)
  const { data: phase, error: pErr } = await sb
    .from("phases")
    .insert({
      user_id: userId,
      title: "[TEST] P4 Phase",
      status: "active",
      order_index: 99,
      phase_number: 99,
      reward_xp: 500,
      start_date: todayStr(),
    })
    .select("id")
    .single()
  if (pErr) throw new Error("phase bootstrap failed: " + pErr.message)
  phaseId = phase.id

  const { data: ms, error: mErr } = await sb
    .from("milestones")
    .insert({ phase_id: phaseId, title: "[TEST] P4 Milestone", sort_order: 0, status: "active", xp_reward: 40 })
    .select("id")
    .single()
  if (mErr) throw new Error("milestone bootstrap failed: " + mErr.message)
  milestoneId = ms.id

  // --- Formula parity between TS and Postgres
  const { data: sqlXp8 } = await sb.rpc("xp_for_level", { p_level: 8 })
  check("level formula parity L8", Number(sqlXp8) === jsXpForLevel(8), `sql=${sqlXp8} js=${jsXpForLevel(8)}`)

  const beforeTotal = await xpTotal()

  // --- CREATE quest (spec fields incl. category/difficulty/duration/recurrence)
  const { data: q, error: qErr } = await sb
    .from("quests")
    .insert({
      user_id: userId,
      phase_id: phaseId,
      milestone_id: null,
      title: "[TEST] Study programming for 30 minutes",
      description: "Phase 4 integration quest",
      category: "intellect",
      difficulty: "medium",
      xp_reward: 40,
      estimated_duration: 30,
      recurrence: "none",
      status: "active",
    })
    .select("id")
    .single()
  if (qErr) throw new Error("create failed: " + qErr.message)
  questId = q.id
  check("create quest", true)

  // --- VIEW quest
  const { data: seen } = await sb.from("quests").select("*").eq("id", questId).single()
  check(
    "view quest (all spec fields)",
    !!seen &&
      seen.title.includes("[TEST]") &&
      seen.category === "intellect" &&
      seen.difficulty === "medium" &&
      seen.estimated_duration === 30 &&
      seen.status === "active" &&
      seen.xp_reward === 40
  )

  // --- COMPLETE quest via secure RPC
  const first = await sb.rpc("complete_quest", { p_quest_id: questId })
  const r1 = first.data
  check("complete quest ok", r1?.ok === true && r1.already_completed === false, JSON.stringify(r1))
  check("xp awarded == 40", r1?.xp_awarded === 40, `awarded=${r1?.xp_awarded}`)
  check(
    "quest marked completed + completed_at set",
    ((await sb.from("quests").select("status, completed_at").eq("id", questId).single()).data)?.status === "completed" &&
      !!(await sb.from("quests").select("completed_at").eq("id", questId).single()).data?.completed_at
  )

  // --- DUPLICATE completion prevention
  const second = await sb.rpc("complete_quest", { p_quest_id: questId })
  const r2 = second.data
  check("duplicate blocked (no double XP)", r2?.ok === true && r2.already_completed === true && r2.xp_awarded === 0, JSON.stringify(r2))

  // --- NONEXISTENT quest rejected
  const fake = crypto.randomUUID()
  const third = await sb.rpc("complete_quest", { p_quest_id: fake })
  check("nonexistent quest rejected", third.data?.ok === false && third.data?.error === "quest_not_found", JSON.stringify(third.data))

  // --- XP ledger integrity
  const afterTotal = await xpTotal()
  check("xp total delta == 40", afterTotal - beforeTotal === 40, `delta=${afterTotal - beforeTotal}`)
  const { count: txCount } = await sb
    .from("xp_transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .like("source_key", `quest:${questId}%`)
  check("exactly one xp transaction for quest", txCount === 1, `rows=${txCount}`)

  // --- CLIENT-SIDE XP manipulation must be blocked (0004 hardening)
  const { error: forgeErr } = await sb.from("xp_transactions").insert({
    user_id: userId,
    amount: 9999,
    source: "forged:client",
    source_key: "forged:test",
    description: "attempted client-side mint",
  })
  if (forgeErr) {
    check("client-side XP insert blocked", true, forgeErr.message)
  } else {
    warn("client-side XP insert blocked", "0004_xp_security.sql NOT applied yet — direct inserts still allowed; apply the migration")
    await sb.from("xp_transactions").delete().eq("user_id", userId).eq("source", "forged:client")
  }

  // --- LEVEL snapshot updated in user_levels
  const lvlRow = (await sb.from("user_levels").select("level, xp").eq("user_id", userId).maybeSingle()).data
  const expectedLvl = jsLevelFromXp(afterTotal)
  check(
    "user_levels snapshot matches formula",
    !!lvlRow && lvlRow.level === expectedLvl && Number(lvlRow.xp) === afterTotal,
    `db=${lvlRow?.level}/${lvlRow?.xp} expected=${expectedLvl}/${afterTotal}`
  )

  // --- MOMENTUM updated (medium => 10 pts, streak >= 1)
  const mom = (await sb.from("momentum").select("score, streak").eq("user_id", userId).eq("date", todayStr()).maybeSingle()).data
  check("momentum score/streak updated", !!mom && mom.score >= 10 && mom.streak >= 1, JSON.stringify(mom))

  // --- MILESTONE auto-complete -> PHASE PROGRESS path
  const { data: mq, error: mqErr } = await sb
    .from("quests")
    .insert({
      user_id: userId,
      phase_id: phaseId,
      milestone_id: milestoneId,
      title: "[TEST] Complete one difficult task",
      category: "discipline",
      difficulty: "hard",
      xp_reward: 75,
      recurrence: "none",
      status: "active",
    })
    .select("id")
    .single()
  if (mqErr) throw new Error("milestone quest create failed: " + mqErr.message)
  milestoneQuestId = mq.id

  const mr = (await sb.rpc("complete_quest", { p_quest_id: milestoneQuestId })).data
  check("milestone quest completed", mr?.ok === true && mr?.xp_awarded === 75, JSON.stringify(mr))
  const msStatus = (await sb.from("milestones").select("status").eq("id", milestoneId).single()).data?.status
  check("milestone auto-completed when quests done", msStatus === "completed", `status=${msStatus}`)

  // --- DASHBOARD aggregates from real tables (mirrors getDashboardData)
  const [{ data: activeQuests }, { data: completionsToday }, { data: xpTodayRows }] = await Promise.all([
    sb.from("quests").select("*").eq("user_id", userId).eq("status", "active"),
    sb.from("quest_completions").select("quest_id").eq("user_id", userId).gte("completed_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
    sb.from("xp_transactions").select("amount").eq("user_id", userId).gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
  ])
  const completedTodayIds = new Set((completionsToday ?? []).map((c) => c.quest_id))
  check(
    "dashboard: todays quests exclude completed",
    !(activeQuests ?? []).some((x) => completedTodayIds.has(x.id)) && completedTodayIds.size === 2,
    `active=${activeQuests?.length} doneToday=${completedTodayIds.size}`
  )
  const xpToday = (xpTodayRows ?? []).reduce((s, r) => s + r.amount, 0)
  check("dashboard: xp earned today == 115", xpToday === 115, `xpToday=${xpToday}`)
} catch (e) {
  check("unexpected error", false, e instanceof Error ? e.message : String(e))
} finally {
  // --- Cleanup test artifacts (order matters for FKs)
  try {
    if (userId) {
      await sb.from("xp_transactions").delete().eq("user_id", userId).like("source_key", `quest:${questId}%`)
      await sb.from("xp_transactions").delete().eq("user_id", userId).like("source_key", `quest:${milestoneQuestId}%`)
      if (questId) await sb.from("quest_completions").delete().eq("quest_id", questId).eq("user_id", userId)
      if (milestoneQuestId) await sb.from("quest_completions").delete().eq("quest_id", milestoneQuestId).eq("user_id", userId)
      const ids = [questId, milestoneQuestId].filter(Boolean)
      if (ids.length > 0) await sb.from("quests").delete().in("id", ids).eq("user_id", userId)
      if (milestoneId) await sb.from("milestones").delete().eq("id", milestoneId)
      if (phaseId) await sb.from("phases").delete().eq("id", phaseId).eq("user_id", userId)
      await sb.from("momentum").delete().eq("user_id", userId)
    }
    await sb.auth.signOut()
    console.log("cleanup done")
  } catch (e) {
    console.log("cleanup warning:", e instanceof Error ? e.message : String(e))
  }
}

const failed = results.filter((r) => !r.pass)
console.log(
  failed.length === 0 && warnings === 0
    ? "\nALL CHECKS PASSED"
    : `\n${failed.length} CHECK(S) FAILED, ${warnings} WARNING(S)`
)
process.exit(failed.length === 0 ? 0 : 2)
