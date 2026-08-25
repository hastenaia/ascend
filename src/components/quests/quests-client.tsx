"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, ScrollText, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/feedback/empty-state"
import { LevelCard } from "@/components/level-card"
import { QuestList } from "@/components/quests/quest-list"
import { QuestDetail } from "@/components/quests/quest-detail"
import { QuestFilters, defaultFilters, type QuestFilterState } from "@/components/quests/quest-filters"
import { QuestCompletionAnimation } from "@/components/quests/quest-completion-animation"
import { QuestCreateDialog } from "@/components/quests/quest-create-dialog"
import { completeQuestAction, deleteQuestAction } from "@/lib/quests/actions"
import type { QuestRow } from "@/lib/quests/queries"
import type { LevelProgress as LevelProgressType } from "@/lib/levels"

type Props = {
  activeQuests: QuestRow[]
  completedQuests: QuestRow[]
  level: LevelProgressType & { xpToday: number }
  todaysCount: number
  completedTodayCount: number
  milestones: { id: string; title: string }[]
  skills: { id: string; name: string }[]
}

export function QuestsClient({ activeQuests, completedQuests, level, todaysCount, completedTodayCount, milestones, skills }: Props) {
  const router = useRouter()
  const [filters, setFilters] = React.useState<QuestFilterState>(defaultFilters)
  const [detail, setDetail] = React.useState<QuestRow | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [anim, setAnim] = React.useState<{ visible: boolean; xp: number }>({ visible: false, xp: 0 })

  function matches(q: QuestRow): boolean {
    if (filters.type === "daily" && q.recurrence !== "daily") return false
    if (filters.type === "weekly" && q.recurrence !== "weekly") return false
    if (filters.type === "one-time" && q.recurrence !== "none") return false
    if (filters.difficulty !== "all" && q.difficulty !== filters.difficulty) return false
    if (filters.query && !q.title.toLowerCase().includes(filters.query.toLowerCase())) return false
    return true
  }

  const visible = filters.status === "active" ? activeQuests.filter(matches) : completedQuests.filter(matches)

  async function handleComplete(quest: QuestRow) {
    if (busyId) return
    setBusyId(quest.id)
    try {
      const res = await completeQuestAction(quest.id)
      setDetailOpen(false)
      setAnim({ visible: true, xp: res.xp_awarded ?? quest.xp_reward })
      if (res.already_completed) toast.info("Already completed — no duplicate XP")
      else toast.success(`+${res.xp_awarded} XP earned`)
      if (res.milestone_updated) toast("Milestone completed", { icon: "🎯" })
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not complete quest")
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(quest: QuestRow) {
    if (busyId) return
    setBusyId(quest.id)
    try {
      await deleteQuestAction(quest.id)
      setDetailOpen(false)
      toast("Quest deleted")
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not delete quest")
    } finally {
      setBusyId(null)
    }
  }

  const milestoneTitleFor = (id: string | null) => milestones.find((m) => m.id === id)?.title ?? null

  return (
    <div className="space-y-6">
      <QuestCompletionAnimation visible={anim.visible} xp={anim.xp} onDone={() => setAnim({ visible: false, xp: 0 })} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quests</h1>
          <p className="text-sm text-muted-foreground">
            The actions that earn XP and move your current phase forward.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> New Quest
        </Button>
      </div>

      {/* Summary strip */}
      <div className="grid gap-4 lg:grid-cols-3">
        <LevelCard level={level} />
        <Card className="lg:col-span-2">
          <CardContent className="flex h-full flex-col justify-center gap-4 p-5 sm:flex-row sm:items-center sm:justify-around">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Due today</p>
              <p className="mt-1 text-2xl font-bold">{todaysCount}</p>
            </div>
            <div className="hidden h-10 w-px bg-border sm:block" />
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Completed today</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">{completedTodayCount}</p>
            </div>
            <div className="hidden h-10 w-px bg-border sm:block" />
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">XP today</p>
              <p className="mt-1 inline-flex items-center gap-1 text-2xl font-bold">
                <Zap className="size-5 text-primary" />+{level.xpToday}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <QuestFilters value={filters} onChange={setFilters} />

      {visible.length > 0 ? (
        <QuestList
          quests={visible}
          busyId={busyId}
          onComplete={handleComplete}
          onOpen={(q) => {
            setDetail(q)
            setDetailOpen(true)
          }}
          emptyTitle={filters.status === "active" ? "No active quests match" : "No completed quests match"}
        />
      ) : (
        <EmptyState
          icon={ScrollText}
          title={filters.status === "active" ? "No active quests" : "No completed quests yet"}
          description={
            filters.status === "active"
              ? "Create a quest or clear the filters. Quests linked to milestones advance your current phase."
              : "Complete your first quest and it will appear here as proof of progress."
          }
          action={
            filters.status === "active" ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" /> Create quest
              </Button>
            ) : undefined
          }
        />
      )}

      <QuestDetail
        quest={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onComplete={handleComplete}
        onDelete={handleDelete}
        busy={busyId !== null}
        milestoneTitle={milestoneTitleFor(detail?.milestone_id ?? null)}
        skillName={skills.find((s) => s.id === detail?.linked_skill)?.name ?? null}
      />

      <QuestCreateDialog open={createOpen} onOpenChange={setCreateOpen} milestones={milestones} skills={skills} />
    </div>
  )
}
