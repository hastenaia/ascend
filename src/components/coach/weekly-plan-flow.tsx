"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CalendarDays, Check, Loader2, Moon, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { createQuestAction } from "@/lib/quests/actions"
import { COACH_UNAVAILABLE_MESSAGE, type PlanItem } from "@/components/coach/types"
import { cn } from "@/lib/utils"

const DAY_ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

function isRest(item: PlanItem): boolean {
  return /rest|recover/i.test(item.quest_title)
}

export function WeeklyPlanFlow({ activePhaseId }: { activePhaseId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [plan, setPlan] = React.useState<PlanItem[] | null>(null)
  const [added, setAdded] = React.useState<Set<number>>(new Set())
  const [addingIdx, setAddingIdx] = React.useState<number | null>(null)

  async function generate() {
    setLoading(true)
    setPlan(null)
    try {
      const res = await fetch("/api/coach/weekly-plan", { method: "POST" })
      const json = (await res.json()) as { ok?: boolean; plan?: PlanItem[] }
      if (json.ok && json.plan?.length) {
        setPlan(json.plan)
        setAdded(new Set())
      } else toast.error(COACH_UNAVAILABLE_MESSAGE)
    } catch {
      toast.error(COACH_UNAVAILABLE_MESSAGE)
    } finally {
      setLoading(false)
    }
  }

  async function addOne(idx: number) {
    if (!plan || !activePhaseId || added.has(idx)) return
    setAddingIdx(idx)
    try {
      const item = plan[idx]
      const rest = isRest(item)
      await createQuestAction({
        title: item.quest_title,
        category: rest ? "reflection" : "general",
        difficulty: rest ? "easy" : "medium",
        xp_reward: rest ? 10 : 30,
        estimated_duration: rest ? null : 45,
        due_date: null,
        recurrence: "none",
        milestone_id: null,
        linked_skill: null,
        phase_id: activePhaseId,
      })
      setAdded((s) => new Set(s).add(idx))
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not add quest")
    } finally {
      setAddingIdx(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setPlan(null) }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!activePhaseId} title={!activePhaseId ? "Start your journey first" : undefined}>
          <CalendarDays className="mr-1 size-4" /> Weekly Plan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="size-4 text-primary" /> This Week&apos;s Plan</DialogTitle>
          <DialogDescription>Realistic volume from your real quests — recovery built in. Add any day as a quest.</DialogDescription>
        </DialogHeader>

        {!plan ? (
          <Button onClick={generate} disabled={loading} className="w-full">
            {loading ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Wand2 className="mr-1 size-4" />}
            {loading ? "Planning…" : "Generate weekly plan"}
          </Button>
        ) : (
          <ul className="space-y-1.5">
            {DAY_ORDER.map((day) => {
              const idx = plan.findIndex((p) => p.day === day)
              if (idx === -1) return null
              const item = plan[idx]
              const rest = isRest(item)
              return (
                <li key={day} className="flex items-center gap-2.5 rounded-xl border p-2.5">
                  <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{day.slice(0, 3)}</span>
                  <div className="min-w-0 flex-1">
                    {item.focus && <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">{rest ? "Recovery" : item.focus}</p>}
                    <p className={cn("truncate text-sm", added.has(idx) && "text-muted-foreground line-through")}>{item.quest_title}</p>
                  </div>
                  {rest && <Moon className="size-3.5 shrink-0 text-primary" />}
                  {added.has(idx) ? (
                    <Check className="size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <Button
                      variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs"
                      disabled={!activePhaseId || addingIdx !== null}
                      onClick={() => addOne(idx)}
                    >
                      {addingIdx === idx ? <Loader2 className="size-3 animate-spin" /> : "Add"}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
