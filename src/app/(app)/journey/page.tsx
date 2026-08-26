import { createClient } from "@/lib/supabase/server"
import { PageTransition } from "@/components/feedback/page-transition"
import { EmptyState } from "@/components/feedback/empty-state"
import { Route } from "lucide-react"
import { JourneyTimeline } from "@/components/journey/journey-timeline"
import { JourneyInit } from "@/components/journey/journey-init"
import { getCompletedPhaseDetails, getJourneyTimeline } from "@/lib/journey/queries"

export const metadata = { title: "Journey — Ascend" }

export default async function JourneyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <PageTransition>
        <div className="text-sm text-muted-foreground">Not authenticated.</div>
      </PageTransition>
    )
  }

  const nodes = await getJourneyTimeline(supabase, user.id).catch(() => [])
  const details = nodes.length > 0 ? await getCompletedPhaseDetails(supabase, user.id, nodes).catch(() => ({}) as Record<string, never>) : {}

  return (
    <PageTransition>
      <div className="space-y-8">
        <header>
          <h1 className="text-sm font-bold uppercase tracking-[0.22em]">Your Journey</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every phase you close becomes a chapter here — real dates, real XP, real changes.
          </p>
        </header>

        {nodes.length === 0 ? (
          <EmptyState
            icon={Route}
            title="No journey yet"
            description="Initialize your six-phase growth arc to begin the timeline."
            action={<JourneyInit />}
          />
        ) : (
          <JourneyTimeline nodes={nodes} details={details} />
        )}
      </div>
    </PageTransition>
  )
}
