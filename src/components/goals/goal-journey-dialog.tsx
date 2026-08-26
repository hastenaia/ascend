"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Layers, PenLine, Sparkles, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { createGoalJourneyAction } from "@/lib/goals/actions"
import type { JourneyBlueprint } from "@/lib/goals/queries"

export function GoalJourneyDialog({
  goalId,
  blueprints,
  open,
  onOpenChange,
}: {
  goalId: string
  blueprints: JourneyBlueprint[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [mode, setMode] = React.useState<"blueprint" | "custom">("blueprint")
  const [slug, setSlug] = React.useState<string | null>(blueprints[0]?.slug ?? null)
  const [customTitles, setCustomTitles] = React.useState("")
  const [busy, setBusy] = React.useState(false)

  async function generate() {
    setBusy(true)
    try {
      const input =
        mode === "blueprint" && slug
          ? { mode: "blueprint" as const, blueprintSlug: slug }
          : { mode: "custom" as const, titles: customTitles.split("\n").map((t) => t.trim()).filter(Boolean) }
      const res = await createGoalJourneyAction(goalId, input)
      toast.success(`Journey created — ${res.created} phases`)
      onOpenChange(false)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create journey")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="size-4 text-primary" /> Personalized Journey</DialogTitle>
          <DialogDescription>Give this goal its own arc of phases. Pick a blueprint or write your own sequence.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("blueprint")}
            className={`rounded-xl border p-3 text-left text-sm transition-colors ${mode === "blueprint" ? "border-primary/50 bg-primary/5" : "hover:bg-muted/40"}`}
          >
            <Sparkles className="mb-1 size-4 text-primary" />
            <span className="font-semibold">Blueprint</span>
            <p className="text-xs text-muted-foreground">Curated arcs</p>
          </button>
          <button
            type="button"
            onClick={() => setMode("custom")}
            className={`rounded-xl border p-3 text-left text-sm transition-colors ${mode === "custom" ? "border-primary/50 bg-primary/5" : "hover:bg-muted/40"}`}
          >
            <PenLine className="mb-1 size-4 text-primary" />
            <span className="font-semibold">Custom</span>
            <p className="text-xs text-muted-foreground">Your own phases</p>
          </button>
        </div>

        {mode === "blueprint" ? (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {blueprints.length === 0 && <p className="text-sm text-muted-foreground">No blueprints available (run migration 0007).</p>}
            {blueprints.map((bp) => (
              <button
                key={bp.slug}
                type="button"
                onClick={() => setSlug(bp.slug)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${slug === bp.slug ? "border-primary/50 bg-primary/5" : "hover:bg-muted/40"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-semibold"><Layers className="size-3.5 text-primary" />{bp.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{bp.phases.length} phases</span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{bp.description}</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground/70">{bp.phases.map((p) => p.title).join(" → ")}</p>
              </button>
            ))}
          </div>
        ) : (
          <Textarea
            rows={6}
            value={customTitles}
            onChange={(e) => setCustomTitles(e.target.value)}
            placeholder={"One phase per line:\nProgramming Foundations\nProblem Solving\nBuilding Projects"}
          />
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={generate} disabled={busy || (mode === "blueprint" && !slug)}>{busy ? "Creating…" : "Create Journey"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
