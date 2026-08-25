"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, ScrollText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/feedback/empty-state"
import { QuestCompletionAnimation } from "@/components/quests/quest-completion-animation"
import { completeQuestAction } from "@/lib/quests/actions"
import type { QuestRow } from "@/lib/quests/queries"

export function DashboardQuests({ quests }: { quests: QuestRow[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [anim, setAnim] = React.useState<{ visible: boolean; xp: number }>({ visible: false, xp: 0 })

  async function handleComplete(quest: QuestRow) {
    if (busyId) return
    setBusyId(quest.id)
    try {
      const res = await completeQuestAction(quest.id)
      setAnim({ visible: true, xp: res.xp_awarded ?? quest.xp_reward })
      toast.success(`+${res.xp_awarded} XP earned`)
      if (res.milestone_updated) toast("Milestone completed", { icon: "🎯" })
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not complete quest")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <QuestCompletionAnimation visible={anim.visible} xp={anim.xp} onDone={() => setAnim({ visible: false, xp: 0 })} />
      {quests.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="Nothing due right now"
          description="Create quests on the Quests page — daily actions, milestone work, and challenges all grant XP."
          className="border-0 bg-muted/30 shadow-none"
        />
      ) : (
        <div className="space-y-2">
          {quests.slice(0, 6).map((q) => {
            const busy = busyId === q.id
            return (
              <div key={q.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{q.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="capitalize">{q.category}</span> · <span className="capitalize">{q.difficulty}</span>
                    {q.estimated_duration ? ` · ${q.estimated_duration}m` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-primary">+{q.xp_reward}</span>
                  <Button size="icon" variant="outline" className="size-8 rounded-full" disabled={busy} onClick={() => handleComplete(q)} aria-label={`Complete ${q.title}`}>
                    {busy ? <span className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" /> : <Check className="size-3.5" />}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
