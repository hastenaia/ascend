import { PageTransition } from "@/components/feedback/page-transition"
import { EmptyState } from "@/components/feedback/empty-state"
import { Activity } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { getStatsOverview, getStatHistory, type StatHistoryEntry } from "@/lib/stats/queries"
import { STAT_SLUGS } from "@/lib/stats"
import { StatsClient } from "@/components/stats/stats-client"
import { getJournalStreak } from "@/lib/journal/queries"
import { NotebookPen } from "lucide-react"

export const metadata = { title: "Character — Ascend" }
export const dynamic = "force-dynamic"

export default async function StatsPage() {
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

  let stats: Awaited<ReturnType<typeof getStatsOverview>> = []
  try {
    stats = await getStatsOverview(supabase)
  } catch {}

  const historyBySlug: Record<string, StatHistoryEntry[]> = {}
  await Promise.all(
    STAT_SLUGS.map(async (slug) => {
      try {
        historyBySlug[slug] = await getStatHistory(supabase, slug)
      } catch {
        historyBySlug[slug] = []
      }
    })
  )

  let journalStreak = { streak: 0, count: 0 }
  try {
    journalStreak = await getJournalStreak(supabase, user.id)
  } catch {}

  const hasActivity = stats.some((s) => s.points > 0)

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Character</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Eight game-style attributes grown by the quests you actually complete.
          </p>
        </div>

        {!hasActivity && (
          <EmptyState
            icon={Activity}
            title="Your character is waiting for its first quest"
            description="Complete quests to grow Physical, Intellect, Discipline and more. Every point comes from real completed work."
            action={
              <Button asChild>
                <Link href="/quests">Open Quests</Link>
              </Button>
            }
          />
        )}

        <StatsClient stats={stats} historyBySlug={historyBySlug} />

        {journalStreak.count > 0 && (
          <div className="rounded-xl border bg-muted/20 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium"><NotebookPen className="size-4 text-primary" /> Journal fuels your Mental & EQ</p>
            <p className="mt-1 text-xs text-muted-foreground">{journalStreak.count} journal entries · {journalStreak.streak}-day streak. Each daily entry grants +12 XP (Mental 70% / EQ 30%) and recovery credit.</p>
            <Button asChild variant="outline" size="sm" className="mt-3"><Link href="/journal">Open Journal</Link></Button>
          </div>
        )}
      </div>
    </PageTransition>
  )
}
