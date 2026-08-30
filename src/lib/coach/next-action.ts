import type { SupabaseClient } from "@supabase/supabase-js"
import { getCurrentPhase } from "@/lib/phases/queries"
import { todayDateString } from "@/lib/quests/queries"
import { gatherBehaviorFacts } from "@/lib/coach/behavior"

/**
 * Next Best Action — a SINGLE, deterministic, highest-value next action.
 *
 * The AI gets to explain and adapt; the SELECTION is a score over real facts:
 * overdue > due today > milestone/phase alignment > goal priority > deadline.
 * Quests postponed 3+ times are surfaced as "adapt", not "force".
 */

export type CandidateQuest = {
  id: string
  title: string
  category: string
  difficulty: string
  recurrence: string
  due_date: string | null
  phase_id: string | null
  milestone_id: string | null
  postponed_count: number
  skipped_count: number
}

export type NextActionKind = "complete" | "adapt"

export type NextActionInput = {
  quests: CandidateQuest[]
  today: string
  currentPhase: { id: string; title: string } | null
  nextMilestone: { id: string; title: string } | null
  /** phase_id → priority of the goal that owns it */
  phasePriority: Record<string, string>
  /** user shows difficulty-avoidance: prefer smaller, easier tasks */
  avoidHard: boolean
}

export type NextAction = {
  quest: { id: string; title: string; category: string; difficulty: string }
  kind: NextActionKind
  headline: string
  why: string[]
  dueLabel: string | null
}

export const NEXT_ACTION_THRESHOLDS = {
  adaptAfterPostpones: 3,
  overduePts: 90,
  dueTodayPts: 70,
  nearPts: [40, 25, 10] as const, // due in ≤2, ≤5 days, else
  recurringPts: 20,
  phasePts: 25,
  milestonePts: 35,
  criticalPts: 30,
  highPts: 20,
  easyMediumPts: 15,
  adaptPenalty: 60,
} as const

function daysUntil(due: string | null, today: string): number | null {
  if (!due) return null
  return Math.round((new Date(due + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime()) / 86_400_000)
}

function priorityPts(p: string): number {
  if (p === "critical") return NEXT_ACTION_THRESHOLDS.criticalPts
  if (p === "high") return NEXT_ACTION_THRESHOLDS.highPts
  return 0
}

export function recommendNextAction(input: NextActionInput): NextAction | null {
  const quests = input.quests
  if (quests.length === 0) return null

  const scored = quests.map((q) => {
    const isOneTime = q.recurrence === "none"
    const d = daysUntil(q.due_date, input.today)
    let base = 0
    if (isOneTime) {
      if (d !== null && d < 0) base += NEXT_ACTION_THRESHOLDS.overduePts
      else if (d === null || d === 0) base += NEXT_ACTION_THRESHOLDS.dueTodayPts
      else if (d <= 2) base += NEXT_ACTION_THRESHOLDS.nearPts[0]
      else if (d <= 5) base += NEXT_ACTION_THRESHOLDS.nearPts[1]
      else base += NEXT_ACTION_THRESHOLDS.nearPts[2]
    } else {
      base += NEXT_ACTION_THRESHOLDS.recurringPts
    }

    if (input.currentPhase && q.phase_id === input.currentPhase.id) base += NEXT_ACTION_THRESHOLDS.phasePts
    if (input.nextMilestone && q.milestone_id === input.nextMilestone.id) base += NEXT_ACTION_THRESHOLDS.milestonePts
    base += priorityPts(input.phasePriority[q.phase_id ?? ""] ?? "low")
    if (input.avoidHard && (q.difficulty === "easy" || q.difficulty === "medium")) base += NEXT_ACTION_THRESHOLDS.easyMediumPts

    const chronicPostponer = (q.postponed_count ?? 0) >= NEXT_ACTION_THRESHOLDS.adaptAfterPostpones
    const kind: NextActionKind = chronicPostponer ? "adapt" : "complete"
    return { q, base, kind, d, final: base - (kind === "adapt" ? NEXT_ACTION_THRESHOLDS.adaptPenalty : 0) }
  })

  scored.sort((a, b) => b.final - a.final || (a.d ?? 0) - (b.d ?? 0) || a.q.title.localeCompare(b.q.title))
  const top = scored[0]

  const dueLabel = (() => {
    if (top.q.recurrence !== "none") return null
    if (top.d === null) return "no due date set"
    if (top.d < 0) return `overdue since ${top.q.due_date}`
    if (top.d === 0) return "due today"
    return `due in ${top.d} day${top.d === 1 ? "" : "s"}`
  })()

  const why: string[] = []
  if (top.kind === "adapt") {
    why.push(`"${top.q.title}" has been postponed ${top.q.postponed_count} times — pushing it again rarely works`)
    why.push("rescale the scope or difficulty, or retire it")
  } else {
    if (top.d !== null && top.d < 0) why.push("it is the most overdue one-time quest")
    else if (top.d === 0) why.push("it is due today")
    else if (top.d !== null && top.d <= 2) why.push(`its deadline is close (${top.d} days)`)
    if (top.q.milestone_id && input.nextMilestone && top.q.milestone_id === input.nextMilestone.id)
      why.push(`it directly advances the current milestone "${input.nextMilestone.title}"`)
    else if (top.q.phase_id && input.currentPhase && top.q.phase_id === input.currentPhase.id)
      why.push(`it belongs to your current phase "${input.currentPhase.title}"`)
    const pr = input.phasePriority[top.q.phase_id ?? ""]
    if (pr === "critical" || pr === "high") why.push(`it is part of a ${pr}-priority goal`)
    if (input.avoidHard && (top.q.difficulty === "easy" || top.q.difficulty === "medium")) why.push("it is a small, high-likelihood task")
  }

  return {
    quest: { id: top.q.id, title: top.q.title, category: top.q.category, difficulty: top.q.difficulty },
    kind: top.kind,
    headline: top.kind === "adapt" ? `Rescale "${top.q.title}"` : `Complete "${top.q.title}"`,
    why,
    dueLabel,
  }
}

export function formatNextAction(action: NextAction | null): string {
  if (!action) return "NEXT BEST ACTION: none — no open quests right now."
  return `NEXT BEST ACTION: ${action.headline}${action.dueLabel ? ` (${action.dueLabel})` : ""}. Why: ${action.why.join("; ")}.`
}

export type NextActionSummary = { action: NextAction | null; text: string }

/** Fetch real data → single recommended action (deterministic, no AI). */
export async function recommendNextActionForUser(supabase: SupabaseClient, userId: string, today = todayDateString()): Promise<NextActionSummary> {
  const [questsRes, phase, goalsRes, phasesRes] = await Promise.all([
    supabase
      .from("quests")
      .select("id,title,category,difficulty,recurrence,due_date,phase_id,milestone_id,postponed_count,skipped_count")
      .eq("user_id", userId)
      .eq("status", "active"),
    getCurrentPhase(supabase, userId).catch(() => null),
    supabase.from("goals").select("id,priority,status").eq("user_id", userId),
    supabase.from("phases").select("id,goal_id").eq("user_id", userId),
  ])

  const quests = ((questsRes.data as CandidateQuest[] | null) ?? []).map((q) => ({
    ...q,
    postponed_count: q.postponed_count ?? 0,
    skipped_count: q.skipped_count ?? 0,
  }))

  const goalPriority = new Map<string, string>(((goalsRes.data as { id: string; priority: string }[] | null) ?? []).map((g) => [g.id, g.priority]))
  const phasePriority: Record<string, string> = {}
  for (const p of (phasesRes.data as { id: string; goal_id: string | null }[] | null) ?? []) {
    if (p.goal_id) phasePriority[p.id] = goalPriority.get(p.goal_id) ?? "low"
  }

  const behavior = await gatherBehaviorFacts(supabase, userId)
  const avoidHard = behavior.facts.closedByDifficulty.some(
    (d) => (d.difficulty === "hard" || d.difficulty === "challenge") && d.closed >= 2 && d.rate <= 50,
  )

  const action = recommendNextAction({
    quests,
    today,
    currentPhase: phase ? { id: phase.id, title: phase.title } : null,
    nextMilestone: phase?.nextMilestone ? { id: phase.nextMilestone.id, title: phase.nextMilestone.title } : null,
    phasePriority,
    avoidHard,
  })
  return { action, text: formatNextAction(action) }
}