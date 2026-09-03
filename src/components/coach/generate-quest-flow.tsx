"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, ScrollText, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { createQuestAction } from "@/lib/quests/actions"
import type { QuestCategory, QuestDifficulty } from "@/types/database"
import { COACH_UNAVAILABLE_MESSAGE, type ProposedQuest } from "@/components/coach/types"
import { cn } from "@/lib/utils"

const XP_BY_DIFFICULTY: Record<string, number> = { easy: 15, medium: 30, hard: 60, challenge: 100 }

export function GenerateQuestFlow({ activePhaseId }: { activePhaseId: string | null }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [focus, setFocus] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [proposals, setProposals] = React.useState<ProposedQuest[] | null>(null)
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [rateLimitedUntil, setRateLimitedUntil] = React.useState<number | null>(null)
  const [now, setNow] = React.useState(() => Date.now())
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    if (!rateLimitedUntil) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [rateLimitedUntil])

  React.useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  const cooldownLeft = rateLimitedUntil ? Math.max(0, Math.ceil((rateLimitedUntil - now) / 1000)) : 0
  const loadingOrCooldown = loading || cooldownLeft > 0

  async function generate() {
    if (loading) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setProposals(null)
    try {
      const res = await fetch("/api/coach/generate-quests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ focus }),
        signal: controller.signal,
      })
      const json = (await res.json()) as { ok?: boolean; quests?: ProposedQuest[]; rate_limited?: boolean; retryAfter?: number | null }
      if (json.ok && json.quests?.length) {
        setProposals(json.quests)
        setSelected(new Set(json.quests.map((_, i) => i)))
      } else if (json.rate_limited) {
        const secs = json.retryAfter && json.retryAfter > 0 ? json.retryAfter : 30
        setRateLimitedUntil(Date.now() + secs * 1000)
        toast.error(`AI Coach is rate-limited. Please wait about ${secs} seconds and try again.`)
      } else {
        toast.error(COACH_UNAVAILABLE_MESSAGE)
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return
      toast.error(COACH_UNAVAILABLE_MESSAGE)
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
        setLoading(false)
      }
    }
  }

  async function addSelected() {
    if (!proposals || !activePhaseId) return
    setAdding(true)
    let added = 0
    try {
      for (const i of selected) {
        const q = proposals[i]
        await createQuestAction({
          title: q.title,
          category: q.category as QuestCategory,
          difficulty: q.difficulty as QuestDifficulty,
          xp_reward: XP_BY_DIFFICULTY[q.difficulty] ?? 30,
          estimated_duration: q.estimated_duration,
          due_date: null,
          recurrence: "none",
          milestone_id: null,
          linked_skill: null,
          phase_id: activePhaseId,
        })
        added += 1
      }
      toast.success(`${added} quest${added === 1 ? "" : "s"} created`)
      setOpen(false)
      setProposals(null)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : `Added ${added} before stopping`)
    } finally {
      setAdding(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setProposals(null) }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!activePhaseId} title={!activePhaseId ? "Start your journey first" : undefined}>
          <ScrollText className="mr-1 size-4" /> Generate Quests
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="size-4 text-primary" /> AI Quest Generator</DialogTitle>
          <DialogDescription>Grounded in your current phase and open milestones — pick what to add.</DialogDescription>
        </DialogHeader>

        {!proposals ? (
          <div className="space-y-3">
            <Input placeholder='Optional focus — e.g. "deep work for milestone X"' value={focus} onChange={(e) => setFocus(e.target.value)} />
            <Button onClick={generate} disabled={loadingOrCooldown} className="w-full">
              {loading ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Wand2 className="mr-1 size-4" />}
              {loading ? "Generating…" : cooldownLeft > 0 ? `Rate-limited — retry in ${cooldownLeft}s` : "Generate quests"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <ul className="space-y-1.5">
              {proposals.map((q, i) => (
                <li key={i} className={cn("flex items-center gap-2.5 rounded-xl border p-2.5", !selected.has(i) && "opacity-50")}>
                  <Checkbox
                    checked={selected.has(i)}
                    onCheckedChange={(v) =>
                      setSelected((s) => {
                        const n = new Set(s)
                        if (v) n.add(i)
                        else n.delete(i)
                        return n
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{q.title}</span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">{q.category}</span>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">{q.difficulty}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setProposals(null)}>Back</Button>
              <Button onClick={addSelected} disabled={adding || selected.size === 0}>
                {adding ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                Add selected ({selected.size})
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
