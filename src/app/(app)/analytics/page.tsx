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
        <div className="sheen rounded-2xl border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Signals we will track</p>
          <ul className="mt-3 space-y-3">
            {["Momentum", "Consistency", "XP Velocity"].map((k) => (
              <li key={k} className="flex items-center justify-between border-b border-border/60 pb-2.5 last:border-0 last:pb-0 text-sm">
                <span className="font-medium">{k}</span>
                <span className="stat-num text-xs font-semibold text-muted-foreground">—</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PageTransition>
  )
}
