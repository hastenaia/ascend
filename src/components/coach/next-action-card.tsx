import Link from "next/link"
import { Lightbulb, RotateCcw, CheckCircle2 } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { NextAction } from "@/lib/coach/next-action"

/**
 * Next Best Action — the single highest-value task right now, selected by a
 * deterministic score (overdue > due today > phase/milestone/priority). The AI
 * explains it in the chat; this panel shows the selection with its reasoning.
 */
export function NextActionCard({
  action,
  questHref,
}: {
  action: NextAction | null
  questHref?: string | null
}) {
  const adapt = action?.kind === "adapt"

  return (
    <Card className={adapt ? "sheen border-violet-500/30 bg-gradient-to-br from-violet-500/[0.07] to-transparent" : "sheen"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {adapt ? <RotateCcw className="size-4 text-violet-500" /> : <Lightbulb className="size-4 text-primary" />}
          Next Best Action
        </CardTitle>
        <CardDescription>Reasoned from your open quests and priorities.</CardDescription>
      </CardHeader>
      <CardContent>
        {!action ? (
          <p className="rounded-xl border border-dashed bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            No open quests right now — nothing to recommend.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm font-semibold leading-snug">{action.headline}</p>
              {action.dueLabel && <p className="mt-0.5 text-[11px] text-muted-foreground">{action.dueLabel}</p>}
            </div>
            {action.why.length > 0 && (
              <ul className="space-y-1 text-xs leading-relaxed text-muted-foreground">
                {action.why.map((w, i) => (
                  <li key={i} className="flex gap-1.5">
                    <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-500" /> {w}
                  </li>
                ))}
              </ul>
            )}
            {questHref && (
              <Button variant="outline" size="sm" className="w-full" asChild>
                <Link href={questHref}>{adapt ? "Rescale it" : "Open it"}</Link>
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}