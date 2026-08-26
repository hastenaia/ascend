"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, Circle, FlaskConical, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { completeExperimentAction, logExperimentEntryAction } from "@/lib/experiments/actions"
import type { ExperimentWithStats, MetricSummary } from "@/lib/experiments/queries"
import { ExperimentProgress } from "@/components/experiments/experiment-progress"
import { Sparkline } from "@/components/experiments/sparkline"

function Scale({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(value === n ? null : n)}
          className={cn(
            "size-7 rounded-lg border font-mono text-xs transition-colors",
            value === n ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/40 hover:bg-muted/50",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

/** Raw numbers + charts only when enough data exists. No fabricated conclusions. */
function MetricResult({ label, m }: { label: string; m: MetricSummary }) {
  if (!m.avg && m.avg !== 0) return null
  const enough = m.values.length >= 4
  const delta = m.firstHalfAvg !== null && m.secondHalfAvg !== null ? Math.round((m.secondHalfAvg - m.firstHalfAvg) * 10) / 10 : null

  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="stat-num text-sm font-bold">{m.avg}</p>
      </div>
      {enough ? (
        <>
          <Sparkline values={m.values} className="mt-1 h-6 w-full text-primary" />
          <p className="font-mono text-[9px] text-muted-foreground">
            {m.values.length} data points{delta !== null && delta !== 0 ? ` · second half ${delta > 0 ? "+" : ""}${delta}` : ""}
          </p>
        </>
      ) : (
        <p className="mt-1 font-mono text-[9px] text-muted-foreground">{m.values.length}/4 points for a trend chart</p>
      )}
    </div>
  )
}

export function ExperimentDetail({
  data,
  open,
  onOpenChange,
}: {
  data: ExperimentWithStats | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [completedToday, setCompletedToday] = React.useState(false)
  const [scores, setScores] = React.useState<{ mood: number | null; energy: number | null; productivity: number | null; sleep_quality: number | null }>({
    mood: null,
    energy: null,
    productivity: null,
    sleep_quality: null,
  })
  const [note, setNote] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  if (!data || data.experiment.status === "archived") return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent /></Sheet>

  const e = data.experiment
  const active = e.status === "active"
  const todayIso = new Date().toISOString().slice(0, 10)
  const todayEntry = data.entries.find((en) => en.entry_date === todayIso)

  async function saveEntry() {
    if (!data) return
    setBusy(true)
    try {
      await logExperimentEntryAction(e.id, {
        completed: completedToday,
        mood: scores.mood,
        energy: scores.energy,
        productivity: scores.productivity,
        sleep_quality: scores.sleep_quality,
        body: note.trim() || null,
      })
      toast.success("Day logged")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not log entry")
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    if (!data) return
    setBusy(true)
    try {
      await completeExperimentAction(e.id)
      toast.success("Experiment completed — results are in")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l border-border/60 sm:max-w-md">
        <SheetHeader className="gap-1 pb-2 pr-6 text-left">
          <SheetTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <FlaskConical className="size-4 text-primary" /> {e.title}
          </SheetTitle>
          {e.hypothesis && <p className="text-xs italic leading-relaxed text-muted-foreground">&ldquo;{e.hypothesis}&rdquo;</p>}
          <p className="font-mono text-[11px] text-muted-foreground">
            Day {Math.min(data.dayIndex, e.duration_days)} of {e.duration_days}
            {e.started_at ? ` · started ${e.started_at}` : ""}
            {data.completionRate !== null && ` · ${data.completionRate}% completion`}
          </p>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-10">
          {/* Progress */}
          <section>
            <ExperimentProgress
              durationDays={e.duration_days}
              loggedDayIndexes={new Set(data.entries.map((en) => en.entry_date).filter((d): d is string => !!d).map((d) => Math.floor((new Date(d + "T00:00:00Z").getTime() - new Date((e.started_at ?? d) + "T00:00:00Z").getTime()) / 86_400_000) + 1))}
              dayIndex={data.dayIndex}
              status={e.status}
            />
          </section>

          {/* Log today — only while running */}
          {active && (
            <section className="space-y-3 rounded-xl border p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                {todayEntry ? "Today is logged — update it" : "Log today"}
              </p>
              <label className="flex items-center gap-2.5 text-sm">
                {todayEntry?.completed || completedToday ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Circle className="size-5 text-muted-foreground/40" />}
                <Checkbox checked={completedToday || !!todayEntry?.completed} onCheckedChange={(v) => setCompletedToday(!!v)} aria-label="Mark routine completed" />
                Did the routine today?
              </label>

              {(
                [
                  { key: "mood" as const, label: "Mood", icon: null },
                  { key: "energy" as const, label: "Energy", icon: null },
                  { key: "productivity" as const, label: "Productivity", icon: null },
                  ...(e.track_sleep ? [{ key: "sleep_quality" as const, label: "Sleep quality", icon: Moon }] : []),
                ]
              ).map(({ key, label, icon: Icon }) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {Icon && <Icon className="size-3" />} {label}
                  </span>
                  <Scale
                    value={scores[key] ?? (todayEntry ? ((todayEntry[key] as number | null) ?? null) : null)}
                    onChange={(v) => setScores((s) => ({ ...s, [key]: v }))}
                  />
                </div>
              ))}

              <Textarea rows={2} placeholder="Optional note…" maxLength={2000} value={note} onChange={(ev) => setNote(ev.target.value)} />

              <Button size="sm" className="w-full" onClick={saveEntry} disabled={busy}>
                {busy ? "Saving…" : "Save entry"}
              </Button>
            </section>
          )}

          {/* Actual results — real aggregates only */}
          <section className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {active ? "Results so far" : "Final results"}
            </p>
            {data.loggedDays === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No entries yet — the numbers appear as you log days.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <MetricResult label="Mood" m={data.metrics.mood} />
                <MetricResult label="Energy" m={data.metrics.energy} />
                <MetricResult label="Productivity" m={data.metrics.productivity} />
                {e.track_sleep && <MetricResult label="Sleep quality" m={data.metrics.sleep_quality} />}
                <p className="col-span-2 rounded-xl border bg-muted/20 p-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {data.loggedDays} entries · {data.entries.filter((x) => x.completed).length} completed days. Raw data from your entries — no conclusions invented.
                </p>
              </div>
            )}
          </section>

          {active && (
            <>
              <Separator />
              <Button variant="outline" size="sm" className="w-full" onClick={finish} disabled={busy}>
                End experiment & lock results
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
