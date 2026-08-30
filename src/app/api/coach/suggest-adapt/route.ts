import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { callModel, extractJson, type ChatMessage } from "@/lib/coach/provider"
import { buildSystemPrompt } from "@/lib/coach/prompt"
import { gatherCoachContext } from "@/lib/coach/context"
import { rateLimited } from "@/lib/coach/ratelimit"
import { adaptQuestProposalSchema, type AdaptQuestProposal } from "@/lib/quests/adapt"
import { clampXpForDifficulty, XP_BANDS } from "@/lib/validations/quest"

export const runtime = "nodejs"

/** Development diagnostics: locate exactly which stage failed. Never sent in production. */
const DEV = process.env.NODE_ENV !== "production"

type Debug = { stage: string; detail?: string; reason?: string }

function devDebug(debug: Debug): Record<string, unknown> {
  return DEV ? { debug } : {}
}

function fail(body: Record<string, unknown>, status = 200): NextResponse {
  return NextResponse.json(body, { status })
}

/**
 * POST /api/coach/suggest-adapt   Body: { quest_id }
 * → { ok:true, proposal } | { ok:false, unavailable:true } (+ debug in dev)
 *
 * The AI only PROPOSES an adaptation — this endpoint never mutates data.
 * Applying requires the user to trigger `applyQuestAdaptationAction`, which
 * re-validates everything server-side.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return fail({ error: "unauthorized", ...devDebug({ stage: "authentication", detail: "no authenticated session" }) }, 401)
  }

  if (rateLimited(`adapt:${user.id}`)) {
    return fail({ error: "rate_limited", ...devDebug({ stage: "rate_limited", detail: "20 requests per 5 minutes" }) }, 429)
  }

  let body: { quest_id?: unknown }
  try {
    body = await req.json()
  } catch {
    return fail({ error: "bad_request", ...devDebug({ stage: "bad_request", detail: "body must be JSON { quest_id }" }) }, 400)
  }
  const questId = z.string().uuid().safeParse(body.quest_id)
  if (!questId.success) {
    return fail({ error: "bad_request", ...devDebug({ stage: "bad_request", detail: "quest_id must be a valid UUID" }) }, 400)
  }

  const { data: quest } = await supabase
    .from("quests")
    .select(
      "id,title,description,difficulty,xp_reward,evidence,category,due_date,recurrence,postponed_count,skipped_count,adapted_from_difficulty,status",
    )
    .eq("id", questId.data)
    .eq("user_id", user.id)
    .maybeSingle()
  if (!quest || quest.status !== "active") {
    return fail({ error: "not_found", ...devDebug({ stage: "quest_lookup", detail: "quest not found or not active" }) }, 404)
  }

  let ctx: Awaited<ReturnType<typeof gatherCoachContext>>
  try {
    ctx = await gatherCoachContext(supabase, user.id)
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.error("[coach] suggest-adapt context failure", detail)
    return fail({ ok: false, unavailable: true, ...devDebug({ stage: "context_gathering", detail }) }, 500)
  }

  const bandLines = Object.entries(XP_BANDS)
    .map(([d, b]) => `${d}: ${b.min}–${b.max} XP`)
    .join("; ")

  const messages: ChatMessage[] = [
    buildSystemPrompt(ctx.text),
    {
      role: "user",
      content: `The user is stuck on this quest — determine whether rescaling would genuinely help, and propose a concrete adjustment.

QUEST TO RESCALE:
- id: ${quest.id}
- title: "${quest.title}"
- description: ${quest.description ? `"${quest.description.slice(0, 300)}"` : "none"}
- category: ${quest.category}
- difficulty: ${quest.difficulty}
- current xp_reward: ${quest.xp_reward}
- due_date: ${quest.due_date ?? "none"}
- recurrence: ${quest.recurrence}
- postponed_count: ${quest.postponed_count ?? 0}
- skipped_count: ${quest.skipped_count ?? 0}
- adapted_from_difficulty: ${quest.adapted_from_difficulty ?? "never adapted"}
- evidence so far: ${quest.evidence ? `"${quest.evidence.slice(0, 200)}"` : "none"}

Rules:
- XP bands are ${bandLines}. Pick an xp_reward INSIDE the band for the chosen difficulty (the server clamps to the band anyway).
- Step DOWN the difficulty to something honestly achievable (one step at a time) OR substitute a smaller, more concrete title — do not just reword the same task.
- If difficulty and scope are both already reasonable and the quest is simply low priority, respond with the SAME difficulty and a why='keep as is — no meaningful adaptation needed' (the server will detect no-op and refuse to apply).
- Never remove a quest entirely and never raise xp_reward.
- Optional evidence: only if the user has made tangible progress that justifies the new difficulty.
- reason: 1 plain-English sentence explaining the adaptation to the user.

Respond with ONLY a JSON object matching EXACTLY:
{"quest_id":"<the id above>","difficulty":"easy|medium|hard|challenge","xp_reward":<number>,"title":"<adjusted title or omit>","reason":"<why>","evidence":"<optional>"}
Do NOT include markdown fences.`,
    },
  ]

  const result = await callModel(messages, { maxTokens: 500, temperature: 0.5 })
  if (!result.ok) {
    const detail =
      result.detail ??
      (result.reason === "no_key"
        ? "No AI provider key configured (GEMINI_API_KEY / AI_API_KEY / OPENAI_API_KEY)."
        : "Upstream model error — see server console.")
    return fail({ ok: false, unavailable: true, ...devDebug({ stage: "ai_request", reason: result.reason, detail }) })
  }

  const raw = extractJson<Partial<AdaptQuestProposal>>(result.content)
  if (!raw || typeof raw !== "object") {
    const snippet = result.content.replace(/\s+/g, " ").trim().slice(0, 200)
    console.error("[coach] suggest-adapt: AI reply did not parse", snippet)
    return fail({
      ok: false,
      unavailable: true,
      ...devDebug({ stage: "ai_response_parse", detail: `extractJson failed; AI reply started with: ${snippet}` }),
    })
  }

  const parsed = adaptQuestProposalSchema.safeParse({ ...raw, xp_reward: typeof raw.xp_reward === "string" ? Number(raw.xp_reward) : raw.xp_reward })
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
    return fail({
      ok: false,
      unavailable: true,
      ...devDebug({ stage: "zod_validation", detail: issues.join("; ") }),
    })
  }
  if (parsed.data.quest_id !== quest.id) {
    return fail({
      ok: false,
      unavailable: true,
      ...devDebug({ stage: "zod_validation", detail: `quest_id mismatch (got ${parsed.data.quest_id})` }),
    })
  }

  const proposal: AdaptQuestProposal = {
    ...parsed.data,
    xp_reward: clampXpForDifficulty(parsed.data.difficulty, parsed.data.xp_reward),
  }

  return NextResponse.json({ ok: true, proposal })
}