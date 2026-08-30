import { createClient } from "@/lib/supabase/server"
import { PageTransition } from "@/components/feedback/page-transition"
import { getCurrentPhase } from "@/lib/phases/queries"
import { getActiveQuests } from "@/lib/quests/queries"
import { getTodaysJournal, getJournalHistory, getJournalStreak, getJournalWithMeta, todayDateString } from "@/lib/journal/queries"
import { JournalEditor } from "@/components/journal/journal-editor"
import { JournalHistory } from "@/components/journal/journal-history"
import { JournalStreak } from "@/components/journal/journal-streak"

export const metadata = { title: "Journal — Ascend" }
export const dynamic = "force-dynamic"

export default async function JournalPage() {
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

  const [current, todays, history, streak] = await Promise.all([
    getCurrentPhase(supabase, user.id).catch(() => null),
    getTodaysJournal(supabase, user.id).catch(() => null),
    getJournalHistory(supabase, user.id, 30).catch(() => []),
    getJournalStreak(supabase, user.id).catch(() => ({ streak: 0, count: 0 })),
  ])

  const enriched = await getJournalWithMeta(supabase, user.id, history).catch(() => history)
  const quests = await getActiveQuests(supabase, user.id).catch(() => [])
  const questOptions = quests.slice(0, 20).map((q) => ({ id: q.id, title: q.title }))

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Journal</h1>
          <p className="mt-1 text-sm text-muted-foreground">2-minute daily reflection — grows Mental & EQ, counts toward momentum, and can spin up tomorrow’s quest.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <JournalEditor
              initial={todays}
              todayStr={todayDateString()}
              currentPhaseId={current?.id ?? null}
              currentPhaseTitle={current ? current.title : null}
              questOptions={questOptions}
            />
          </div>
          <div className="space-y-4">
            <JournalStreak streak={streak.streak} count={streak.count} />
            <div className="rounded-xl border bg-muted/20 p-3 text-xs leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground">How it’s connected</p>
              <ul className="mt-1 list-disc pl-4 space-y-1">
                <li><b>Quests:</b> link an entry to a quest or make next day’s quest from “Will change”.</li>
                <li><b>Character:</b> each entry grants +12 XP → Mental 70% / EQ 30%.</li>
                <li><b>Momentum:</b> journaling logs a recovery day (reflection).</li>
                <li><b>Coach:</b> future coach will read last 7 entries for guidance.</li>
              </ul>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold tracking-tight">History</h2>
          <p className="text-xs text-muted-foreground">Your past reflections — connected to phase & quest when you linked them.</p>
          <div className="mt-3">
            <JournalHistory entries={enriched} />
          </div>
        </div>
      </div>
    </PageTransition>
  )
}
