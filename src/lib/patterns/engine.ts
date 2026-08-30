import type { BehaviorFacts } from "@/lib/coach/behavior"

/**
 * Deterministic behavioral pattern detection layered on top of BehaviorFacts.
 *
 * The AI model may EXPLAIN a pattern and propose adaptations, but it may never
 * invent the evidence — every evidence string here is computed from real data.
 * Patterns are pure functions (unit-tested in engine.test.ts).
 */

export const PATTERN_TYPES = [
  "difficulty_avoidance",
  "repeated_postponement",
  "repeated_skipping",
  "declining_consistency",
  "improving_consistency",
  "overdue_accumulation",
  "low_follow_through",
  "excessive_active_goals",
  "neglected_categories",
  "low_quest_velocity",
] as const

export type PatternType = (typeof PATTERN_TYPES)[number]
export type PatternSeverity = "info" | "notice" | "warning"

export type DetectedPattern = {
  type: PatternType
  severity: PatternSeverity
  /** Deterministic facts supporting the pattern. The AI must use these verbatim. */
  evidence: string[]
  /** Deterministic "why" — the indicators that triggered detection. */
  explanation_hint: string
  /** Deterministic, non-shaming next step. */
  recommended_action: string
}

export type CategoryBreakdown = { category: string; active: number; closed: number; completed: number }

export type PatternInput = {
  facts: BehaviorFacts
  /** Category presence/history so we can spot categories with active quests but no closures. */
  categories: CategoryBreakdown[]
  activeGoalCount: number
  /**
   * Quest completions per ISO week, oldest → newest. The LAST entry is the
   * current (possibly partial) week. Completeness for consistency/velocity
   * analysis therefore excludes the trailing partial week.
   */
  completionsPerWeek: number[]
}

/** Detection thresholds — deterministic and exported for tests. */
export const PATTERN_THRESHOLDS = {
  difficultyAvoidanceMinClosed: 2,
  difficultyAvoidanceMaxRate: 50,
  difficultyGapPct: 30,
  difficultyEasyBandRate: 80,
  postponeCount: 3,
  skipCount: 3,
  overdueCount: 3,
  followThroughClosedMin: 5,
  followThroughMaxRate: 50,
  excessActiveGoals: 5,
  decliningFactor: 0.6,
  improvingFactor: 1.25,
  improvingMinQuests: 3,
  velocityAvgMin: 3,
  velocityWeeksMin: 4,
  maxPatterns: 5,
} as const

const SEVERITY_WEIGHT: Record<PatternSeverity, number> = { warning: 3, notice: 2, info: 1 }

/** Detection priority when two patterns overlap (lower = higher priority). */
const CONFLICT_OVERRIDES: { keep: PatternType; drop: PatternType[] }[] = [
  { keep: "declining_consistency", drop: ["low_quest_velocity"] },
]

function difficultyRate(facts: BehaviorFacts, difficulty: string): { closed: number; completed: number; rate: number } | null {
  const d = facts.closedByDifficulty.find((x) => x.difficulty === difficulty)
  if (!d || d.closed <= 0) return null
  return { closed: d.closed, completed: d.completed, rate: d.rate }
}

function detectDifficultyAvoidance(facts: BehaviorFacts): DetectedPattern | null {
  let worst: { difficulty: string; closed: number; completed: number; rate: number } | null = null
  for (const d of ["hard", "challenge"]) {
    const stats = difficultyRate(facts, d)
    if (stats && stats.rate <= PATTERN_THRESHOLDS.difficultyAvoidanceMaxRate && stats.closed >= PATTERN_THRESHOLDS.difficultyAvoidanceMinClosed) {
      if (!worst || stats.rate < worst.rate) worst = { difficulty: d, ...stats }
    }
  }
  if (!worst) return null

  // Find the strongest "easier" band for contrast (gap makes the signal concrete).
  let easyBand: { difficulty: string; rate: number } | null = null
  for (const d of ["easy", "medium"]) {
    const stats = difficultyRate(facts, d)
    if (stats && stats.rate >= PATTERN_THRESHOLDS.difficultyEasyBandRate && stats.closed >= PATTERN_THRESHOLDS.difficultyAvoidanceMinClosed) {
      if (!easyBand || stats.rate > easyBand.rate) easyBand = { difficulty: d, rate: stats.rate }
    }
  }
  if (!easyBand) return null
  if (easyBand.rate - worst.rate < PATTERN_THRESHOLDS.difficultyGapPct) return null

  const evidence = [
    `${easyBand.difficulty}: ${facts.closedByDifficulty.find((x) => x.difficulty === easyBand.difficulty)?.completed}/${facts.closedByDifficulty.find((x) => x.difficulty === easyBand.difficulty)?.closed} (${easyBand.rate}%)`,
    `${worst.difficulty}: ${worst.completed}/${worst.closed} (${worst.rate}%)`,
  ]
  return {
    type: "difficulty_avoidance",
    severity: "warning",
    evidence,
    explanation_hint: `follow-through is ${easyBand.rate}% on ${easyBand.difficulty} but only ${worst.rate}% on ${worst.difficulty}`,
    recommended_action:
      `Rescale the ${worst.difficulty} quest with the lowest follow-through — either a step-down difficulty or a smaller scope — instead of adding more tasks.`,
  }
}

function detectRepeatedPostponement(facts: BehaviorFacts): DetectedPattern | null {
  const offenders = facts.mostPostponed.filter((q) => q.count >= PATTERN_THRESHOLDS.postponeCount)
  if (offenders.length === 0) return null
  const evidence = offenders.map((q) => `"${q.title}" postponed ${q.count}x (${q.difficulty})`)
  return {
    type: "repeated_postponement",
    severity: "warning",
    evidence,
    explanation_hint: `quests postponed ${PATTERN_THRESHOLDS.postponeCount}+ times`,
    recommended_action:
      "Offer to shrink, reschedule with a fixed date, or retire the quests that keep getting pushed.",
  }
}

function detectRepeatedSkipping(facts: BehaviorFacts): DetectedPattern | null {
  const offenders = facts.mostSkipped.filter((q) => q.count >= PATTERN_THRESHOLDS.skipCount)
  if (offenders.length === 0) return null
  const evidence = offenders.map((q) => `"${q.title}" skipped ${q.count}x (${q.difficulty})`)
  return {
    type: "repeated_skipping",
    severity: "warning",
    evidence,
    explanation_hint: `quests skipped ${PATTERN_THRESHOLDS.skipCount}+ times`,
    recommended_action:
      "Step down the difficulty of the skipped quests or replace them with smaller, clearer versions.",
  }
}

function detectConsistencyChange(input: PatternInput): DetectedPattern | null {
  const seq = input.completionsPerWeek
  // Need: ≥2 complete weeks (exclude trailing partial week) + the partial week.
  const complete = seq.slice(0, -1)
  if (seq.length < 3 || complete.length < 2) return null
  const lastComplete = complete[complete.length - 1]
  const prior = complete.slice(0, -1)
  const priorMax = Math.max(...prior)

  const series = [...complete, seq[seq.length - 1]]
  const seriesLabel = series.map((c, i) => `${c}${i === series.length - 1 ? " this week" : ""}`).join(", ")

  if (lastComplete < priorMax * PATTERN_THRESHOLDS.decliningFactor) {
    return {
      type: "declining_consistency",
      severity: "warning",
      evidence: [`completions per week: ${seriesLabel}`],
      explanation_hint: `last full week (${lastComplete}) dipped below ${Math.round(priorMax * PATTERN_THRESHOLDS.decliningFactor)} (60% of the prior best of ${priorMax})`,
      recommended_action:
        "Lighten the weekly load for a week or two and re-anchor with small quests rather than adding more.",
    }
  }

  if (
    lastComplete >= PATTERN_THRESHOLDS.improvingMinQuests &&
    lastComplete > Math.max(Math.max(...prior), 0) * PATTERN_THRESHOLDS.improvingFactor
  ) {
    return {
      type: "improving_consistency",
      severity: "info",
      evidence: [`completions per week: ${seriesLabel}`],
      explanation_hint: `last full week (${lastComplete}) is ${Math.round(
        (lastComplete / Math.max(Math.max(...prior), 1)) * 100,
      )}% of the prior best`,
      recommended_action:
        "Keep the momentum sustainable — protect recovery and maintain the current cadence.",
    }
  }

  return null
}

function detectOverdueAccumulation(facts: BehaviorFacts): DetectedPattern | null {
  if (facts.overdueActive < PATTERN_THRESHOLDS.overdueCount) return null
  return {
    type: "overdue_accumulation",
    severity: "warning",
    evidence: [`${facts.overdueActive} overdue one-time quests`],
    explanation_hint: `${facts.overdueActive} active one-time quests are past their due date`,
    recommended_action:
      "Clear, reschedule, or retire the overdue quests instead of letting them pile up.",
  }
}

function detectLowFollowThrough(facts: BehaviorFacts): DetectedPattern | null {
  if (facts.closedTotal < PATTERN_THRESHOLDS.followThroughClosedMin) return null
  if (facts.overallCompletionRate > PATTERN_THRESHOLDS.followThroughMaxRate) return null
  return {
    type: "low_follow_through",
    severity: "warning",
    evidence: [`${facts.completedTotal}/${facts.closedTotal} closed quests finished (${facts.overallCompletionRate}%)`],
    explanation_hint: ``,
    recommended_action:
      "Reduce the number of open quests and make the next batch smaller and more concrete, so finishing becomes likelier.",
  }
}

function detectExcessiveActiveGoals(input: PatternInput): DetectedPattern | null {
  if (input.activeGoalCount < PATTERN_THRESHOLDS.excessActiveGoals) return null
  return {
    type: "excessive_active_goals",
    severity: "notice",
    evidence: [`${input.activeGoalCount} active goals`],
    explanation_hint: `${input.activeGoalCount} goals are active at once`,
    recommended_action:
      "Keep 1-2 active goals and park or pause the rest so effort isn't split too thin.",
  }
}

function detectNeglectedCategories(input: PatternInput): DetectedPattern | null {
  const hasHistory = input.categories.some((c) => c.closed > 0)
  if (!hasHistory) return null
  const neglected = input.categories
    .filter((c) => c.active >= 1 && c.closed === 0 && c.completed === 0)
    .sort((a, b) => b.active - a.active)
  if (neglected.length === 0) return null
  const evidence = neglected.map((c) => `"${c.category}": ${c.active} active, 0 completed`)
  return {
    type: "neglected_categories",
    severity: neglected.some((c) => c.active >= 2) ? "notice" : "info",
    evidence,
    explanation_hint: "categories with active quests that have never been completed",
    recommended_action:
      "Try one small quest in a neglected category to restore balance — or pause the category without guilt.",
  }
}

function detectLowVelocity(input: PatternInput): DetectedPattern | null {
  const complete = input.completionsPerWeek.slice(0, -1)
  if (complete.length < PATTERN_THRESHOLDS.velocityWeeksMin) return null
  const avg = complete.reduce((s, n) => s + n, 0) / complete.length
  const max = Math.max(...complete)
  if (avg >= PATTERN_THRESHOLDS.velocityAvgMin || max <= 0) return null
  return {
    type: "low_quest_velocity",
    severity: "notice",
    evidence: [`${Math.round(avg * 10) / 10} quests/week on average over ${complete.length} full weeks`],
    explanation_hint: `average completions per full week is below ${PATTERN_THRESHOLDS.velocityAvgMin}`,
    recommended_action: "Add one small daily anchor quest to build a steady cadence.",
  }
}

const DETECTORS: ((input: PatternInput) => DetectedPattern | null)[] = [
  (i) => detectDifficultyAvoidance(i.facts),
  (i) => detectRepeatedPostponement(i.facts),
  (i) => detectRepeatedSkipping(i.facts),
  detectConsistencyChange,
  (i) => detectOverdueAccumulation(i.facts),
  (i) => detectLowFollowThrough(i.facts),
  detectExcessiveActiveGoals,
  detectNeglectedCategories,
  detectLowVelocity,
]

export function detectPatterns(input: PatternInput): DetectedPattern[] {
  const candidates = DETECTORS.map((fn) => fn(input)).filter((p): p is DetectedPattern => p !== null)

  const dropped = new Set<PatternType>()
  for (const rule of CONFLICT_OVERRIDES) {
    if (candidates.some((p) => p.type === rule.keep)) {
      for (const type of rule.drop) dropped.add(type)
    }
  }
  const kept = candidates.filter((p) => !dropped.has(p.type))

  return kept
    .sort(
      (a, b) =>
        SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] ||
        PATTERN_TYPES.indexOf(a.type) - PATTERN_TYPES.indexOf(b.type),
    )
    .slice(0, PATTERN_THRESHOLDS.maxPatterns)
}

export function formatPatterns(patterns: DetectedPattern[]): string {
  if (patterns.length === 0) return "PATTERNS: none detected from current data"
  const lines = patterns.map(
    (p) => `- ${p.type} (${p.severity}): evidence [${p.evidence.join("; ")}] → ${p.recommended_action}`,
  )
  return `PATTERNS:\n${lines.join("\n")}`
}