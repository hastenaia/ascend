import { EmptyState } from "@/components/feedback/empty-state"
import { PageTransition } from "@/components/feedback/page-transition"
import { ScrollText } from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata = { title: "Quests — Ascend" }

export default function QuestsPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quests</h1>
          <p className="text-sm text-muted-foreground">Quests are the daily actions that earn XP and move your phase forward.</p>
        </div>
        <EmptyState
          icon={ScrollText}
          title="No active quests"
          description="Create your first quest to start earning XP. Quests belong to milestones, which belong to your current phase."
          action={<Button>New quest</Button>}
        />
        <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-xs text-muted-foreground">
          Architecture: Goal → Phase → Milestones → <strong>Quests</strong> → XP → Skills → Stats → Final Challenge
        </div>
      </div>
    </PageTransition>
  )
}
