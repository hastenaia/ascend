import { EmptyState } from "@/components/feedback/empty-state"
import { PageTransition } from "@/components/feedback/page-transition"
import { FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"

export const metadata = { title: "Experiments — Ascend" }

export default function ExperimentsPage() {
  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Experiments</h1>
          <p className="text-sm text-muted-foreground">Small trials to test what works — run them without risking your main phase.</p>
        </div>
        <EmptyState
          icon={FlaskConical}
          title="No experiments running"
          description="Try a 7-day experiment to discover habits that stick. Promote what works into a quest."
          action={<Button variant="outline">Start an experiment</Button>}
        />
      </div>
    </PageTransition>
  )
}
