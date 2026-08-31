import { beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import { runAIProposal, type ModelCall, type RunnableAIProposalRequest } from "./pipeline"
import { resetAiState } from "./cost"
import type { GatherFactsResult } from "./types"
import type { ModelResult } from "@/lib/coach/provider"

const S = z.object({ title: z.string().trim().min(1).max(100) })
type Shape = z.infer<typeof S>

function okModel(content: string): ModelCall {
  return async (): Promise<ModelResult> => ({ ok: true, content })
}

function baseReq(over: Partial<RunnableAIProposalRequest<Shape>> = {}): RunnableAIProposalRequest<Shape> {
  const collect = async (): Promise<GatherFactsResult> => ({ text: "facts", signals: { a: 1 }, resolved: false })
  return {
    userId: "u",
    kind: "generic",
    costKey: `test:${Math.random()}`,
    collect,
    buildMessages: () => [{ role: "user", content: "go" }],
    schema: S,
    ...over,
  }
}

beforeEach(() => resetAiState())

describe("ai/pipeline success", () => {
  it("returns the validated proposal from the model", async () => {
    const res = await runAIProposal<Shape>(
      baseReq({ modelCall: okModel(`{"title":"Paint the fence"}`) }),
    )
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.proposal.title).toBe("Paint the fence")
      expect(res.source).toBe("ai")
    }
  })
})

describe("ai/pipeline failures never fabricate", () => {
  it("parse_failed when no JSON", async () => {
    const res = await runAIProposal<Shape>(baseReq({ modelCall: okModel("nope") }))
    expect(res).toEqual({ ok: false, reason: "parse_failed" })
  })

  it("invalid when schema rejects", async () => {
    const res = await runAIProposal<Shape>(baseReq({ modelCall: okModel(`{"title":""}`) }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe("invalid")
  })

  it("domain_invalid when extra validation fails", async () => {
    const res = await runAIProposal<Shape>(
      baseReq({
        modelCall: okModel(`{"title":"ok"}`),
        validate: () => ({ ok: false, error: "not allowed" }),
      }),
    )
    expect(res).toEqual({ ok: false, reason: "domain_invalid", detail: "not allowed" })
  })

  it("unavailable when the model is down (no fabrication)", async () => {
    const res = await runAIProposal<Shape>(
      baseReq({ modelCall: async (): Promise<ModelResult> => ({ ok: false, unavailable: true, reason: "upstream_error", detail: "boom" }) }),
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.unavailable).toBe(true)
  })
})

describe("ai/pipeline cost + cache", () => {
  it("short-circuits deterministically when facts resolve", async () => {
    let called = false
    const res = await runAIProposal<Shape>(
      baseReq({
        collect: async () => ({ text: "facts", signals: {}, resolved: true }),
        modelCall: async () => {
          called = true
          return { ok: true, content: `{"title":"x"}` }
        },
      }),
    )
    expect(res.ok).toBe(false)
    expect(called).toBe(false)
  })

  it("serves a cached proposal without calling the model again", async () => {
    let calls = 0
    const modelCall: ModelCall = async () => {
      calls += 1
      return { ok: true, content: `{"title":"cached-title"}` }
    }
    const collect = async (): Promise<GatherFactsResult> => ({ text: "same-facts", signals: {}, resolved: false })
    const a = await runAIProposal<Shape>(baseReq({ collect, modelCall, cache: { key: "k", ttlMs: 1000 } }))
    const b = await runAIProposal<Shape>(baseReq({ collect, modelCall, cache: { key: "k", ttlMs: 1000 } }))
    expect(a.ok && b.ok).toBe(true)
    expect(calls).toBe(1)
    if (b.ok) expect(b.source).toBe("cache")
  })
})
