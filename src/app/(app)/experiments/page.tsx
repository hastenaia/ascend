import { createClient } from "@/lib/supabase/server"
import { EmptyState } from "@/components/feedback/empty-state"
import { PageTransition } from "@/components/feedback/page-transition"
import { FlaskConical, Swords } from "lucide-react"
import { getExperiments } from "@/lib/experiments/queries"
import { getBosses } from "@/lib/bosses/queries"
import { ExperimentsClient } from "@/components/experiments/experiments-client"
import { ExperimentCreateDialog } from "@/components/experiments/experiment-create-dialog"
import { BossesClient } from "@/components/bosses/bosses-client"
import { BossCreateDialog } from "@/components/bosses/boss-create-dialog"

export const metadata = { title: "Experiments — Ascend" }
export const dynamic = "force-dynamic"

export default async function ExperimentsPage() {
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

  const [experiments, bosses] = await Promise.all([
    getExperiments(supabase, user.id).catch(() => []),
    getBosses(supabase, user.id).catch(() => []),
  ])

  return (
    <PageTransition>
      <div className="space-y-10">
        {/* LIFE EXPERIMENTS */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-sm font-bold uppercase tracking-[0.22em]">Life Experiments</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Test routines for a fixed window and see the real numbers.
              </p>
            </div>
            <ExperimentCreateDialog />
          </div>

          {experiments.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title="No experiments running"
              description='Try something like "Read for 20 minutes before bed" for 14 days. Log mood, energy, and productivity daily — results stay honest to your data.'
            />
          ) : (
            <ExperimentsClient experiments={experiments} />
          )}
        </section>

        {/* BOSS CHALLENGES */}
        <section className="space-y-4 border-t pt-8">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.22em]">
                <Swords className="size-4 text-destructive" /> Boss Challenges
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Optional, playful obstacles you defeat with steady moves — never pressure.
              </p>
            </div>
            <BossCreateDialog />
          </div>

          {bosses.length === 0 ? (
            <EmptyState
              icon={Swords}
              title="No active challenges"
              description="Pick one persistent obstacle and give it HP. Every focus session and finished task takes a bite out of it."
            />
          ) : (
            <BossesClient bosses={bosses} />
          )}
        </section>
      </div>
    </PageTransition>
  )
}
