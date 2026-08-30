import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { callModel, type ChatMessage } from "@/lib/coach/provider"
import { rateLimited } from "@/lib/coach/ratelimit"
import { computeWeeklyMetricsForUser } from "@/lib/weekly/data"
import { formatWeeklyMetrics } from "@/lib/weekly/metrics"
import { detectPatternsForUser } from "@/lib/patterns/gather"
import { formatPatterns } from "@/lib/patterns/engine"
import { parseWeeklyReview } from "@/lib/weekly/schema"
import { coachStyleInstructions, COACH_STYLES, type CoachStyle } from "@/lib/coach/style"

export const runtime = "nodejs"

/**
 * POST /api/coach/weekly-review   Body: {}
 * → { ok:true, week, metrics, patterns_text, review }
 *
 * Deterministic metrics (this ISO week) + detected patterns are computed
 * server-side; AI only writes the human narrative. Review may be `null` when
 * there is nothing to review or the model is unavailable — metrics always come
 * back so the UI never depends on AI availability.
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  if (rateLimited(`weekly:${user.id}`)) return NextResponse.json({ error: "rate_limited" }, { status: 429 })

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .maybeSingle()
  const prefs = (profile as { preferences?: { coachStyle?: string } } | null)?.preferences
  const style: CoachStyle | null = prefs && COACH_STYLES.includes(prefs.coachStyle as never) ? (prefs.coachStyle as CoachStyle) : null

  const metrics = await computeWeeklyMetricsForUser(supabase, user.id)
  const patterns = await detectPatternsForUser(supabase, user.id)

  const metricsText = formatWeeklyMetrics(metrics)
  const patternsText = formatPatterns(patterns.patterns)

  // Nothing happened this week — no narrative to write.
  const empty =
    metrics.questsPlanned === 0 &&
    metrics.questsCompleted === 0 &&
    metrics.skipped === 0 &&
    metrics.postponed === 0 &&
    metrics.adapts === 0 &&
    patterns.patterns.length === 0
  if (empty) {
    return NextResponse.json({ ok: true, week: metrics.window.start, metrics, patterns_text: patternsText, review: null })
  }

  const facts = [metricsText, patternsText].filter(Boolean).join("\n")

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `You are the Ascend Weekly Review coach. You write the human narrative around FACTS that a computer computed — you never invent or adjust those numbers.

${coachStyleInstructions(style)}

Rules (hard):
- Refer only to the facts below. Never claim wins/challenges that are not visible in them.
- One concise summary + short lists. Keep every list item under 200 characters.
- Patterns section: reference only patterns listed below or clearly implied by the numbers (e.g. "postpone" events, "skip" events, completion rate).
- recommended_focus and next_actions should be concrete and achievable; when a pattern is present, tie them to fixing it.
- If the week is still in progress, frame the review as a mid-week pulse check, not a final verdict.

Respond with ONLY JSON (no markdown fences) matching EXACTLY:
{"summary":"<1-3 sentences>","wins":["..."],"challenges":["..."],"patterns":["..."],"lessons":["..."],"recommended_focus":["..."],"next_actions":["..."]}`,
    },
    { role: "user", content: `=== THIS WEEK'S FACTS ===\n${facts}\n=== END FACTS ===` },
  ]

  const result = await callModel(messages, { maxTokens: 700, temperature: 0.6 })
  if (result.ok) {
    const text = result.content.trim()
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start !== -1 && end > start) {
      const review = parseWeeklyReview(JSON.parse(text.slice(start, end + 1)))
      if (review) {
        return NextResponse.json({ ok: true, week: metrics.window.start, metrics, patterns_text: patternsText, review })
      }
    }
  }

  // Model unavailable or malformed output: deterministic facts still returned.
  return NextResponse.json({ ok: true, week: metrics.window.start, metrics, patterns_text: patternsText, review: null })
}