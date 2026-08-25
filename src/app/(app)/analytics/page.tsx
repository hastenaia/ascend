import { EmptyState } from "@/components/feedback/empty-state"
import { PageTransition } from "@/components/feedback/page-transition"
import { BarChart3 } from "lucide-react"

export const metadata = { title: "Analytics — Ascend" }

export default function AnalyticsPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">Understand momentum, consistency, and where your time actually goes.</p>
        </div>
        <EmptyState
          icon={BarChart3}
          title="No data to analyze yet"
          description="Complete quests and phases to see trends, streaks, and skill growth over time. No fake charts here."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {["Momentum","Consistency","XP Velocity"].map((k) => (
            <div key={k} className="rounded-2xl border bg-card p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{k}</p>
              <p className="mt-2 text-2xl font-bold tracking-tight">—</p>
              <p className="text-xs text-muted-foreground">Awaiting activity</p>
            </div>
          ))}
        </div>
      </div>
    </PageTransition>
  )
}
