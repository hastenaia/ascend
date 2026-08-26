/**
 * Momentum model — sustainable consistency, not streak pressure.
 *
 * Derived deterministically from the daily `momentum` ledger:
 *   - each active day contributes points, weighted by recency
 *   - missed days contribute nothing; old points decay gradually
 *   - one skipped day costs a few points, never a reset
 *   - recovery days (rest / light / reflection / planning) earn half credit —
 *     rest is part of training, not a failure state
 */

export const MOMENTUM_WINDOW_DAYS = 21
/** Daily retention factor: a day's contribution decays to 82% per day of age */
export const MOMENTUM_DECAY = 0.82
/** Full-activity day (score 15+ = hard quest or several easy ones) */
export const FULL_DAY_POINTS = 20
/** Score needed for a "full" day; lighter days scale proportionally */
export const FULL_DAY_SCORE = 15
/** Recovery-day credit (rest / light / reflection / planning) */
export const RECOVERY_DAY_POINTS = 10

export type MomentumDayRow = {
  date: string // YYYY-MM-DD
  score: number
  recovery: boolean
}

function todayIso(d = new Date()): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10)
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + "T00:00:00Z").getTime()
  const to = new Date(toIso + "T00:00:00Z").getTime()
  return Math.round((to - from) / 86_400_000)
}

/** Contribution of a single ledger day, as of `asOf` */
export function momentumDayPoints(row: MomentumDayRow, asOf = todayIso()): number {
  const age = daysBetween(row.date, asOf)
  if (age < 0 || age >= MOMENTUM_WINDOW_DAYS) return 0
  const weight = Math.pow(MOMENTUM_DECAY, age)
  let base = Math.min(1, row.score / FULL_DAY_SCORE) * FULL_DAY_POINTS
  if (row.recovery) base = Math.max(base, RECOVERY_DAY_POINTS)
  return base * weight
}

/** 0–100 momentum score as of today */
export function computeMomentumScore(rows: MomentumDayRow[], asOf = todayIso()): number {
  let sum = 0
  for (const r of rows) sum += momentumDayPoints(r, asOf)
  return Math.min(100, Math.round(sum))
}

/**
 * Preview what the score will drift to tomorrow with NO activity — used to
 * show users that skipping a day is gentle, never catastrophic.
 */
export function projectedTomorrowScore(rows: MomentumDayRow[], asOf = todayIso()): number {
  const t = new Date(asOf + "T00:00:00Z")
  t.setUTCDate(t.getUTCDate() + 1)
  return computeMomentumScore(rows, t.toISOString().slice(0, 10))
}

export function momentumTiers(score: number): { label: string; message: string } {
  if (score === 0) return { label: "Resting", message: "Every ascent starts with one quest." }
  if (score < 25) return { label: "Warming up", message: "You've started something — keep the thread." }
  if (score < 50) return { label: "Building", message: "Consistency compounds quietly." }
  if (score < 70) return { label: "Steady", message: "A rhythm is forming. Rest counts too." }
  if (score < 85) return { label: "Strong", message: "Sustainable and strong — this is how it's done." }
  return { label: "Peak flow", message: "Deep consistency. Hold gently, not desperately." }
}
