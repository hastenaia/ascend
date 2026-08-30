"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { Plus, ScrollText, Zap, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { EmptyState } from "@/components/feedback/empty-state"
import { LevelCard } from "@/components/level-card"
import { QuestList } from "@/components/quests/quest-list"
import { QuestDetail } from "@/components/quests/quest-detail"
import { QuestFilters, defaultFilters, type QuestFilterState } from "@/components/quests/quest-filters"
import { QuestCompletionAnimation } from "@/components/quests/quest-completion-animation"
import { QuestCreateDialog } from "@/components/quests/quest-create-dialog"
import { completeQuestAction, deleteQuestAction, postponeQuestAction, setQuestEvidenceAction, skipQuestAction } from "@/lib/quests/actions"
import { announceUnlockedAchievements } from "@/lib/achievements/events"
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
  currentPhaseId?: string | null
  currentPhaseTitle?: string | null
}

export function QuestsClient({ activeQuests, completedQuests, level, todaysCount, completedTodayCount, milestones, skills, currentPhaseId, currentPhaseTitle }: Props) {
  const router = useRouter()
  const reduced = useReducedMotion()
  const [filters, setFilters] = React.useState<QuestFilterState>(defaultFilters)
  const [detail, setDetail] = React.useState<QuestRow | null>(null)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [isPending, startTransition] = React.useTransition()
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
      announceUnlockedAchievements(res.unlocked_achievements)
      if (res.already_completed) toast.info("Already completed — no duplicate XP")
      else toast.success(`+${res.xp_awarded} XP earned`, { description: res.milestone_updated ? "Milestone completed 🎯" : undefined })
      if (res.milestone_updated) toast("Milestone completed", { icon: "🎯" })
      startTransition(() => router.refresh())
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
      toast.success("Quest deleted", { description: "Active quest removed" })
      startTransition(() => router.refresh())
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not delete quest")
    } finally {
      setBusyId(null)
    }
  }

  async function handlePostpone(quest: QuestRow) {
    if (busyId) return
    setBusyId(quest.id)
    try {
      const res = await postponeQuestAction(quest.id, 1)
      setDetail((d) => (d?.id === quest.id ? { ...d, postponed_count: res.postponed_count, last_postponed_at: new Date().toISOString() } : d))
      toast.success("Postponed by a day")
      startTransition(() => router.refresh())
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not postpone quest")
    } finally {
      setBusyId(null)
    }
  }

  async function handleSkip(quest: QuestRow) {
    if (busyId) return
    setBusyId(quest.id)
    try {
      const res = await skipQuestAction(quest.id)
      setDetail((d) => (d?.id === quest.id ? { ...d, skipped_count: res.skipped_count, last_skipped_at: new Date().toISOString() } : d))
      toast.success("Quest skipped — recorded honestly, no XP awarded")
      startTransition(() => router.refresh())
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not skip quest")
    } finally {
      setBusyId(null)
    }
  }

  async function handleSaveEvidence(quest: QuestRow, evidence: string) {
    if (busyId) return
    setBusyId(quest.id)
    try {
      await setQuestEvidenceAction(quest.id, evidence)
      setDetail((d) => (d?.id === quest.id ? { ...d, evidence: evidence.trim() === "" ? null : evidence.trim() } : d))
      toast.success(evidence.trim() ? "Evidence saved" : "Evidence cleared")
      startTransition(() => router.refresh())
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save evidence")
    } finally {
      setBusyId(null)
    }
  }

  const milestoneTitleFor = (id: string | null) => milestones.find((m) => m.id === id)?.title ?? null

  return (
    <div className="space-y-6">
      <QuestCompletionAnimation visible={anim.visible} xp={anim.xp} onDone={() => setAnim({ visible: false, xp: 0 })} />

      <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quests</h1>
          <p className="text-sm text-muted-foreground">
            The actions that earn XP and move your current phase forward.
            {currentPhaseTitle && <span className="ml-1 hidden font-medium text-foreground/70 sm:inline">· {currentPhaseTitle}</span>}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="group h-10 rounded-xl px-4 font-semibold shadow-sm transition-all active:scale-[0.98]">
          <Plus className="size-4 transition-transform group-hover:rotate-90" /> New Quest
        </Button>
      </motion.div>

      {/* Summary strip — smooth entrance, staggered */}
      <motion.div initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: 0.08 }} className="grid gap-4 lg:grid-cols-3">
        <LevelCard level={level} />
        <Card className="overflow-hidden lg:col-span-2">
          <CardContent className="flex h-full flex-col justify-center gap-4 p-5 sm:flex-row sm:items-center sm:justify-around">
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Due today</p>
              <motion.p key={todaysCount} initial={reduced ? false : { scale: 0.9 }} animate={{ scale: 1 }} className="mt-1 text-2xl font-bold tabular-nums">
                {todaysCount}
              </motion.p>
            </div>
            <div className="hidden h-10 w-px bg-border sm:block" />
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Completed today</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{completedTodayCount}</p>
            </div>
            <div className="hidden h-10 w-px bg-border sm:block" />
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">XP today</p>
              <p className="mt-1 inline-flex items-center gap-1 text-2xl font-bold tabular-nums">
                <Zap className="size-5 text-primary" />+{level.xpToday}
              </p>
            </div>
          </CardContent>
          {/* subtle pending shimmer when refreshing */}
          <AnimatePresence>
            {isPending && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-1 w-full bg-gradient-to-r from-primary/0 via-primary/40 to-primary/0" style={{ animation: "shimmer 1.2s infinite" }} />
            )}
          </AnimatePresence>
        </Card>
      </motion.div>

      <QuestFilters value={filters} onChange={setFilters} />

      {/* Pending shimmer — non-blocking, list stays visible for smoothness */}
      <AnimatePresence>
        {isPending && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Syncing…
          </motion.div>
        )}
      </AnimatePresence>

      {/* List with smooth presence — never hidden by isPending */}
      <AnimatePresence mode="wait">
        {visible.length > 0 ? (
          <motion.div key="list" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduced ? undefined : { opacity: 0 }} transition={{ duration: 0.22 }}>
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
          </motion.div>
        ) : (
          <motion.div key="empty" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? undefined : { opacity: 0 }}>
            <EmptyState
              icon={ScrollText}
              title={filters.status === "active" ? "No active quests" : "No completed quests yet"}
              description={
                filters.status === "active"
                  ? currentPhaseId
                    ? "Create a quest or clear the filters. Quests linked to milestones advance your current phase — and on completion your character stats & skills grow automatically."
                    : "Standalone quests work immediately — they'll appear here and count toward your character once completed. Start a Journey to link quests to a phase for milestone progress."
                  : "Complete your first quest and it will appear here as proof of progress."
              }
              action={
                filters.status === "active" ? (
                  <Button onClick={() => setCreateOpen(true)} className="rounded-xl">
                    <Plus className="size-4" /> Create quest
                  </Button>
                ) : undefined
              }
            />
            {filters.status === "active" && visible.length === 0 && activeQuests.length > 0 && (
              <p className="mt-3 text-center text-xs text-muted-foreground">
                <Sparkles className="mr-1 inline size-3 text-violet-500" /> {activeQuests.length} quest(s) hidden by filters — try “all types” or clear search
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <QuestDetail
        quest={detail}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onComplete={handleComplete}
        onDelete={handleDelete}
        onPostpone={handlePostpone}
        onSkip={handleSkip}
        onSaveEvidence={handleSaveEvidence}
        busy={busyId !== null}
        milestoneTitle={milestoneTitleFor(detail?.milestone_id ?? null)}
        skillName={skills.find((s) => s.id === detail?.linked_skill)?.name ?? null}
      />

      <QuestCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        milestones={milestones}
        skills={skills}
        currentPhaseId={currentPhaseId ?? null}
        currentPhaseTitle={currentPhaseTitle ?? null}
      />
    </div>
  )
}
