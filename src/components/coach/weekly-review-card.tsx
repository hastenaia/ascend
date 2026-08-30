"use client"
import * as React from "react"
import { CalendarRange, TrendingUp, Zap, RefreshCw, Sparkles } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { WeeklyMetrics } from "@/lib/weekly/metrics"
import type { WeeklyReviewOutput } from "@/lib/weekly/schema"

type WeeklyReviewResponse = {
  ok: boolean
  week: string
  metrics: WeeklyMetrics
  patterns_text: string
  review: WeeklyReviewOutput | null
}

function List({ title, items, accent }: { title: string; items: string[]; accent?: string }) {
  if (!items.length) return null
  return (
    <div>
      <p className={`text-[10px] font-bold uppercase tracking-widest ${accent ?? "text-muted-foreground"}`}>{title}</p>
      <ul className="mt-1.5 space-y-1.5 text-xs leading-relaxed text-foreground/85">
        {items.map((it, i) => (
          <li key={i} className="rounded-lg border bg-muted/30 px-2.5 py-1.5">{it}</li>
        ))}
      </ul>
    </div>
  )
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-bold tabular-nums leading-none">{value}</p>
    </div>
  )
}

/** Weekly Review: hard numbers first (computed), AI narrative second (optional). */
export function WeeklyReviewCard() {
  const [data, setData] = React.useState<WeeklyReviewResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(false)

  React.useEffect(() => {
    let disposed = false
    fetch("/api/coach/weekly-review", { method: "POST" })
      .then((res) => res.json())
      .then((json: WeeklyReviewResponse) => {
        if (disposed) return
        if (!json.ok) throw new Error("bad response")
        setData(json)
        setError(false)
      })
      .catch(() => {
        if (!disposed) setError(true)
      })
      .finally(() => {
        if (!disposed) setLoading(false)
      })
    return () => {
      disposed = true
    }
  }, [])

  async function retry() {
    setLoading(true)
    try {
      const res = await fetch("/api/coach/weekly-review", { method: "POST" })
      const json = (await res.json()) as WeeklyReviewResponse
      if (!res.ok || !json?.ok) throw new Error("bad response")
      setData(json)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  const m = data?.metrics ?? null
  const r = data?.review ?? null

  return (
    <Card className="sheen">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarRange className="size-4 text-primary" /> Weekly Review
        </CardTitle>
        <CardDescription>
          {data ? `${data.week}${m?.isPartialWeek ? " · in progress" : ""}` : "This ISO week, Monday→Sunday"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">Could not load this week&apos;s review.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={retry}>
              <RefreshCw className="size-3" /> Retry
            </Button>
          </div>
        ) : m ? (
          <div className="space-y-4">
            {!r && (
              <p className="text-[11px] text-muted-foreground">
                AI narrative unavailable right now — here are the raw facts for the week.
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Chip label="Completion" value={`${m.questsCompleted}/${m.questsPlanned} · ${m.completionRate}%`} />
              <Chip label="XP earned" value={m.xpEarned !== 0 ? `+${m.xpEarned}` : "0"} />
              <Chip
                label="Momentum"
                value={
                  m.momentumDeltaPct !== null
                    ? `${m.momentumDeltaPct >= 0 ? "+" : ""}${m.momentumDeltaPct}%`
                    : `${m.momentumNow}/100`
                }
              />
              <Chip
                label="Follow-through"
                value={`${[m.postponed > 0 && `postponed ${m.postponed}`, m.skipped > 0 && `skipped ${m.skipped}`, m.adapts > 0 && `rescaled ${m.adapts}`].filter(Boolean).join(" · ") || "clean"}`}
              />
            </div>

            {m.difficultyPerformance.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {m.difficultyPerformance.map((d) => (
                  <span key={d.difficulty} className="rounded-full border bg-muted/30 px-2.5 py-1 text-[11px] capitalize">
                    {d.difficulty} {d.completed}/{d.planned} ({d.rate}%)
                  </span>
                ))}
              </div>
            )}

            {m.statProgress.length > 0 && (
              <p className="text-xs text-muted-foreground">
                <TrendingUp className="mr-1 inline size-3" /> Stats: {m.statProgress.map((s) => `${s.name} +${s.delta}`).join(", ")}
              </p>
            )}
            {m.skillProgress.length > 0 && (
              <p className="text-xs text-muted-foreground">
                <Zap className="mr-1 inline size-3" /> Skills: {m.skillProgress.map((s) => `${s.name} +${s.delta}xp`).join(", ")}
              </p>
            )}

            {r && (
              <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
                <p className="text-sm leading-relaxed">{r.summary}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <List title="Wins" items={r.wins} accent="text-emerald-500" />
                  <List title="Challenges" items={r.challenges} accent="text-rose-500" />
                </div>
                <List title="Patterns" items={r.patterns} />
                <List title="Lessons" items={r.lessons} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <List title="Focus this week" items={r.recommended_focus} />
                  <List
                    title="Next actions"
                    items={r.next_actions.map((a) => a.replace(/^[✔✅]\s*/, ""))}
                  />
                </div>
              </div>
            )}

            {r && m?.isPartialWeek && (
              <p className="text-center text-[10px] text-muted-foreground">
                <Sparkles className="mr-1 inline size-3 text-violet-500" /> Mid-week pulse check — not a final verdict.
              </p>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}