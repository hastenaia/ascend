"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Plus, Sparkles, Zap, Loader2 } from "lucide-react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { createQuestAction } from "@/lib/quests/actions"
import { createQuestSchema, XP_BANDS, QUEST_CATEGORIES, QUEST_DIFFICULTIES, RECURRENCES, type CreateQuestInput, type QuestDifficultyValue } from "@/lib/validations/quest"
import { statsForCategory, STAT_META, type StatSlug } from "@/lib/stats"

type FormValues = {
  title: string
  description?: string | null
  category: CreateQuestInput["category"]
  difficulty: CreateQuestInput["difficulty"]
  xp_reward: number
  estimated_duration?: number | null
  due_date?: string | null
  recurrence: CreateQuestInput["recurrence"]
  milestone_id?: string | null
  linked_skill?: string | null
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  milestones: { id: string; title: string }[]
  skills: { id: string; name: string }[]
  currentPhaseId?: string | null
  currentPhaseTitle?: string | null
}

const inputCls = "h-9 w-full rounded-xl border bg-background px-3 text-sm transition-all focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:border-primary/40"
const selectCls = "h-9 w-full rounded-xl border bg-background px-3 text-sm capitalize transition-all focus-visible:ring-2 focus-visible:ring-primary/30"

export function QuestCreateDialog({ open, onOpenChange, milestones, skills, currentPhaseId, currentPhaseTitle }: Props) {
  const router = useRouter()
  const reduced = useReducedMotion()
  const [busy, setBusy] = React.useState(false)
  const [, startTransition] = React.useTransition()

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    watch,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    resolver: zodResolver(createQuestSchema) as unknown as Resolver<FormValues>,
    mode: "onChange",
    defaultValues: { title: "", description: "", category: "general", difficulty: "medium", xp_reward: XP_BANDS.medium.default, recurrence: "none" },
  })

  const [difficulty, setDifficulty] = React.useState<QuestDifficultyValue>("medium")
  const band = XP_BANDS[difficulty] ?? XP_BANDS.medium
  const category = watch("category") as CreateQuestInput["category"]
  const statPreview = React.useMemo(() => statsForCategory(category), [category])

  // Reset form when dialog closes for a fresh open animation
  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        reset({ title: "", description: "", category: "general", difficulty: "medium", xp_reward: XP_BANDS.medium.default, recurrence: "none", milestone_id: null, linked_skill: null })
        setDifficulty("medium")
      }, 180)
      return () => clearTimeout(t)
    }
  }, [open, reset])

  // Keep difficulty state synced with form value (handles programmatic resets)
  React.useEffect(() => {
    const sub = watch((v) => {
      if (v.difficulty && v.difficulty !== difficulty) setDifficulty(v.difficulty as QuestDifficultyValue)
    })
    return () => sub.unsubscribe()
  }, [watch, difficulty])

  function handleDifficultyChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const d = e.target.value as QuestDifficultyValue
    setDifficulty(d)
    const b = XP_BANDS[d]
    const cur = Number(getValues("xp_reward") ?? 0)
    if (cur < b.min || cur > b.max) setValue("xp_reward", b.default, { shouldValidate: true })
  }

  async function onSubmit(values: FormValues) {
    if (busy) return
    setBusy(true)
    try {
      // Client-side phase resolution: milestone takes precedence, otherwise use current phase
      // Server also has fallback, but sending explicit phase_id makes intent clear and snappy
      const payload: CreateQuestInput = {
        ...values,
        phase_id: values.milestone_id ? null : (currentPhaseId ?? null),
        milestone_id: values.milestone_id || null,
        linked_skill: values.linked_skill || null,
        description: values.description || null,
        due_date: values.due_date || null,
        estimated_duration: values.estimated_duration ?? null,
      }

      await createQuestAction(payload as CreateQuestInput & { xp_reward: number })

      // Success: smooth close + toast + soft refresh
      toast.success("Quest created", {
        description: currentPhaseTitle ? `Added to ${currentPhaseTitle}` : statPreview.length ? `Grows ${statPreview.map((s) => STAT_META[s.stat as StatSlug]?.label ?? s.stat).join(" + ")} on completion` : undefined,
      })
      reset()
      onOpenChange(false)
      startTransition(() => router.refresh())
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not create quest"
      // Friendly mapping for constraint/start-journey errors
      toast.error(msg.includes("Start your journey") ? "No phase yet" : "Could not create quest", {
        description: msg,
      })
    } finally {
      setBusy(false)
    }
  }

  const hasNoParent = !currentPhaseId && milestones.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-[520px] overflow-y-auto border border-border/60 bg-card/95 p-0 shadow-2xl backdrop-blur-xl">
        <div className="sticky top-0 z-10 border-b bg-gradient-to-b from-background to-background/80 px-6 pb-4 pt-6 backdrop-blur">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
              <span className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Plus className="size-4" />
              </span>
              New Quest
              <span className="ml-auto hidden items-center gap-1 rounded-full border bg-muted/50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground sm:inline-flex">
                <Zap className="size-3 text-amber-500" /> {band.min}–{band.max} XP
              </span>
            </DialogTitle>
            <DialogDescription className="pt-1 text-[13px] leading-relaxed">
              Small actions, real XP.{" "}
              {currentPhaseTitle ? (
                <span className="font-medium text-foreground/80">Attaching to {currentPhaseTitle}.</span>
              ) : (
                "Link to a milestone to move your phase forward."
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 px-6 pb-6 pt-4">
          {/* Title */}
          <div className="space-y-1.5">
            <Label htmlFor="q-title" className="text-xs font-medium">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="q-title"
              autoFocus
              placeholder="Study programming for 30 minutes"
              className="h-10 rounded-xl border-input bg-background/60 text-[14px] transition-all focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/40"
              {...register("title")}
            />
            {errors.title ? (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-destructive">
                {errors.title.message}
              </motion.p>
            ) : (
              <p className="text-[11px] text-muted-foreground">Keep it concrete — you’ll see this on your dashboard.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-desc" className="text-xs font-medium">
              Description
            </Label>
            <Textarea id="q-desc" rows={2} placeholder="Optional details…" className="rounded-xl bg-background/60 text-sm" {...register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-cat" className="text-xs font-medium">
                Category
              </Label>
              <select id="q-cat" className={selectCls} {...register("category")}>
                {QUEST_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
              {/* Character link preview — smooth height animation */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={category}
                  initial={reduced ? false : { opacity: 0, y: 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduced ? undefined : { opacity: 0, y: -2 }}
                  transition={{ duration: 0.18 }}
                  className="flex flex-wrap gap-1 pt-1"
                >
                  {statPreview.map((s) => {
                    const meta = STAT_META[s.stat as StatSlug]
                    if (!meta) return null
                    const Icon = meta.icon
                    return (
                      <span key={s.stat} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground" title={meta.blurb}>
                        <Icon className="size-3 text-primary/70" /> {meta.label} · {s.pct}%
                      </span>
                    )
                  })}
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-diff" className="text-xs font-medium">
                Difficulty
              </Label>
              <select id="q-diff" className={selectCls} {...register("difficulty", { onChange: handleDifficultyChange })}>
                {QUEST_DIFFICULTIES.map((d) => (
                  <option key={d} value={d} className="capitalize">
                    {d}
                  </option>
                ))}
              </select>
              <p className="pt-1 text-[11px] text-muted-foreground capitalize">
                {difficulty} · {band.min}–{band.max} XP
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-xp" className="text-xs font-medium">
                XP reward
              </Label>
              <Input id="q-xp" type="number" min={band.min} max={band.max} className={inputCls} {...register("xp_reward", { valueAsNumber: true })} />
              <p className="text-[11px] text-muted-foreground">{difficulty}: {band.min}–{band.max} XP · clamped server-side</p>
              {errors.xp_reward && <p className="text-xs text-destructive">{errors.xp_reward.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-dur" className="text-xs font-medium">
                Duration (min)
              </Label>
              <Input id="q-dur" type="number" min={5} max={480} placeholder="30" className={inputCls} {...register("estimated_duration", { valueAsNumber: true })} />
              <p className="text-[11px] text-muted-foreground">Optional · helps planning</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-rec" className="text-xs font-medium">
                Repeats
              </Label>
              <select id="q-rec" className={selectCls} {...register("recurrence")}>
                {RECURRENCES.map((r) => (
                  <option key={r} value={r} className="capitalize">
                    {r === "none" ? "one-time" : r}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-due" className="text-xs font-medium">
                Due date
              </Label>
              <Input id="q-due" type="date" className={inputCls} {...register("due_date")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-ms" className="text-xs font-medium">
              Link to milestone
            </Label>
            <select id="q-ms" className={inputCls} {...register("milestone_id")}>
              <option value="">None — attach to current phase</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              {milestones.length ? "Linked quests auto-complete milestones" : currentPhaseTitle ? `Will attach to ${currentPhaseTitle}` : "Quests without a milestone attach to your active phase"}
            </p>
          </div>

          <AnimatePresence>
            {skills.length > 0 && (
              <motion.div
                initial={reduced ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduced ? undefined : { opacity: 0, height: 0 }}
                className="space-y-1.5 overflow-hidden"
              >
                <Label htmlFor="q-skill" className="flex items-center gap-1.5 text-xs font-medium">
                  Linked skill <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">+50% to parent</span>
                </Label>
                <select id="q-skill" className={inputCls} {...register("linked_skill")}>
                  <option value="">None</option>
                  {skills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Sparkles className="size-3 text-violet-500" /> On completion, XP flows to your character’s skills too.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {hasNoParent && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
              You don’t have an active phase yet. Create one from your Journey to start earning XP.
            </div>
          )}

          <Button
            type="submit"
            className="group w-full h-11 rounded-xl text-sm font-semibold shadow-sm transition-all active:scale-[0.98] disabled:opacity-60"
            disabled={busy || (!isValid && Object.keys(errors).length > 0)}
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Creating quest…
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <Plus className="size-4 transition-transform group-hover:rotate-90 group-hover:scale-110" /> Create Quest
              </span>
            )}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">Press Enter to create · Esc to close</p>
        </form>
      </DialogContent>
    </Dialog>
  )
}
