// Ascend Phase 5 integration test — stats + skill tree fed by real quest completion.
//
// Usage:
//   TEST_EMAIL=you@example.com TEST_PASSWORD=secret node scripts/test-phase5.mjs
//
// Verifies the full chain: complete_quest → XP award → stat_history ledger →
// user_stats snapshot (weighted) → skill_xp_log (leaf + parent branch share) →
// user_skills snapshot → duplicate completion grants nothing further.
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

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

let phaseId = null
let questId = null

try {
  // --- Pick a seeded leaf skill: int-coding (Intellect → Problem Solving branch)
  const { data: coding } = await sb.from("skills").select("id, slug, name, parent_id").eq("slug", "int-coding").single()
  if (!coding || !coding.parent_id) throw new Error("skill seed missing: int-coding (run migration 0005)")
  const { data: branch } = await sb.from("skills").select("id, slug").eq("id", coding.parent_id).single()
  check("skill tree seeded (int-coding + branch)", !!coding && !!branch, `${coding.slug} → ${branch?.slug}`)

  const { data: statRows } = await sb.from("stats").select("id, slug").in("slug", ["intellect", "knowledge"])
  const bySlug = Object.fromEntries(((statRows ?? [])).map((r) => [r.slug, r.id]))
  if (!bySlug.intellect || !bySlug.knowledge) throw new Error("stat catalog missing intellect/knowledge")

  // --- Bootstrap phase (quests require a parent per quests_parent)
  const { data: phase, error: pErr } = await sb
    .from("phases")
    .insert({ user_id: userId, title: "[TEST] P5 Phase", status: "active", order_index: 98, phase_number: 98, reward_xp: 0, start_date: todayStr() })
    .select("id")
    .single()
  if (pErr) throw new Error("phase bootstrap failed: " + pErr.message)
  phaseId = phase.id

  // --- Baselines
  const snap = async () => ({
    usI: (await sb.from("user_stats").select("value").eq("user_id", userId).eq("stat_id", bySlug.intellect).maybeSingle()).data?.value ?? 0,
    usK: (await sb.from("user_stats").select("value").eq("user_id", userId).eq("stat_id", bySlug.knowledge).maybeSingle()).data?.value ?? 0,
    ukLeaf: (await sb.from("user_skills").select("xp").eq("user_id", userId).eq("skill_id", coding.id).maybeSingle()).data?.xp ?? 0,
    ukBranch: (await sb.from("user_skills").select("xp").eq("user_id", userId).eq("skill_id", branch.id).maybeSingle()).data?.xp ?? 0,
    shCount: ((await sb.from("stat_history").select("id").eq("user_id", userId)).data ?? []).length,
    sxlCount: ((await sb.from("skill_xp_log").select("id").eq("user_id", userId)).data ?? []).length,
  })
  const before = await snap()

  // --- CREATE quest linked to the skill (category intellect, medium, 40 XP)
  const { data: q, error: qErr } = await sb
    .from("quests")
    .insert({
      user_id: userId,
      phase_id: phaseId,
      title: "[TEST] Practice one programming problem",
      category: "intellect",
      difficulty: "medium",
      xp_reward: 40,
      estimated_duration: 15,
      recurrence: "none",
      status: "active",
      linked_skill: coding.id,
    })
    .select("id")
    .single()
  if (qErr) throw new Error("create failed: " + qErr.message)
  questId = q.id

  // --- COMPLETE via RPC
  const r1 = (await sb.rpc("complete_quest", { p_quest_id: questId })).data
  check("complete ok +40 xp", r1?.ok === true && r1.xp_awarded === 40, JSON.stringify(r1))

  // --- STAT chain: intellect 0.6→24, knowledge 0.4→16
  const after = await snap()
  check("stat ledger rows (+2)", after.shCount - before.shCount === 2, `+${after.shCount - before.shCount}`)
  check("intellect +24 (60%)", Number(after.usI) - Number(before.usI) === 24, `${before.usI}→${after.usI}`)
  check("knowledge +16 (40%)", Number(after.usK) - Number(before.usK) === 16, `${before.usK}→${after.usK}`)

  // --- SKILL chain: leaf full 40, branch half 20
  check("skill ledger rows (+2)", after.sxlCount - before.sxlCount === 2, `+${after.sxlCount - before.sxlCount}`)
  check("leaf skill +40 xp", after.ukLeaf - before.ukLeaf === 40, `${before.ukLeaf}→${after.ukLeaf}`)
  check("branch skill +20 xp (half)", Number(after.ukBranch) - Number(before.ukBranch) === 20, `${before.ukBranch}→${after.ukBranch}`)

  // --- DUPLICATE completion grants nothing further
  const r2 = (await sb.rpc("complete_quest", { p_quest_id: questId })).data
  const frozen = await snap()
  check("duplicate blocked", r2?.already_completed === true && r2.xp_awarded === 0)
  check(
    "no farming on repeat (ledgers frozen)",
    frozen.shCount === after.shCount && frozen.sxlCount === after.sxlCount &&
      Number(frozen.usI) === Number(after.usI) && frozen.ukLeaf === after.ukLeaf
  )

  // --- Client-side tampering blocked (0005 made snapshots read-only)
  const { error: forgeStat } = await sb.from("user_stats").upsert({ user_id: userId, stat_id: bySlug.intellect, value: 99999 })
  check("client cannot write user_stats", !!forgeStat, forgeStat?.message ?? "unexpected success")
  const { error: forgeSkill } = await sb.from("user_skills").upsert({ user_id: userId, skill_id: coding.id, xp: 99999 })
  check("client cannot write user_skills", !!forgeSkill, forgeSkill?.message ?? "unexpected success")
} catch (e) {
  check("unexpected error", false, e instanceof Error ? e.message : String(e))
} finally {
  try {
    if (questId) {
      await sb.from("stat_history").delete().eq("user_id", userId).like("source_key", `quest:${questId}%`)
      await sb.from("skill_xp_log").delete().eq("user_id", userId).like("source_key", `quest:${questId}%`)
      await sb.from("xp_transactions").delete().eq("user_id", userId).like("source_key", `quest:${questId}%`)
      await sb.from("quest_completions").delete().eq("quest_id", questId).eq("user_id", userId)
      await sb.from("quests").delete().eq("id", questId).eq("user_id", userId)
    }
    if (phaseId) await sb.from("phases").delete().eq("id", phaseId).eq("user_id", userId)
    await sb.auth.signOut()
    console.log("cleanup done")
  } catch (e) {
    console.log("cleanup warning:", e instanceof Error ? e.message : String(e))
  }
}

const failed = results.filter((r) => !r.pass)
console.log(failed.length === 0 ? "\nALL CHECKS PASSED" : `\n${failed.length} CHECK(S) FAILED`)
process.exit(failed.length === 0 ? 0 : 2)
