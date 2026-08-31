import { describe, expect, it } from "vitest"
import { approveMemory, deleteMemory, listMemory, loadMemoryFor, revokeMemory, saveMemory } from "./memory"
import type { MemoryDb, MemoryRow } from "./memory"

function fakeDb(rows: MemoryRow[], rpc?: MemoryDb["rpc"]): MemoryDb {
  return {
    from: (table) => {
      if (table !== "ai_memory") throw new Error("bad table")
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: rows, error: null }),
          }),
        }),
      }
    },
    rpc:
      rpc ??
      (async () => ({
        data: { ok: true, id: "m1" },
        error: null,
      })),
  }
}

const base: MemoryRow = {
  id: "m1",
  user_id: "u",
  kind: "goal",
  summary: "Wants to run a half-marathon by year end.",
  importance: 2,
  approved: true,
  revoked: false,
  created_at: "2026-08-01T00:00:00Z",
}

describe("ai/memory listMemory", () => {
  it("maps rows to notes", async () => {
    const db = fakeDb([base])
    const notes = await listMemory(db, "u")
    expect(notes).toHaveLength(1)
    expect(notes[0].summary).toBe(base.summary)
    expect(notes[0].kind).toBe("goal")
  })
})

describe("ai/memory loadMemoryFor", () => {
  it("includes approved + non-revoked of the right kind", async () => {
    const db = fakeDb([base, { ...base, id: "m2", kind: "habit", approved: true }, { ...base, id: "m3", approved: false }])
    const out = await loadMemoryFor(db, "u", "goal")
    expect(out).toEqual([base.summary])
  })
})

describe("ai/memory write helpers forward to RPC", () => {
  it("saveMemory passes summary + kind", async () => {
    let seen: Record<string, unknown> = {}
    const db = fakeDb([], (async (fn, args) => {
      seen = { fn: String(fn), ...(args ?? {}) }
      return { data: { ok: true, id: "n1" }, error: null }
    }) as MemoryDb["rpc"])
    const res = await saveMemory(db, { kind: "habit", summary: "Prefers short daily sessions." })
    expect(res.ok).toBe(true)
    expect(seen["fn"]).toBe("save_ai_memory")
    expect(seen["p_summary"]).toBe("Prefers short daily sessions.")
  })

  it("revokeMemory calls revoke_ai_memory", async () => {
    let fn = ""
    const db = fakeDb([], (async (name) => {
      fn = String(name)
      return { data: { ok: true, id: "m1" }, error: null }
    }) as MemoryDb["rpc"])
    await revokeMemory(db, "m1")
    expect(fn).toBe("revoke_ai_memory")
  })

  it("deleteMemory calls delete_ai_memory", async () => {
    let fn = ""
    const db = fakeDb([], (async (name) => {
      fn = String(name)
      return { data: { ok: true, id: "m1" }, error: null }
    }) as MemoryDb["rpc"])
    await deleteMemory(db, "m1")
    expect(fn).toBe("delete_ai_memory")
  })

  it("approveMemory calls mark_ai_memory_approved", async () => {
    let fn = ""
    const db = fakeDb([], (async (name) => {
      fn = String(name)
      return { data: { ok: true, id: "m1" }, error: null }
    }) as MemoryDb["rpc"])
    await approveMemory(db, "m1")
    expect(fn).toBe("mark_ai_memory_approved")
  })
})
