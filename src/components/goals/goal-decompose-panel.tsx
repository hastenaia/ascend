"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { GitBranch, Layers, ListChecks, Sparkles, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { proposeGoalDecompositionAction, applyGoalDecompositionAction } from "@/lib/goals/actions-goal-intel"
import { proposalErrorState } from "@/lib/goals/intel-ui"
import type { GoalDecomposition } from "@/lib/goals/proposals/schemas"

type PanelState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "proposal"; proposal: GoalDecomposition }
  | { kind: "applying" }
  | { kind: "applied"; phases: number; milestones: number; quests: number }
  | { kind: "unavailable" }
  | { kind: "error"; message: string }

export function GoalDecomposePanel({ goalId }: { goalId: string }) {
  const router = useRouter()
  const [state, setState] = React.useState<PanelState>({ kind: "idle" })

  async function propose() {
    setState({ kind: "loading" })
    try {
      const res = await proposeGoalDecompositionAction(goalId)
      if (!res.ok) {
        const err = proposalErrorState(res)
        if (err.kind === "unavailable") setState({ kind: "unavailable" })
        else setState({ kind: "error", message: err.kind === "error" ? err.message : "Couldn't create a decomposition proposal right now." })
        return
      }
      setState({ kind: "proposal", proposal: res.proposal })
    } catch (e: unknown) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Couldn't create a decomposition proposal right now." })
    }
  }

  async function discard() {
    setState({ kind: "idle" })
  }

  async function confirm() {
    if (state.kind !== "proposal") return
    setState({ kind: "applying" })
    try {
      const res = await applyGoalDecompositionAction(goalId, state.proposal)
      if (!res.ok) {
        setState({
          kind: "error",
          message: reasonMessage(res.reason, res.detail),
        })
        return
      }
      setState({ kind: "applied", phases: res.phasesCreated, milestones: res.milestonesCreated, quests: res.questsCreated })
      toast.success(`Journey applied — ${res.phasesCreated} phases, ${res.milestonesCreated} milestones, ${res.questsCreated} quests`)
      router.refresh()
    } catch (e: unknown) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Could not apply the decomposition." })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitBranch className="size-4 text-primary" /> Decompose this goal
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {state.kind === "idle" && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">
              Have the coach propose a concrete journey: phases, milestones, and quests. You review it here before anything is created.
            </p>
            <Button size="sm" onClick={propose}>
              <Wand2 className="mr-1 size-4" /> Generate plan
            </Button>
          </div>
        )}

        {state.kind === "loading" && (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        )}

        {state.kind === "unavailable" && (
          <p className="text-sm text-muted-foreground">The coach is unavailable right now. Please try again shortly.</p>
        )}
        {state.kind === "error" && <p className="text-sm text-destructive">{state.message}</p>}

        {state.kind === "proposal" && (
          <>
            <p className="rounded-full bg-muted/50 px-2 py-0.5 text-center text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Proposal preview — nothing has been created yet
            </p>
            <Preview proposal={state.proposal} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={discard} disabled={state.kind !== "proposal"}>
                Discard
              </Button>
              <Button size="sm" onClick={confirm}>
                <Sparkles className="mr-1 size-4" /> Apply this plan
              </Button>
            </div>
          </>
        )}

        {state.kind === "applying" && (
          <div className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <p className="text-sm text-muted-foreground">Applying your plan…</p>
          </div>
        )}

        {state.kind === "applied" && (
          <div className="flex flex-col items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Wand2 className="size-4 text-primary" /> Applied!
            </p>
            <p className="text-sm text-muted-foreground">
              Created {state.phases} phases, {state.milestones} milestones, and {state.quests} quests. This journey is now live on your goal.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function reasonMessage(reason: string, detail?: string): string {
  switch (reason) {
    case "goal_already_decomposed":
      return "This goal already has a journey — a decomposition isn&apos;t needed."
    case "goal_not_eligible":
      return "This goal can&apos;t be decomposed right now."
    case "invalid_proposal":
      return "The generated plan was invalid. Try again."
    case "goal_not_found":
      return "This goal no longer exists."
    default:
      return detail ?? "Could not apply the plan."
  }
}

function Preview({ proposal }: { proposal: GoalDecomposition }) {
  const quests = proposal.quests ?? []
  return (
    <div className="space-y-3">
      {(proposal.phases ?? []).map((p, i) => {
        const milestones = p.milestones ?? []
        return (
          <div key={i} className="rounded-xl border p-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Layers className="size-3.5 text-primary" /> Phase {i + 1} · {p.title}
            </p>
            {p.objective && <p className="mt-0.5 text-xs text-muted-foreground">{p.objective}</p>}
            {milestones.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                {milestones.map((m, mi) => (
                  <li key={mi}>{m.title}</li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {quests.length > 0 && (
        <div className="rounded-xl border p-3">
          <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
            <ListChecks className="size-3.5 text-primary" /> Suggested quests
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
            {quests.map((q, i) => (
              <li key={i}>
                {q.title} <span className="font-mono text-[10px] uppercase opacity-70">({q.category}/{q.difficulty})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}