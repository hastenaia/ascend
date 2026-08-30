import { ScanSearch, TriangleAlert, Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { DetectedPattern } from "@/lib/patterns/engine"

const PATTERN_LABELS: Record<string, string> = {
  difficulty_avoidance: "Difficulty avoidance",
  repeated_postponement: "Repeated postponement",
  repeated_skipping: "Repeated skipping",
  declining_consistency: "Declining consistency",
  improving_consistency: "Improving consistency",
  overdue_accumulation: "Overdue pile-up",
  low_follow_through: "Low follow-through",
  excessive_active_goals: "Too many active goals",
  neglected_categories: "Neglected areas",
  low_quest_velocity: "Slow quest completion",
}

function severityBadge(severity: DetectedPattern["severity"]) {
  switch (severity) {
    case "warning":
      return "bg-rose-500/10 text-rose-600 ring-rose-500/25"
    case "notice":
      return "bg-amber-500/10 text-amber-600 ring-amber-500/25"
    default:
      return "bg-sky-500/10 text-sky-600 ring-sky-500/25"
  }
}

/**
 * Deterministic behavioral patterns — computed from real quest data, NOT AI
 * output. The coach chat explains them; this panel just shows the facts.
 */
export function PatternInsights({ patterns }: { patterns: DetectedPattern[] }) {
  return (
    <Card className="sheen">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanSearch className="size-4 text-primary" /> Pattern Insights
        </CardTitle>
        <CardDescription>Facts about your follow-through — computed, not guessed.</CardDescription>
      </CardHeader>
      <CardContent>
        {patterns.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            No notable patterns yet — your consistency looks steady. Keep going.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {patterns.map((p) => (
              <li key={p.type} className="rounded-xl border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{PATTERN_LABELS[p.type] ?? p.type.replace(/_/g, " ")}</p>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ring-1 ${severityBadge(p.severity)}`}>
                    {p.severity === "warning" ? <TriangleAlert className="size-3" /> : <Info className="size-3" />}
                    {p.severity}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{p.explanation_hint}</p>
                <p className="mt-1.5 text-xs font-medium text-foreground/80">{p.recommended_action}</p>
                {p.evidence.length > 0 && (
                  <ul className="mt-2 space-y-0.5 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                    {p.evidence.slice(0, 4).map((e, i) => (
                      <li key={i}>· {e}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}