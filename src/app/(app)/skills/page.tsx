import { EmptyState } from "@/components/feedback/empty-state"
import { PageTransition } from "@/components/feedback/page-transition"
import { Sparkles } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

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
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { name: "Focus", lvl: "—" },
            { name: "Discipline", lvl: "—" },
            { name: "Creativity", lvl: "—" },
          ].map((s) => (
            <Card key={s.name} className="opacity-60">
              <CardContent className="p-5">
                <p className="text-sm font-semibold">{s.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">Level {s.lvl} · Complete quests to unlock</p>
                <div className="mt-3 h-1.5 rounded-full bg-secondary" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PageTransition>
  )
}
