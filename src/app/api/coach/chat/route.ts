import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { callModel, type ChatMessage } from "@/lib/coach/provider"
import { buildSystemPrompt } from "@/lib/coach/prompt"
import { gatherCoachContext } from "@/lib/coach/context"
import { appendMessage, loadHistory } from "@/lib/coach/history"
import { rateLimited } from "@/lib/coach/ratelimit"

export const runtime = "nodejs"

/**
 * POST /api/coach/chat
 * Body: { message: string }
 * Returns: { ok:true, reply } | { ok:false, unavailable:true }
 * Never fabricates a reply when the model is unreachable.
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

  const messages: ChatMessage[] = [
    buildSystemPrompt(ctx.text),
    ...history.slice(-20),
    { role: "user", content: message },
  ]

  // Persist the user's turn regardless of model availability (history continuity)
  await appendMessage(supabase, user.id, "user", message)

  const result = await callModel(messages, { maxTokens: 700 })
  if (!result.ok) {
    // No fabricated responses — ever.
    return NextResponse.json({ ok: false, unavailable: true }, { status: 200 })
  }

  await appendMessage(supabase, user.id, "assistant", result.content)
  return NextResponse.json({ ok: true, reply: result.content })
}
