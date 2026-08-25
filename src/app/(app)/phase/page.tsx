import { EmptyState } from "@/components/feedback/empty-state"
import { PageTransition } from "@/components/feedback/page-transition"
import { Target } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export const metadata = { title: "Current Phase — Ascend" }

export default function PhasePage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Current Phase</h1>
          <p className="text-sm text-muted-foreground">A phase is a focused chapter of growth with milestones, quests, and a final challenge.</p>
        </div>
        <Card className="overflow-hidden">
          <div className="h-1.5 w-full ascend-gradient-strong" />
          <CardContent className="p-6">
            <EmptyState
              icon={Target}
              title="No active phase yet"
              description="Choose a goal to begin your first phase. Each phase has milestones, quests, and a Final Challenge to complete."
              action={<Button>Choose a goal to begin your first phase</Button>}
              className="border-0 shadow-none"
            />
          </CardContent>
        </Card>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { k: "Milestones", v: "Break a phase into steps" },
            { k: "Quests", v: "Daily actions → XP" },
            { k: "Final Challenge", v: "Prove the phase is complete" },
          ].map((s) => (
            <div key={s.k} className="rounded-2xl border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{s.k}</p>
              <p className="mt-1 text-sm">{s.v}</p>
            </div>
          ))}
        </div>
      </div>
    </PageTransition>
  )
}
