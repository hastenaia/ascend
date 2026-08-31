"use client"
import * as React from "react"
import { Brain, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { proposeGoalUnderstandingAction } from "@/lib/goals/actions-goal-intel"
import { proposalErrorState } from "@/lib/goals/intel-ui"
import type { GoalUnderstanding } from "@/lib/goals/proposals/schemas"

type PanelState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "proposal"; proposal: GoalUnderstanding }
  | { kind: "unavailable" }
  | { kind: "error"; message: string }

export function GoalUnderstandPanel({ goalId }: { goalId: string }) {
  const [state, setState] = React.useState<PanelState>({ kind: "idle" })

  async function run() {
    setState({ kind: "loading" })
    try {
      const res = await proposeGoalUnderstandingAction(goalId)
      if (!res.ok) {
        const err = proposalErrorState(res)
        if (err.kind === "unavailable") setState({ kind: "unavailable" })
        else setState({ kind: "error", message: err.kind === "error" ? err.message : "Couldn't synthesize this goal right now." })
        return
      }
      setState({ kind: "proposal", proposal: res.proposal })
    } catch (e: unknown) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Couldn't synthesize this goal right now." })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="size-4 text-primary" /> Understand this goal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.kind === "idle" && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">
              Get an AI synthesis of this goal&apos;s state, trajectory, risks, and opportunities — grounded only in the deterministic facts in the app.
            </p>
            <Button size="sm" onClick={run}>
              <Sparkles className="mr-1 size-4" /> Synthesize
            </Button>
          </div>
        )}

        {state.kind === "loading" && (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}

        {state.kind === "unavailable" && (
          <p className="text-sm text-muted-foreground">The coach is unavailable right now. Please try again shortly.</p>
        )}
        {state.kind === "error" && <p className="text-sm text-destructive">{state.message}</p>}

        {state.kind === "proposal" && (
          <>
            <p className="rounded-full bg-muted/50 px-2 py-0.5 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              AI proposal — for reference only, nothing was changed
            </p>
            <ProposalBody proposal={state.proposal} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ProposalBody({ proposal }: { proposal: GoalUnderstanding }) {
  const sections: { title: string; items: string[] }[] = [
    { title: "Where it stands", items: proposal.state ? [proposal.state.replace(/\n/g, " ")] : [] },
    { title: "Trajectory", items: proposal.trajectory ? [proposal.trajectory.replace(/\n/g, " ")] : [] },
    { title: "Risks", items: proposal.risks },
    { title: "Opportunities", items: proposal.opportunities },
  ]
  const open = proposal.open_questions ?? []
  return (
    <div className="space-y-3">
      {sections.map(
        (s) =>
          s.items.length > 0 && (
            <div key={s.title}>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-primary">{s.title}</p>
              <ul className="list-disc space-y-0.5 pl-4 text-sm text-muted-foreground">
                {s.items.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </div>
          ),
      )}
      {open.length > 0 && (
        <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <p className="mb-1 font-bold uppercase tracking-widest text-foreground">Questions to consider</p>
          <ul className="list-inside list-disc space-y-0.5">
            {open.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}