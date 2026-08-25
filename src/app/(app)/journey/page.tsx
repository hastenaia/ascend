/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from "@/lib/supabase/server"
import { PageTransition } from "@/components/feedback/page-transition"
import { JourneyClient } from "@/components/phases/journey-client"
import { getJourney } from "@/lib/phases/queries"

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

  const journey = await getJourney(supabase, user.id).catch(() => ({ templates: [], phases: [], hasJourney: false } as any))

  const items = journey.phases.map((p: any) => ({
    id: p.id,
    title: p.title,
    order_index: p.order_index,
    status: p.status,
    subtitle: p.subtitle ?? null,
    objective: p.objective ?? null,
    progress: p.progress,
    done: p.completed,
    total: p.total,
    focusAreas: Array.isArray(p.focus_areas) ? (p.focus_areas as string[]) : [],
  }))

  const templates = journey.templates.map((t: any) => ({
    id: t.id,
    title: t.title,
    order_index: t.order_index,
    status: "locked" as const,
    subtitle: t.subtitle,
  }))

  return (
    <PageTransition>
      <JourneyClient hasJourney={journey.hasJourney} items={items} templates={templates} />
    </PageTransition>
  )
}
