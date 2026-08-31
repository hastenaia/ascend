/**
 * P2.0 integration test — Shared AI Plumbing (memory + audit ledger + RPC auth)
 * Requires: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 *           TEST_EMAIL, TEST_PASSWORD.
 *
 * Run AFTER migration 0022_ai_memory.sql is applied to the Supabase project.
 *
 * Verifies against the real database:
 *  1. RLS barrier: anon client cannot read ai_events / ai_memory
 *  2. No direct INSERT path: authenticated client inserts are denied on both
 *     tables (writes are RPC-only)
 *  3. record_ai_event appends sanitized audit rows (owned by the caller)
 *  4. save_ai_memory creates an unapproved note; ownership enforced
 *  5. mark_ai_memory_approved flips approved
 *  6. revoke_ai_memory soft-deletes; row still visible to owner (mgmt page)
 *  7. delete_ai_memory hard-deletes
 *  8. Invalid action is rejected by the RPC
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

const anon = createClient(url, key)
const { data: auth, error: authErr } = await anon.auth.signInWithPassword({ email, password })
if (authErr || !auth?.session) {
  console.error(`Login failed: ${authErr?.message}`)
  process.exit(1)
}
const uid = auth.user.id
const authed = createClient(url, key, { global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } } })
console.log(`Logged in as ${email}`)

// ---- 0) RLS: anon can read nothing on the new tables ----
const { data: anonEvents, error: anonEventsErr } = await anon.from("ai_events").select("id")
check("anon cannot select ai_events", anonEventsErr !== null || (anonEvents?.length ?? 0) === 0, anonEventsErr?.message ?? "")
const { data: anonMemory, error: anonMemoryErr } = await anon.from("ai_memory").select("id")
check("anon cannot select ai_memory", anonMemoryErr !== null || (anonMemory?.length ?? 0) === 0, anonMemoryErr?.message ?? "")

// ---- 1) No direct INSERT allowed (writes are RPC-only) ----
const { error: insertEventErr } = await authed.from("ai_events").insert({ user_id: uid, kind: "test", action: "proposed" })
check("direct ai_events insert blocked by RLS", insertEventErr !== null, insertEventErr?.message ?? "")
const { error: insertMemoryErr } = await authed.from("ai_memory").insert({ user_id: uid, kind: "test", summary: "x" })
check("direct ai_memory insert blocked by RLS", insertMemoryErr !== null, insertMemoryErr?.message ?? "")

// ---- 2) record_ai_event appends an owned audit row ----
const { data: evt, error: evtErr } = await authed.rpc("record_ai_event", {
  p_kind: "test",
  p_action: "proposed",
  p_proposal: { summary: "some proposed summary" },
  p_source_ref: { probe: true },
})
check("record_ai_event ok", !evtErr && evt?.ok === true, evtErr?.message ?? JSON.stringify(evt))
const evtId = evt?.id
const { data: evtRows } = await authed.from("ai_events").select("id, kind, action, user_id").eq("id", evtId)
check("audit row owned + visible", (evtRows?.length ?? 0) === 1 && evtRows?.[0]?.user_id === uid && evtRows?.[0]?.action === "proposed", JSON.stringify(evtRows))

// ---- 3) record_ai_event rejects invalid action ----
const { data: badEvt, error: badEvtErr } = await authed.rpc("record_ai_event", {
  p_kind: "test",
  p_action: "nope",
  p_proposal: {},
  p_source_ref: {},
})
check("invalid action rejected", !badEvtErr && badEvt?.ok === false, badEvtErr?.message ?? JSON.stringify(badEvt))

// ---- 4) save_ai_memory creates an unapproved note ----
const { data: mem, error: memErr } = await authed.rpc("save_ai_memory", {
  p_kind: "test",
  p_summary: "User prefers concise summaries.",
  p_importance: 2,
  p_source_ref: { probe: true },
  p_id: null,
})
check("save_ai_memory ok", !memErr && mem?.ok === true, memErr?.message ?? JSON.stringify(mem))
const memId = mem?.id
const { data: memRows } = await authed.from("ai_memory").select("id, approved, revoked, user_id").eq("id", memId)
check("memory note visible + unapproved", (memRows?.length ?? 0) === 1 && memRows?.[0]?.approved === false && memRows?.[0]?.revoked === false, JSON.stringify(memRows))

// ---- 5) save_ai_memory rejects invalid summary ----
const { data: badMem, error: badMemErr } = await authed.rpc("save_ai_memory", {
  p_kind: "test",
  p_summary: "   ",
  p_importance: 2,
  p_source_ref: {},
  p_id: null,
})
check("blank summary rejected", !badMemErr && badMem?.ok === false, badMemErr?.message ?? JSON.stringify(badMem))

// ---- 6) mark_ai_memory_approved ----
const { data: appr, error: apprErr } = await authed.rpc("mark_ai_memory_approved", { p_id: memId })
check("approve ok", !apprErr && appr?.ok === true, apprErr?.message ?? JSON.stringify(appr))
const { data: apprRows } = await authed.from("ai_memory").select("approved").eq("id", memId)
check("approved flag persisted", apprRows?.[0]?.approved === true, JSON.stringify(apprRows))

// ---- 7) revoke_ai_memory soft-delete ----
const { data: rev, error: revErr } = await authed.rpc("revoke_ai_memory", { p_id: memId })
check("revoke ok", !revErr && rev?.ok === true, revErr?.message ?? JSON.stringify(rev))
const { data: revRows } = await authed.from("ai_memory").select("revoked, user_id").eq("id", memId)
check("revoked flag persisted (owner mgmt visibility)", (revRows?.length ?? 0) === 1 && revRows?.[0]?.revoked === true, JSON.stringify(revRows))

// ---- 8) delete_ai_memory hard-delete ----
const { data: del, error: delErr } = await authed.rpc("delete_ai_memory", { p_id: memId })
check("delete ok", !delErr && del?.ok === true, delErr?.message ?? JSON.stringify(del))
const { data: delRows } = await authed.from("ai_memory").select("id").eq("id", memId)
check("memory note gone", (delRows?.length ?? 0) === 0, JSON.stringify(delRows))

// ---- 9) ownership: RPCs reject another user's id ----
// Simulate a foreign (fake) memory id -> not_found instead of mutating anyone.
const fakeId = "00000000-0000-0000-0000-000000000000"
const { data: fakeRev, error: fakeRevErr } = await authed.rpc("revoke_ai_memory", { p_id: fakeId })
check("foreign/absent id rejected", !fakeRevErr && fakeRev?.ok === false, fakeRevErr?.message ?? JSON.stringify(fakeRev))

// No cleanup for ai_events: it is append-only by design (SELECT-only + no
// delete policy). Audit rows from the probe are expected to persist.

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)