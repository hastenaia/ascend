import { asLocalDate, todayLocal } from "@/lib/goals/intelligence/metrics"

/**
 * Deterministic goal-conflict detection.
 *
 * READ-ONLY by construction: this module only inspects goal rows and returns
 * conflict records. It never mutates, merges, deletes, or reprioritizes
 * anything — that is the caller's (user-approved) concern.
 *
 * Conflicting goals are those currently competing for the user's attention,
 * so ARCHIVED and COMPLETED goals are ignored (per existing goal semantics a
 * completed/archived goal no longer competes). We only compare pairs of ACTIVE
 * goals.
 *
 * Three deterministic reasons, all grounded in an OVERLAPPING ACTIVE WINDOW so
 * we never claim two goals conflict merely for sharing a category:
 *   1. near-duplicate — titles are the same or strongly similar.
 *   2. category + time-window overlap — same category, overlapping windows,
 *      and BOTH are high/critical priority (meaningful competition for time in
 *      the same domain).
 *   3. priority clash — overlapping windows where at least one goal is
 *      `critical` and the other is `critical` or `high` (top-priority space is
 *      contested, regardless of category).
 */

export interface GoalConflictGoal {
  id: string
  title: string
  status: string
  category: string
  priority: "low" | "medium" | "high" | "critical" | string
  target_date: string | null
  created_at: string | null
  completed_at: string | null
}

export type ConflictReason =
  | { type: "near_duplicate"; similarity: number }
  | { type: "category_time_overlap"; category: string; windowOverlapDays: number }
  | { type: "priority_clash"; priorities: [string, string] }

export interface GoalConflict {
  goalAId: string
  goalBId: string
  goalATitle: string
  goalBTitle: string
  /** ordered by severity / specificity */
  reasons: ConflictReason[]
}

/** Window of an active goal's lifetime, in local YYYY-MM-DD. */
export interface ActiveWindow {
  start: string
  /** null when the goal has no target_date and is still ongoing (window open). */
  end: string | null
}

const HIGH_PRIORITIES = new Set(["high", "critical"])

// ---------------------------------------------------------------------------
// Active-window helpers
// ---------------------------------------------------------------------------

export function activeWindow(goal: GoalConflictGoal, today: string = todayLocal()): ActiveWindow {
  const created = asLocalDate(goal.created_at) ?? today
  const end = goal.target_date && goal.target_date >= today ? goal.target_date : null
  return { start: created, end }
}

/**
 * Overlap (in days) between two active windows, or null when they do not
 * overlap. An open-ended window (end === null) extends to today, so it
 * overlaps any window that is active today.
 */
export function windowOverlapDays(a: ActiveWindow, b: ActiveWindow, today: string = todayLocal()): number | null {
  const aEnd = a.end ?? today
  const bEnd = b.end ?? today
  const start = a.start > b.start ? a.start : b.start
  const end = aEnd < bEnd ? aEnd : bEnd
  if (end < start) return null
  const ms = (parseLocalDate(end).getTime() - parseLocalDate(start).getTime()) / 86_400_000
  return Math.round(ms) + 1
}

function parseLocalDate(iso: string): Date {
  return new Date(iso + "T00:00:00Z")
}

// ---------------------------------------------------------------------------
// Title similarity (deterministic)
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(["the", "a", "an", "to", "of", "for", "my", "and", "in", "on", "with", "from"])

/** Lowercase, strip punctuation, collapse whitespace. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenize(title: string): string[] {
  return normalizeTitle(title)
    .split(" ")
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
}

/** Jaccard similarity on non-stopword tokens, 0..1. */
export function tokenJaccard(a: string, b: string): number {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.length === 0 && tb.length === 0) return normalizeTitle(a) === normalizeTitle(b) ? 1 : 0
  const setA = new Set(ta)
  const setB = new Set(tb)
  let inter = 0
  for (const t of setA) if (setB.has(t)) inter++
  const union = new Set([...setA, ...setB]).size
  return union === 0 ? 0 : inter / union
}

/**
 * Near-duplicate when the normalized titles are byte-identical, or when the
 * shorter title is fully contained in the other, or when token Jaccard is high.
 */
export function isNearDuplicate(a: string, b: string): { duplicate: boolean; similarity: number } {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  if (na.length > 0 && na === nb) return { duplicate: true, similarity: 1 }
  const short = na.length <= nb.length ? na : nb
  const long = na.length <= nb.length ? nb : na
  if (short.length > 0 && long.includes(short)) return { duplicate: true, similarity: short.length / long.length }
  const sim = tokenJaccard(na, nb)
  return { duplicate: sim >= NEAR_DUPLICATE_JACCARD, similarity: round2(sim) }
}

// ---------------------------------------------------------------------------
// Thresholds (NEW named constants — justified below)
// ---------------------------------------------------------------------------

/**
 * Token-Jaccard at/above which two goals are flagged as near-duplicates.
 * NEW (no existing threshold covers title similarity): 0.75 means the titles
 * share >=75% of their (non-stopword) tokens, e.g. "get fit" vs "get fitter".
 */
export const NEAR_DUPLICATE_JACCARD = 0.75

/** Minimum allowed priorities for a category+time-window conflict to be real. */
export const CATEGORY_OVERLAP_MIN_PRIORITY = "high"

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export function detectGoalConflicts(goals: GoalConflictGoal[], today: string = todayLocal()): GoalConflict[] {
  const active = goals.filter((g) => g.status === "active")
  const conflicts: GoalConflict[] = []

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]
      const b = active[j]
      const overlap = windowOverlapDays(activeWindow(a, today), activeWindow(b, today), today)
      if (overlap === null) continue // no overlapping active window -> no conflict

      const reasons: ConflictReason[] = []

      const dup = isNearDuplicate(a.title, b.title)
      if (dup.duplicate) reasons.push({ type: "near_duplicate", similarity: dup.similarity })

      const bothHigh = HIGH_PRIORITIES.has(a.priority) && HIGH_PRIORITIES.has(b.priority)
      if (a.category === b.category && bothHigh) {
        reasons.push({ type: "category_time_overlap", category: a.category, windowOverlapDays: overlap })
      }

      const critical = a.priority === "critical" && b.priority === "critical"
      const criticalVsHigh =
        (a.priority === "critical" && b.priority === "high") || (a.priority === "high" && b.priority === "critical")
      if (critical || criticalVsHigh) {
        reasons.push({ type: "priority_clash", priorities: [a.priority, b.priority] })
      }

      if (reasons.length === 0) continue

      // Primary reason = the most specific; order matters, sort so
      // near_duplicate > priority_clash > category_time_overlap.
      reasons.sort((x, y) => rank(x) - rank(y))
      conflicts.push({
        goalAId: a.id,
        goalBId: b.id,
        goalATitle: a.title,
        goalBTitle: b.title,
        reasons,
      })
    }
  }

  return conflicts
}

function rank(r: ConflictReason): number {
  switch (r.type) {
    case "near_duplicate":
      return 0
    case "priority_clash":
      return 1
    case "category_time_overlap":
      return 2
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
