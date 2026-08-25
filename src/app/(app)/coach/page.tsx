import { EmptyState } from "@/components/feedback/empty-state"
import { PageTransition } from "@/components/feedback/page-transition"
import { Bot } from "lucide-react"

export const metadata = { title: "AI Coach — Ascend" }

export default function CoachPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Coach</h1>
          <p className="text-sm text-muted-foreground">Personal guidance grounded in your goals, phases, and quests.</p>
        </div>
        <EmptyState
          icon={Bot}
          title="Your AI Coach will become available once your journey begins"
          description="Start a goal and complete a few quests. The coach needs context to give advice that actually fits you."
        />
        <div className="rounded-2xl border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">What the coach will do</p>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            <li>• Reflect on your phase progress and momentum</li>
            <li>• Suggest next quests based on milestones</li>
            <li>• Help you design a Final Challenge</li>
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">No chat history is fabricated — the coach activates after real activity.</p>
        </div>
      </div>
    </PageTransition>
  )
}
