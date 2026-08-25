import { EmptyState } from "@/components/feedback/empty-state"
import { PageTransition } from "@/components/feedback/page-transition"
import { Route } from "lucide-react"

export const metadata = { title: "Journey — Ascend" }

export default function JourneyPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Journey</h1>
          <p className="text-sm text-muted-foreground">Your full progression arc across every phase — past, present, and next.</p>
        </div>
        <EmptyState
          icon={Route}
          title="Your journey hasn't started"
          description="Complete phases to build a living timeline of who you are becoming. Each phase adds a chapter to your journey."
        />
        <div className="flex items-center gap-2 overflow-x-auto py-2 text-xs">
          {["Goal","Phase 1","Milestones","Quests","Phase Complete","Phase 2 →"].map((label, i) => (
            <span key={label} className="flex items-center gap-2">
              <span className="rounded-full border bg-card px-3 py-1.5 whitespace-nowrap">{label}</span>
              {i < 5 ? <span className="text-muted-foreground">→</span> : null}
            </span>
          ))}
        </div>
      </div>
    </PageTransition>
  )
}
