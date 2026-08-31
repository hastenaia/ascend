import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import type { RpcClient } from "@/lib/ai/rpc"
import { applyApprovedDecomposition, type ApplyDecompositionContext } from "./apply-decomposition"
import { goalDecompositionSchema, validateGoalDecomposition } from "./proposals/schemas"

const MIGRATION = join(process.cwd(), "supabase", "migrations", "0023_goal_intelligence.sql")
const OWNER = "user-owner"
const OTHER = "user-other"

function makeValidProposal() {
  return {
    phases: [
      {
        title: "Foundations",
        objective: "Build the base habits.",
        milestones: [{ title: "Ship week one" }, { title: "Ship week two" }],
      },
      { title: "Advanced", objective: "Go deeper.", milestones: [{ title: "Final push" }] },
    ],
    quests: [
      { title: "Study 30 minutes", category: "intellect", difficulty: "easy", description: "Focused study session." },
      { title: "Run 5k", category: "physical", difficulty: "medium" },
    ],
  }
}

function makeGoal(over: Partial<{ id: string; user_id: string; status: string }> = {}) {
  return { id: "goal-1", user_id: OWNER, status: "active", ...over }
}

type RpcArgs = { fn: string; args: Record<string, unknown> }

function makeDelegation(over: Partial<ApplyDecompositionContext> = {}) {
  const loadGoalImpl: (goalId: string) => Promise<{ id: string; user_id: string; status: string } | null> = async () =>
    makeGoal()
  let rpcResult: Record<string, unknown> = { ok: true, phases_created: 2, milestones_created: 5, quests_created: 2 }
  const calls: RpcArgs[] = []
  const audit = vi.fn(async () => {})
  const ctx: ApplyDecompositionContext = {
    loadGoal: async (goalId) => loadGoalImpl(goalId),
    rpc: {
      rpc: async (fn, args) => {
        calls.push({ fn, args: args ?? {} })
        if (fn !== "apply_decomposition_goal") return { data: null, error: { message: "unexpected_rpc" } }
        const { error, ...data } = rpcResult
        return { data, error: error ? { message: String(error) } : null }
      },
    } as RpcClient,
    audit,
    ...over,
  }
  return {
    ctx,
    calls,
    audit,
    setRpcError: (error: string) => {
      rpcResult = { ok: false, error }
    },
    setRpcOk: (counts: { phases: number; milestones: number; quests: number }) => {
      rpcResult = { ok: true, phases_created: counts.phases, milestones_created: counts.milestones, quests_created: counts.quests }
    },
  }
}

describe("applyApprovedDecomposition — revalidation + apply flow", () => {
  it("rejects a call with no authenticated user", async () => {
    const d = makeDelegation()
    const res = await applyApprovedDecomposition(d.ctx, { userId: "", goalId: "goal-1", proposal: makeValidProposal() })
    expect(res).toMatchObject({ ok: false, reason: "not_authenticated" })
    expect(d.calls).toHaveLength(0)
  })

  it("rejects when the goal is unknown at apply time", async () => {
    const d = makeDelegation({ loadGoal: async () => null })
    const res = await applyApprovedDecomposition(d.ctx, { userId: OWNER, goalId: "ghost", proposal: makeValidProposal() })
    expect(res).toMatchObject({ ok: false, reason: "goal_not_found" })
    expect(d.calls).toHaveLength(0)
  })

  it("rejects when the goal belongs to a different user", async () => {
    const d = makeDelegation({ loadGoal: async () => makeGoal({ user_id: OTHER }) })
    const res = await applyApprovedDecomposition(d.ctx, { userId: OWNER, goalId: "goal-1", proposal: makeValidProposal() })
    expect(res).toMatchObject({ ok: false, reason: "not_owner" })
    expect(d.calls).toHaveLength(0)
  })

  it("rejects a completed/archived goal regardless of a valid proposal", async () => {
    const d = makeDelegation({ loadGoal: async () => makeGoal({ status: "completed" }) })
    const res = await applyApprovedDecomposition(d.ctx, { userId: OWNER, goalId: "goal-1", proposal: makeValidProposal() })
    expect(res).toMatchObject({ ok: false, reason: "goal_not_eligible" })
  })

  it("applies a valid proposal for an owned active goal", async () => {
    const d = makeDelegation()
    d.setRpcOk({ phases: 2, milestones: 5, quests: 2 })
    const res = await applyApprovedDecomposition(d.ctx, { userId: OWNER, goalId: "goal-1", proposal: makeValidProposal() })
    expect(res).toEqual({ ok: true, phasesCreated: 2, milestonesCreated: 5, questsCreated: 2 })
    expect(d.calls).toHaveLength(1)
    expect(d.calls[0].fn).toBe("apply_decomposition_goal")
    expect(d.calls[0].args.p_goal_id).toBe("goal-1")
    expect(d.audit).toHaveBeenCalledOnce()
  })

  it("forwards only clean, schema-shaped data to the RPC (no injected fields)", async () => {
    const d = makeDelegation()
    await applyApprovedDecomposition(d.ctx, {
      userId: OWNER,
      goalId: "goal-1",
      proposal: {
        phases: [
          {
            title: "Foundations",
            objective: "build",
            milestones: [{ title: "m1", xp_reward: 999999, id: "forged-uuid", user_id: OTHER }],
            id: "forged-phase-id",
            user_id: OTHER,
          },
        ],
        quests: [
          {
            title: "Study",
            category: "intellect",
            difficulty: "medium",
            xp_reward: 1000000,
            id: "forged-quest-id",
            user_id: OTHER,
            phase_id: "forged",
          },
        ],
        id: "forged-proposal-id",
        goal_id: "different-goal",
      },
    })
    const phases = d.calls[0].args.p_phases as Record<string, unknown>[]
    const quests = d.calls[0].args.p_quests as Record<string, unknown>[]
    expect(phases[0]).toEqual({ title: "Foundations", objective: "build", milestones: [{ title: "m1" }] })
    expect(quests[0]).toEqual({ title: "Study", category: "intellect", difficulty: "medium" })
  })

  it("maps an RPC not_authenticated result", async () => {
    const d = makeDelegation()
    d.setRpcError("not_authenticated")
    const res = await applyApprovedDecomposition(d.ctx, { userId: OWNER, goalId: "goal-1", proposal: makeValidProposal() })
    expect(res).toMatchObject({ ok: false, reason: "not_authenticated" })
  })

  it("maps a duplicate/second-application rejection from the RPC", async () => {
    const d = makeDelegation()
    d.setRpcError("goal_already_decomposed")
    const res = await applyApprovedDecomposition(d.ctx, { userId: OWNER, goalId: "goal-1", proposal: makeValidProposal() })
    expect(res).toMatchObject({ ok: false, reason: "goal_already_decomposed" })
  })

  it("surfaces any other RPC failure as rpc_failed", async () => {
    const d = makeDelegation()
    d.setRpcError("constraint violation: phase not created atomically")
    const res = await applyApprovedDecomposition(d.ctx, { userId: OWNER, goalId: "goal-1", proposal: makeValidProposal() })
    expect(res).toMatchObject({ ok: false, reason: "rpc_failed" })
    expect(res.ok ? null : res.detail).toContain("constraint violation")
    expect(d.audit).not.toHaveBeenCalled()
  })

  it("keeps auditing soft: an audit failure never fails a successful apply", async () => {
    const d = makeDelegation({ audit: async () => {
      throw new Error("audit down")
    } })
    const res = await applyApprovedDecomposition(d.ctx, { userId: OWNER, goalId: "goal-1", proposal: makeValidProposal() })
    expect(res).toMatchObject({ ok: true })
  })
})

describe("applyApprovedDecomposition — schema + deterministic gates", () => {
  it("rejects malformed proposal (not an object/array shape)", async () => {
    const d = makeDelegation()
    const res = await applyApprovedDecomposition(d.ctx, { userId: OWNER, goalId: "goal-1", proposal: { phases: "nope" } })
    expect(res).toMatchObject({ ok: false, reason: "invalid_proposal" })
    expect(d.calls).toHaveLength(0)
  })

  it("rejects an oversized proposal (more than MAX_DECOMPOSITION_PHASES)", async () => {
    const d = makeDelegation()
    const proposal = {
      phases: Array.from({ length: 6 }, (_, i) => ({ title: `Phase ${i}`, objective: "o", milestones: [{ title: "m" }] })),
      quests: [],
    }
    const res = await applyApprovedDecomposition(d.ctx, { userId: OWNER, goalId: "goal-1", proposal })
    expect(res).toMatchObject({ ok: false, reason: "invalid_proposal" })
    expect(d.calls).toHaveLength(0)
  })

  it("rejects an oversized per-phase milestone list", async () => {
    const d = makeDelegation()
    const proposal = {
      phases: [
        {
          title: "One",
          objective: "o",
          milestones: Array.from({ length: 5 }, (_, i) => ({ title: `m${i}` })),
        },
      ],
      quests: [{ title: "q", category: "intellect", difficulty: "easy" }],
    }
    const res = await applyApprovedDecomposition(d.ctx, { userId: OWNER, goalId: "goal-1", proposal })
    expect(res).toMatchObject({ ok: false, reason: "invalid_proposal" })
  })

  it("rejects an oversized quest list (more than MAX_DECOMPOSITION_QUESTS)", async () => {
    const d = makeDelegation()
    const proposal = {
      phases: [{ title: "One", objective: "o", milestones: [{ title: "m" }] }],
      quests: Array.from({ length: 11 }, (_, i) => ({ title: `q${i}`, category: "intellect", difficulty: "easy" })),
    }
    const res = await applyApprovedDecomposition(d.ctx, { userId: OWNER, goalId: "goal-1", proposal })
    expect(res).toMatchObject({ ok: false, reason: "invalid_proposal" })
  })

  it("rejects titles that exceed the bounded lengths", async () => {
    const d = makeDelegation()
    const res = await applyApprovedDecomposition(d.ctx, {
      userId: OWNER,
      goalId: "goal-1",
      proposal: {
        phases: [{ title: "x".repeat(121), objective: "o", milestones: [{ title: "m" }] }],
        quests: [{ title: "q", category: "intellect", difficulty: "easy" }],
      },
    })
    expect(res).toMatchObject({ ok: false, reason: "invalid_proposal" })
  })

  it("rejects invalid enum values (quest category / difficulty)", async () => {
    const d = makeDelegation()
    for (const quests of [
      [{ title: "q", category: "finance", difficulty: "easy" }],
      [{ title: "q", category: "intellect", difficulty: "impossible" }],
    ]) {
      const res = await applyApprovedDecomposition(d.ctx, {
        userId: OWNER,
        goalId: "goal-1",
        proposal: { phases: [{ title: "One", objective: "o", milestones: [{ title: "m" }] }], quests },
      })
      expect(res).toMatchObject({ ok: false, reason: "invalid_proposal" })
    }
    expect(d.calls).toHaveLength(0)
  })

  it("rejects an empty decomposition (no milestones AND no quests)", async () => {
    const d = makeDelegation()
    const empty = { phases: [{ title: "One", objective: "o" }], quests: [] }
    expect(validateGoalDecomposition(goalDecompositionSchema.parse(empty))).toMatchObject({ ok: false })
    const res = await applyApprovedDecomposition(d.ctx, { userId: OWNER, goalId: "goal-1", proposal: empty })
    expect(res).toMatchObject({ ok: false, reason: "invalid_decomposition" })
  })

  it("client-supplied xp/difficulty mismatches are impossible by construction", () => {
    // XP is never part of the decomposition schema, so a payload that "says"
    // xp_reward can't smuggle an inconsistent value into the RPC.
    const proposal = makeValidProposal()
    ;(proposal.quests[0] as Record<string, unknown>).xp_reward = -50
    const parsed = goalDecompositionSchema.safeParse(proposal)
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect("xp_reward" in (parsed.data.quests[0] as Record<string, unknown>)).toBe(false)
    }
  })
})

describe("migration 0023 contract (idempotent, atomic, owned)", () => {
  const sql = readFileSync(MIGRATION, "utf8")

  it("uses idempotent DDL / CREATE OR REPLACE so re-running is safe", () => {
    expect(sql).toContain("create index if not exists idx_phases_goal_user")
    expect(sql).toContain("create or replace function public.apply_decomposition_goal")
    expect(sql).toContain("revoke execute on function public.apply_decomposition_goal(uuid, jsonb, jsonb)")
    expect(sql).toContain("grant execute on function public.apply_decomposition_goal(uuid, jsonb, jsonb)")
  })

  it("is SECURITY DEFINER with an explicit search_path", () => {
    expect(sql).toContain("security definer")
    expect(sql).toContain("set search_path = public")
  })

  it("pins every created row to the caller (auth.uid()) and the verified goal", () => {
    expect(sql).toContain("v_user := auth.uid()")
    expect(sql).toContain("where id = p_goal_id and user_id = v_user")
    // phases + quests carry user_id = v_user; milestones/quests attach only to
    // rows created in this same call (no caller-supplied ids used anywhere).
    expect(sql).toContain("(v_user, p_goal_id,")
    expect(sql).toContain("(v_user, null, null,")
  })

  it("never writes to unrelated tables or weakens RLS", () => {
    for (const forbidden of ["alter table public.goals", "drop policy", "enable row level security", "create policy"]) {
      expect(sql).not.toContain(forbidden)
    }
    // It touches ONLY phases/milestones/quests writes plus its own function.
    expect(sql).toContain("insert into public.phases")
    expect(sql).toContain("insert into public.milestones")
    expect(sql).toContain("insert into public.quests")
  })

  it("grants the RPC only to authenticated and never anon/public", () => {
    expect(sql).toContain("revoke execute on function public.apply_decomposition_goal(uuid, jsonb, jsonb) from public, anon")
    expect(sql).toContain("grant execute on function public.apply_decomposition_goal(uuid, jsonb, jsonb) to authenticated")
  })

  it("validates the whole payload before any insert (atomic reject)", () => {
    const validationBlock = sql.slice(sql.indexOf("-- 1) Validate"), sql.indexOf("-- 2) Insert"))
    const insertBlock = sql.slice(sql.indexOf("-- 2) Insert"))
    expect(validationBlock).toContain("invalid_phase_title")
    expect(validationBlock).toContain("invalid_quest_difficulty")
    expect(insertBlock).toContain("insert into public.phases")
  })

  it("re-enforces every bound inside the RPC (defense in depth)", () => {
    for (const token of ["invalid_payload", "invalid_phase_count", "invalid_quest_count", "invalid_milestones", "empty_decomposition", "goal_already_decomposed", "goal_not_eligible", "not_authenticated"]) {
      expect(sql).toContain(token)
    }
  })

  it("derives quest XP from validated difficulty (rejects impossible xp/difficulty)", () => {
    expect(sql).toContain("v_xp := case v_diff")
    expect(sql).toContain("when 'easy' then 10")
    expect(sql).toContain("when 'challenge' then 100")
    // xp_reward is computed server-side; the insert only references v_xp.
    expect(sql).not.toMatch(/v_quest->>'xp_reward'/)
    expect(sql).not.toMatch(/p_quests.*xp_reward/)
  })

  it("fails atomically: a mid-insert constraint failure rolls back the whole call", () => {
    // plpgsql function = single statement: an uncaught exception aborts the
    // entire call. We also require that zero writes precede validation.
    expect(sql).toMatch(/^.*language plpgsql/m)
    expect(sql).not.toMatch(/exception when others/)
    const firstInsert = sql.indexOf("insert into public.phases")
    const lastValidate = sql.lastIndexOf("invalid_quest_difficulty")
    expect(lastValidate).toBeLessThan(firstInsert)
  })

  it("does not delete, reprioritize, or change status of existing rows", () => {
    expect(sql).not.toMatch(/delete from/)
    expect(sql).not.toMatch(/update public\.(phases|milestones|quests|goals)/)
    // Goal status is only ever read, never written.
    expect(sql).toContain("v_goal.status <> 'active'")
  })
})