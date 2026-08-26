import type { SupabaseClient } from "@supabase/supabase-js"

export type ExperimentRow = {
  id: string
  title: string
  hypothesis: string | null
  status: "active" | "completed" | "archived"
  duration_days: number
  started_at: string | null
  completed_at: string | null
  track_sleep: boolean
  created_at: string
}

export type ExperimentEntry = {
  id: string
  entry_date: string | null
  completed: boolean
  mood: number | null
  energy: number | null
  productivity: number | null
  sleep_quality: number | null
  body: string | null
}

export type MetricSummary = {
  values: number[] // chronological
  avg: number | null
  firstHalfAvg: number | null
  secondHalfAvg: number | null
}

export type ExperimentWithStats = {
  experiment: ExperimentRow
  entries: ExperimentEntry[] // chronological by date
  loggedDays: number
  dayIndex: number // current day of the experiment (1-based), may exceed duration
  progressPct: number
  completionRate: number | null // % of logged days marked complete (null when no entries)
  metrics: { mood: MetricSummary; energy: MetricSummary; productivity: MetricSummary; sleep_quality: MetricSummary }
}

type MetricKey = "mood" | "energy" | "productivity" | "sleep_quality"

function summarizeMetric(entries: ExperimentEntry[], key: MetricKey): MetricSummary {
  const values = entries
    .filter((e) => typeof e[key] === "number")
    .map((e) => e[key] as number)
  if (values.length === 0) return { values: [], avg: null, firstHalfAvg: null, secondHalfAvg: null }
  const avg = values.reduce((s, v) => s + v, 0) / values.length
  const half = Math.floor(values.length / 2)
  const first = values.slice(0, half)
  const second = values.slice(half)
  return {
    values,
    avg: Math.round(avg * 10) / 10,
    firstHalfAvg: first.length ? Math.round((first.reduce((s, v) => s + v, 0) / first.length) * 10) / 10 : null,
    secondHalfAvg: second.length ? Math.round((second.reduce((s, v) => s + v, 0) / second.length) * 10) / 10 : null,
  }
}

function buildStats(experiment: ExperimentRow, entries: ExperimentEntry[]): ExperimentWithStats {
  const sorted = [...entries].sort((a, b) => (a.entry_date ?? "").localeCompare(b.entry_date ?? ""))
  const todayIso = new Date().toISOString().slice(0, 10)
  const startIso = experiment.started_at ?? sorted[0]?.entry_date ?? todayIso
  const dayIndex =
    Math.floor((new Date(todayIso + "T00:00:00Z").getTime() - new Date(startIso + "T00:00:00Z").getTime()) / 86_400_000) + 1
  const doneCount = sorted.filter((e) => e.completed).length
  const metrics = {
    mood: summarizeMetric(sorted, "mood"),
    energy: summarizeMetric(sorted, "energy"),
    productivity: summarizeMetric(sorted, "productivity"),
    sleep_quality: summarizeMetric(sorted, "sleep_quality"),
  } as ExperimentWithStats["metrics"]

  return {
    experiment,
    entries: sorted,
    loggedDays: sorted.length,
    dayIndex,
    progressPct: Math.min(100, Math.round((Math.min(dayIndex, experiment.duration_days) / experiment.duration_days) * 100)),
    completionRate: sorted.length > 0 ? Math.round((doneCount / sorted.length) * 100) : null,
    metrics,
  }
}

export async function getExperiments(supabase: SupabaseClient, userId: string): Promise<ExperimentWithStats[]> {
  const { data: experiments } = await supabase.from("experiments").select("*").eq("user_id", userId).order("created_at", { ascending: false })
  const rows = (experiments as ExperimentRow[] | null) ?? []
  if (rows.length === 0) return []

  const { data: entries } = await supabase
    .from("experiment_entries")
    .select("id,experiment_id,entry_date,completed,mood,energy,productivity,sleep_quality,body")
    .eq("user_id", userId)
    .order("entry_date")

  const byExp = new Map<string, ExperimentEntry[]>()
  for (const e of (entries as (ExperimentEntry & { experiment_id: string })[] | null) ?? []) {
    const arr = byExp.get(e.experiment_id) ?? []
    arr.push(e)
    byExp.set(e.experiment_id, arr)
  }

  return rows.map((r) => buildStats(r, byExp.get(r.id) ?? []))
}
