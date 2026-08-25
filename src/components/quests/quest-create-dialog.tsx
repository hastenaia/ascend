"use client"
import * as React from "react"
import { useForm, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { createQuestAction } from "@/lib/quests/actions"
import { createQuestSchema, XP_BANDS, QUEST_CATEGORIES, QUEST_DIFFICULTIES, RECURRENCES, type CreateQuestInput, type QuestDifficultyValue } from "@/lib/validations/quest"

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
}

const inputCls = "h-9 w-full rounded-xl border bg-background px-3 text-sm"

export function QuestCreateDialog({ open, onOpenChange, milestones, skills }: Props) {
  const [busy, setBusy] = React.useState(false)
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(createQuestSchema) as unknown as Resolver<FormValues>,
    defaultValues: { title: "", description: "", category: "general", difficulty: "medium", xp_reward: XP_BANDS.medium.default, recurrence: "none" },
  })

  const [difficulty, setDifficulty] = React.useState<QuestDifficultyValue>("medium")
  const band = XP_BANDS[difficulty] ?? XP_BANDS.medium

  function handleDifficultyChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const d = e.target.value as QuestDifficultyValue
    setDifficulty(d)
    const b = XP_BANDS[d]
    const cur = Number(getValues("xp_reward") ?? 0)
    if (cur < b.min || cur > b.max) setValue("xp_reward", b.default, { shouldValidate: false })
  }

  async function onSubmit(values: FormValues) {
    setBusy(true)
    try {
      await createQuestAction(values as CreateQuestInput)
      toast.success("Quest created")
      reset()
      onOpenChange(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create quest")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-[480px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-4 text-primary" /> New Quest
          </DialogTitle>
          <DialogDescription>Small actions, real XP. Link it to a milestone to move your phase forward.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="q-title">Title</Label>
            <Input id="q-title" placeholder="Study programming for 30 minutes" {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-desc">Description</Label>
            <Textarea id="q-desc" rows={2} placeholder="Optional details…" {...register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-cat">Category</Label>
              <select id="q-cat" className={inputCls} {...register("category")}>
                {QUEST_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-diff">Difficulty</Label>
              <select id="q-diff" className={inputCls} {...register("difficulty", { onChange: handleDifficultyChange })}>
                {QUEST_DIFFICULTIES.map((d) => (
                  <option key={d} value={d} className="capitalize">
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-xp">XP reward</Label>
              <Input id="q-xp" type="number" min={band.min} max={band.max} {...register("xp_reward", { valueAsNumber: true })} />
              <p className="text-[11px] text-muted-foreground">
                {difficulty}: {band.min}–{band.max} XP
              </p>
              {errors.xp_reward && <p className="text-xs text-destructive">{errors.xp_reward.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-dur">Duration (min)</Label>
              <Input id="q-dur" type="number" min={5} max={480} placeholder="30" {...register("estimated_duration", { valueAsNumber: true })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="q-rec">Repeats</Label>
              <select id="q-rec" className={inputCls} {...register("recurrence")}>
                {RECURRENCES.map((r) => (
                  <option key={r} value={r} className="capitalize">
                    {r === "none" ? "one-time" : r}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-due">Due date</Label>
              <Input id="q-due" type="date" {...register("due_date")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-ms">Link to milestone</Label>
            <select id="q-ms" className={inputCls} {...register("milestone_id")}>
              <option value="">None</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>

          {skills.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="q-skill">Linked skill</Label>
              <select id="q-skill" className={inputCls} {...register("linked_skill")}>
                <option value="">None</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
            Create Quest
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
