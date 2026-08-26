import { EmptyState } from "@/components/feedback/empty-state"
import { PageTransition } from "@/components/feedback/page-transition"
import { Sparkles } from "lucide-react"

export const metadata = { title: "Skills — Ascend" }

export default function SkillsPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Skills</h1>
          <p className="text-sm text-muted-foreground">Skills grow as you complete quests and earn XP — quiet RPG progression, not a game.</p>
        </div>
        <EmptyState
          icon={Sparkles}
          title="Your skill tree will grow as you complete quests"
          description="Every quest grants XP. XP levels skills, skills raise stats. Progress is calm, cumulative, and personal."
        />
        <div className="sheen rounded-2xl border bg-card p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Coming in a later progression phase</p>
          <ul className="mt-3 space-y-3">
            {["Focus", "Discipline", "Creativity"].map((s) => (
              <li key={s} className="flex items-center justify-between text-sm">
                <span className="font-medium">{s}</span>
                <span className="text-xs text-muted-foreground">Unlocks with quest activity</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PageTransition>
  )
}

