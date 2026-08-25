import { EmptyState } from "@/components/feedback/empty-state"
import { PageTransition } from "@/components/feedback/page-transition"
import { Flag } from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata = { title: "Goals — Ascend" }

export default function GoalsPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Goals</h1>
          <p className="text-sm text-muted-foreground">Goals are the north star. Each goal spawns phases — one phase at a time.</p>
        </div>
        <EmptyState
          icon={Flag}
          title="No goals yet"
          description="Set a meaningful goal to orient your phases. A goal is larger than a phase; phases are how you get there."
          action={<Button>Set your first goal</Button>}
        />
      </div>
    </PageTransition>
  )
}
