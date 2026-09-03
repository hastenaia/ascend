import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { callGemini, geminiKey, type ChatMessage, type ToolCall } from "@/lib/coach/provider"
import { buildSystemPrompt } from "@/lib/coach/prompt"
import { gatherCoachContext } from "@/lib/coach/context"
import { coachStyleInstructions } from "@/lib/coach/style"
import { detectPatternsForUser } from "@/lib/patterns/gather"
import { appendMessage, loadHistory } from "@/lib/coach/history"
import { rateLimited } from "@/lib/coach/ratelimit"
import { COACH_TOOLS, COACH_TOOL_NAMES } from "@/lib/coach/tools"
import { buildToolFollowUpInput } from "@/lib/coach/provider"

export const runtime = "nodejs"

/**
 * POST /api/coach/chat
 * Body: { message: string }
 * Returns: { ok:true, reply } | { ok:false, unavailable:true }
 *
 * Supports tool-calling: when the model wants to decompose, understand,
 * or create a journey for a goal, the server executes the action and
 * feeds the result back for a user-friendly response.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  if (rateLimited(`chat:${user.id}`)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  let body: { message?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 })
  }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : ""
  if (!message) return NextResponse.json({ error: "bad_request" }, { status: 400 })

  const [ctx, history] = await Promise.all([gatherCoachContext(supabase, user.id), loadHistory(supabase, user.id)])

  // Deterministic pattern insights (when present) — fed to the model as ground truth.
  const patternText = (await detectPatternsForUser(supabase, user.id)).text
  const contextText = patternText ? `${ctx.text}\n${patternText}` : ctx.text

  const messages: ChatMessage[] = [
    buildSystemPrompt(contextText, coachStyleInstructions(ctx.coachStyle)),
    ...history.slice(-20),
    { role: "user", content: message },
  ]

  // Persist the user's turn regardless of model availability (history continuity)
  await appendMessage(supabase, user.id, "user", message)

  // First model call — with tools when Gemini is available.
  const useTools = geminiKey()
  const firstResult = useTools
    ? await callGemini(messages, { maxTokens: 700, tools: COACH_TOOLS })
    : { ok: true as const, content: "", toolCalls: undefined }

  if (!firstResult.ok) {
    return NextResponse.json({ ok: false, unavailable: true }, { status: 200 })
  }

  // If the model emitted tool calls, execute them and get a follow-up response.
  let finalReply = firstResult.content
  if (firstResult.toolCalls && firstResult.toolCalls.length > 0 && useTools) {
    const results = await executeToolCalls(firstResult.toolCalls)
    const rawInput = buildToolFollowUpInput(messages, firstResult.toolCalls, results)
    const followUp = await callGemini(messages, {
      maxTokens: 700,
      tools: COACH_TOOLS,
      rawInput,
    })
    if (followUp.ok) {
      finalReply = followUp.content || formatToolResults(results)
    } else {
      // If the follow-up fails, fall back to a summary of the tool results.
      finalReply = formatToolResults(results)
    }
  }

  // If the model returned no text at all (no tools, no text), show unavailable.
  if (!finalReply) {
    return NextResponse.json({ ok: false, unavailable: true }, { status: 200 })
  }

  await appendMessage(supabase, user.id, "assistant", finalReply)
  return NextResponse.json({ ok: true, reply: finalReply })
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

async function executeToolCalls(
  toolCalls: ToolCall[],
): Promise<Array<{ id: string; name: string; result: unknown }>> {
  // Only execute known tools; ignore anything else.
  const results: Array<{ id: string; name: string; result: unknown }> = []
  for (const tc of toolCalls) {
    if (!COACH_TOOL_NAMES.includes(tc.name)) {
      results.push({ id: tc.id, name: tc.name, result: { error: `Unknown tool: ${tc.name}` } })
      continue
    }
    try {
      const result = await executeSingleTool(tc.name, tc.args)
      results.push({ id: tc.id, name: tc.name, result })
    } catch (e: unknown) {
      results.push({ id: tc.id, name: tc.name, result: { error: e instanceof Error ? e.message : "Tool execution failed" } })
    }
  }
  return results
}

async function executeSingleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const goalId = typeof args.goalId === "string" ? args.goalId : ""
  if (!goalId) return { ok: false, error: "Missing goalId" }

  switch (name) {
    case "decompose_goal": {
      const { proposeGoalDecompositionAction, applyGoalDecompositionAction } = await import("@/lib/goals/actions-goal-intel")
      const proposal = await proposeGoalDecompositionAction(goalId)
      if (!proposal.ok) return { ok: false, error: `Could not generate proposal: ${proposal.reason}` }
      const applied = await applyGoalDecompositionAction(goalId, proposal.proposal)
      if (!applied.ok) return { ok: false, error: `Could not apply: ${applied.reason}` }
      return {
        ok: true,
        phasesCreated: applied.phasesCreated,
        milestonesCreated: applied.milestonesCreated,
        questsCreated: applied.questsCreated,
      }
    }
    case "understand_goal": {
      const { proposeGoalUnderstandingAction } = await import("@/lib/goals/actions-goal-intel")
      const result = await proposeGoalUnderstandingAction(goalId)
      if (!result.ok) return { ok: false, error: `Could not synthesize: ${result.reason}` }
      return { ok: true, understanding: result.proposal }
    }
    case "create_journey": {
      const { createGoalJourneyAction } = await import("@/lib/goals/actions")
      const titlesRaw = typeof args.titles === "string" ? args.titles : ""
      const titles = titlesRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
      if (titles.length === 0) return { ok: false, error: "No phase titles provided" }
      const created = await createGoalJourneyAction(goalId, { mode: "custom", titles })
      return { ok: true, phasesCreated: created.created }
    }
    default:
      return { ok: false, error: `Unknown tool: ${name}` }
  }
}

/**
 * Fallback text when the follow-up model call fails. Summarizes the tool
 * results so the user still gets useful feedback.
 */
function formatToolResults(results: Array<{ id: string; name: string; result: unknown }>): string {
  const parts: string[] = []
  for (const r of results) {
    const res = r.result as Record<string, unknown> | undefined
    if (!res || typeof res !== "object") continue
    if (r.name === "decompose_goal") {
      if (res.ok) {
        parts.push(
          `Journey created: ${res.phasesCreated} phases, ${res.milestonesCreated} milestones, ${res.questsCreated} quests.`,
        )
      } else {
        parts.push(`Could not create journey: ${res.error ?? "unknown error"}.`)
      }
    } else if (r.name === "understand_goal") {
      if (res.ok && res.understanding) {
        const u = res.understanding as Record<string, unknown>
        parts.push(`Goal understanding:\nState: ${u.state ?? "N/A"}\nTrajectory: ${u.trajectory ?? "N/A"}`)
      } else {
        parts.push(`Could not analyze goal: ${res.error ?? "unknown error"}.`)
      }
    } else if (r.name === "create_journey") {
      if (res.ok) {
        parts.push(`Journey created with ${res.phasesCreated} phases.`)
      } else {
        parts.push(`Could not create journey: ${res.error ?? "unknown error"}.`)
      }
    }
  }
  return parts.join("\n\n") || "Action completed."
}
