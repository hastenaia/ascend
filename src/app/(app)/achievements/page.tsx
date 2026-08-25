import { EmptyState } from "@/components/feedback/empty-state"
import { PageTransition } from "@/components/feedback/page-transition"
import { Trophy } from "lucide-react"

export const metadata = { title: "Achievements — Ascend" }

export default function AchievementsPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Achievements</h1>
          <p className="text-sm text-muted-foreground">Milestones and moments worth remembering — earned, not given.</p>
        </div>
        <EmptyState
          icon={Trophy}
          title="Your first achievement is waiting"
          description="Complete your first quest or milestone to unlock an achievement. They mark real progress, not check-ins."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { t: "First Quest", d: "Complete any quest" },
            { t: "Milestone Reached", d: "Finish a milestone" },
            { t: "Phase Complete", d: "Conquer a Final Challenge" },
          ].map((a) => (
            <div key={a.t} className="rounded-2xl border border-dashed bg-muted/20 p-4 opacity-70">
              <p className="text-sm font-semibold">{a.t}</p>
              <p className="text-xs text-muted-foreground">{a.d}</p>
            </div>
          ))}
        </div>
      </div>
    </PageTransition>
  )
}
