"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Route, Trash2, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createGoalJourneyAction } from "@/lib/goals/actions"
import { COACH_UNAVAILABLE_MESSAGE, type ProposedPhase } from "@/components/coach/types"

export function GeneratePhaseFlow({ goals }: { goals: { id: string; title: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [goalId, setGoalId] = React.useState<string>(goals[0]?.id ?? "")
  const [notes, setNotes] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [applying, setApplying] = React.useState(false)
  const [proposals, setProposals] = React.useState<ProposedPhase[] | null>(null)

  const disabled = goals.length === 0

  async function generate() {
    setLoading(true)
    setProposals(null)
    try {
      const res = await fetch("/api/coach/generate-phases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalTitle: goals.find((g) => g.id === goalId)?.title ?? "",
          notes,
        }),
      })
      const json = (await res.json()) as { ok?: boolean; phases?: ProposedPhase[] }
      if (json.ok && json.phases?.length) setProposals(json.phases)
      else toast.error(COACH_UNAVAILABLE_MESSAGE)
    } catch {
      toast.error(COACH_UNAVAILABLE_MESSAGE)
    } finally {
      setLoading(false)
    }
  }

  async function apply() {
    if (!proposals?.length || !goalId) return
    setApplying(true)
    try {
      await createGoalJourneyAction(goalId, {
        mode: "custom",
        titles: proposals.map((p) => p.title),
        objectives: proposals.map((p) => p.objective),
      })
      toast.success(`Journey created — ${proposals.length} phases`)
      setOpen(false)
      setProposals(null)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create journey")
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setProposals(null) }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} title={disabled ? "Create a goal first" : undefined}>
          <Route className="mr-1 size-4" /> Generate Phase Journey
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="size-4 text-primary" /> AI Phase Journey</DialogTitle>
          <DialogDescription>The coach designs an arc for one of your goals — you approve before anything is created.</DialogDescription>
        </DialogHeader>

        {!proposals ? (
          <div className="space-y-3">
            <select value={goalId} onChange={(e) => setGoalId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
              {goals.map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
            <Textarea rows={2} placeholder="Optional focus — e.g. 'I have 30 minutes a day'" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button onClick={generate} disabled={loading || !goalId} className="w-full">
              {loading ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Wand2 className="mr-1 size-4" />}
              {loading ? "Designing…" : "Generate journey"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2">
              {proposals.map((p, i) => (
                <div key={i} className="space-y-1.5 rounded-xl border p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                    <Input
                      value={p.title}
                      onChange={(e) => setProposals((ps) => ps!.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                      className="h-8 text-sm font-semibold"
                    />
                    <Button
                      variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground"
                      onClick={() => setProposals((ps) => ps!.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  <Input
                    value={p.objective}
                    onChange={(e) => setProposals((ps) => ps!.map((x, j) => (j === i ? { ...x, objective: e.target.value } : x)))}
                    placeholder="Objective"
                    className="h-8 text-xs"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setProposals(null)}>Back</Button>
              <Button onClick={apply} disabled={applying || proposals.length === 0}>
                {applying ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                Create journey ({proposals.length} phases)
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
