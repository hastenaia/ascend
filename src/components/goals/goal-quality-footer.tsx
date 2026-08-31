"use client"
import * as React from "react"
import { Sparkles, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { qualityGrade, type QualityRubricItem } from "@/lib/goals/intel-ui"
import { proposeGoalQualityAction } from "@/lib/goals/actions-goal-intel"
import { cn } from "@/lib/utils"
import type { GoalQualityExplanation } from "@/lib/goals/proposals/schemas"

const TONE_STYLES: Record<"good" | "warn" | "bad", string> = {
  good: "bg-[hsl(var(--gold)/0.14)] text-[hsl(var(--gold))]",
  warn: "bg-[hsl(var(--gold)/0.10)] text-[hsl(var(--gold))]",
  bad: "bg-destructive/10 text-destructive",
}

type QualityState = { score: number; max: number; rubric: QualityRubricItem[] } | null

export function GoalQualityFooter({ goalId, quality }: { goalId: string; quality: QualityState }) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <div className="flex items-center justify-between gap-2 pt-3">
        {quality ? (
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest", TONE_STYLES[qualityGrade(quality.score, quality.max).tone])}>
            <TrendingUp className="size-3" />
            {quality.score}/{quality.max}
          </span>
        ) : (
          <span className="h-4 w-12 rounded-full bg-muted" aria-hidden />
        )}
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setOpen(true)}>
          <Sparkles className="size-3.5 text-primary" /> Improve
        </Button>
      </div>
      <GoalImproveDialog goalId={goalId} quality={quality} open={open} onOpenChange={setOpen} />
    </>
  )
}

function GoalImproveDialog({
  goalId,
  quality,
  open,
  onOpenChange,
}: {
  goalId: string
  quality: QualityState
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [explanation, setExplanation] = React.useState<GoalQualityExplanation | null>(null)
  const [done, setDone] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [unavailable, setUnavailable] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    proposeGoalQualityAction(goalId)
      .then((res) => {
        if (cancelled) return
        if (res.ok && res.data.explanation) setExplanation(res.data.explanation)
        else if (!res.ok && (res.reason === "unavailable" || res.reason === "no_key" || res.reason === "rate_limited" || res.reason === "upstream_error")) setUnavailable(true)
        else if (!res.ok) setError("Couldn't analyze this goal right now.")
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't analyze this goal right now.")
      })
      .finally(() => {
        if (!cancelled) setDone(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, goalId])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> Improve this goal
          </DialogTitle>
          <DialogDescription>Deterministic quality score, with a coach perspective on what to strengthen.</DialogDescription>
        </DialogHeader>

        {quality && (
          <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-3">
            <span className={cn("font-mono text-2xl font-bold", TONE_STYLES[qualityGrade(quality.score, quality.max).tone])}>{quality.score}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">
                {quality.score}/{quality.max} · {qualityGrade(quality.score, quality.max).label}
              </p>
              <p className="text-[11px] text-muted-foreground">Quality reflects how well-structured and active this goal is.</p>
            </div>
          </div>
        )}

        {quality && quality.rubric.length > 0 && (
          <div className="space-y-1.5">
            {quality.rubric.map((r) => (
              <div key={r.key} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="font-mono text-muted-foreground">
                  {r.score}/{r.max}
                </span>
              </div>
            ))}
          </div>
        )}

        {!done && (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}

        {done && error && <p className="text-sm text-destructive">{error}</p>}
        {done && unavailable && <p className="text-sm text-muted-foreground">Coach is unavailable right now — here&apos;s the deterministic score above. Try again shortly.</p>}

        {done && explanation && (
          <div className="space-y-3 rounded-xl border p-4 text-sm">
            {explanation.summary && <p className="leading-relaxed text-muted-foreground">{explanation.summary}</p>}
            {explanation.strengths.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-primary">Strengths</p>
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {explanation.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {explanation.improvements.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--gold))]">Improvements</p>
                <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
                  {explanation.improvements.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {explanation.suggested_next_step && (
              <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-bold text-foreground">Next step:</span> {explanation.suggested_next_step}
              </p>
            )}
          </div>
        )}

        <div className="mt-1 flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
