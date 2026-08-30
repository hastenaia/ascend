"use client"
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import * as React from "react"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { NotebookPen, Sparkles, Zap, ArrowRight, CalendarDays, Link2, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { MoodPicker } from "@/components/journal/mood-picker"
import { TagInput } from "@/components/journal/tag-input"
import { saveJournalEntry, createQuestFromJournal } from "@/lib/journal/actions"
import type { Mood } from "@/lib/validations/journal"
import type { JournalEntry } from "@/lib/journal/queries"

const QUESTIONS = [
  { key: "learnings" as const, label: "What did you learn today?", placeholder: "One insight, skill, or surprise…" },
  { key: "worked" as const, label: "What worked?", placeholder: "Habits, timing, people that helped…" },
  { key: "didnt_work" as const, label: "What didn't work?", placeholder: "Friction, distractions — honest only." },
  { key: "change_plan" as const, label: "One thing to change tomorrow?", placeholder: "Tiny, concrete next step…" },
]

type Props = {
  initial?: JournalEntry | null
  todayStr: string
  currentPhaseId?: string | null
  currentPhaseTitle?: string | null
  questOptions?: { id: string; title: string }[]
}

export function JournalEditor({ initial, todayStr, currentPhaseId, questOptions = [] }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const reduced = useReducedMotion()
  const [values, setValues] = React.useState({
    learnings: initial?.learnings ?? "",
    worked: initial?.worked ?? "",
    didnt_work: initial?.didnt_work ?? "",
    change_plan: initial?.change_plan ?? "",
    body: initial?.body ?? "",
  })
  const [mood, setMood] = React.useState<Mood | null>((initial?.mood as Mood | null) ?? null)
  const [questId, setQuestId] = React.useState<string>(initial?.quest_id ?? searchParams.get("quest") ?? "")
  const [tags, setTags] = React.useState<string[]>(initial?.tags ?? [])
  const [busy, setBusy] = React.useState(false)
  const [showFree, setShowFree] = React.useState(!!initial?.body)

  // Sync when initial changes (after save + refresh, history load) — intentionally mirrors server prop to local form
  const initialKey = initial?.id ?? initial?.entry_date ?? ""
  React.useEffect(() => {
    setValues({
      learnings: initial?.learnings ?? "",
      worked: initial?.worked ?? "",
      didnt_work: initial?.didnt_work ?? "",
      change_plan: initial?.change_plan ?? "",
      body: initial?.body ?? "",
    })
    setMood((initial?.mood as Mood | null) ?? null)
    setQuestId(initial?.quest_id ?? searchParams.get("quest") ?? "")
    setTags(initial?.tags ?? [])
    setShowFree(!!initial?.body)
  }, [initialKey, searchParams])

  const hasContent = Object.values(values).some((v) => v.trim().length > 0)

  async function save() {
    if (!hasContent || busy) return
    setBusy(true)
    try {
      const res = await saveJournalEntry({
        entry_date: todayStr,
        learnings: values.learnings || null,
        worked: values.worked || null,
        didnt_work: values.didnt_work || null,
        change_plan: values.change_plan || null,
        body: values.body || null,
        mood,
        // Preserve original phase link on edit; only set current phase for new entries without one
        phase_id: initial?.phase_id ?? currentPhaseId ?? null,
        quest_id: questId || null,
        tags: tags.length ? tags : null,
      } as never)
      if (res.is_new && res.xp_awarded > 0) toast.success(`+${res.xp_awarded} XP · Mental & EQ grew`, { description: "Journal saved — streak +1" })
      else toast.success("Journal saved", { description: res.is_new ? "Updated for today" : "Entry updated" })
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save")
    } finally {
      setBusy(false)
    }
  }

  async function createQuest() {
    const plan = values.change_plan.trim()
    if (!plan) {
      toast.error("Write 'One thing to change tomorrow' first")
      return
    }
    setBusy(true)
    try {
      await createQuestFromJournal(plan)
      toast.success("Quest created from journal", { description: plan.slice(0, 60) })
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create quest")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border bg-card/70 p-5 sheen">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm"><NotebookPen className="size-4" /></span>
          <div>
            <p className="text-sm font-semibold tracking-tight">Daily Journal</p>
            <p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3" /> {todayStr} {initial ? "· editing" : "· today"}</p>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1 rounded-full border bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300"><Zap className="size-3" /> +12 XP · Mental 70% EQ 30%</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[180px]">
          <Label htmlFor="journal-mood" className="text-xs">Mood</Label>
          <div className="mt-1.5"><MoodPicker value={mood} onChange={setMood} /></div>
        </div>
        {questOptions.length > 0 && (
          <div className="min-w-[200px] flex-1">
            <Label htmlFor="journal-quest" className="text-xs flex items-center gap-1"><Link2 className="size-3" /> Link to quest (optional)</Label>
            <select id="journal-quest" value={questId} onChange={(e) => setQuestId(e.target.value)} className="mt-1.5 h-9 w-full rounded-xl border bg-background px-3 text-sm">
              <option value="">None — standalone reflection</option>
              {questOptions.map((q) => (
                <option key={q.id} value={q.id}>{q.title}</option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="mt-3">
        <TagInput value={tags} onChange={setTags} />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {QUESTIONS.map((q, i) => (
          <motion.div key={q.key} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="space-y-1.5">
            <Label className="text-xs font-medium">{q.label}</Label>
            <Textarea rows={3} placeholder={q.placeholder} value={values[q.key]} onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))} className="rounded-xl bg-background/60 text-sm" />
          </motion.div>
        ))}
      </div>

      <div className="mt-3">
        <button type="button" onClick={() => setShowFree((s) => !s)} className="text-xs font-medium text-primary hover:underline">
          {showFree ? "Hide free note" : "+ Add free-form note"}
        </button>
        <AnimatePresence>
          {showFree && (
            <motion.div initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <Textarea rows={3} placeholder="Anything else on your mind… (optional)" value={values.body} onChange={(e) => setValues((v) => ({ ...v, body: e.target.value }))} className="mt-2 rounded-xl bg-background/60 text-sm" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={save} disabled={!hasContent || busy} className="h-10 rounded-xl px-5 font-semibold"><Save className="mr-1 size-4" /> {busy ? "Saving…" : initial ? "Update journal" : "Save journal"}</Button>
        <Button variant="outline" onClick={createQuest} disabled={!values.change_plan.trim() || busy} className="h-10 rounded-xl">
          <Sparkles className="mr-1 size-4" /> Create quest from plan <ArrowRight className="ml-1 size-3" />
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Connected: journaling grows Mental/EQ, counts toward momentum recovery, and feeds your coach. One entry per day — edits update today.</p>
    </div>
  )
}
