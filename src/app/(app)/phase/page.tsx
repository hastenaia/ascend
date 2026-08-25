/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@/lib/supabase/server"
import { PageTransition } from "@/components/feedback/page-transition"
import { PhasePageClient } from "@/components/phases/phase-page-client"
import { getCurrentPhase, getJourney } from "@/lib/phases/queries"

export const metadata = { title: "Current Phase — Ascend" }

export default async function PhasePage() {
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

  // Fetch current phase with progress
  let current = null
  try {
    current = await getCurrentPhase(supabase, user.id)
  } catch {}

  const fullJourney = await getJourney(supabase, user.id).catch(() => ({ templates: [], phases: [], hasJourney: false } as any))
  const hasJourney = fullJourney.hasJourney
  const timeline = fullJourney.phases.map((p: any) => ({ id: p.id, title: p.title, order_index: p.order_index, status: p.status, subtitle: (p as any).subtitle ?? null }))
  // If no user phases yet, show templates as preview timeline (locked) for empty state context
  const displayTimeline = hasJourney ? timeline : fullJourney.templates.map((t: any) => ({ id: t.id, title: t.title, order_index: t.order_index, status: "locked" as const, subtitle: t.subtitle }))

  const currentIdx = hasJourney ? fullJourney.phases.findIndex((p: any) => p.id === current?.id) : -1
  const nextPhase = currentIdx >= 0 ? fullJourney.phases[currentIdx + 1] : null

  return (
    <PageTransition>
      <PhasePageClient
        hasJourney={hasJourney}
        current={current}
        timeline={displayTimeline}
        nextPhaseTitle={nextPhase?.title ?? null}
        nextPhaseId={nextPhase?.id ?? null}
      />
    </PageTransition>
  )
}
