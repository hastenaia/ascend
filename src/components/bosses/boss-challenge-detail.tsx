"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Swords, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { addBossHitAction, createBossAction } from "@/lib/bosses/actions"
import type { BossWithStats } from "@/lib/bosses/queries"

const QUICK_MOVES: { label: string; damage: number }[] = [
  { label: "25-minute focus session", damage: 50 },
  { label: "Deep work block", damage: 100 },
  { label: "Complete an assignment", damage: 150 },
  { label: "Finish a project", damage: 300 },
]

export function BossChallengeDetail({
  data,
  open,
  onOpenChange,
}: {
  data: BossWithStats | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [customLabel, setCustomLabel] = React.useState("")
  const [customDamage, setCustomDamage] = React.useState("50")
  const [busy, setBusy] = React.useState(false)

  if (!data) return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent /></Sheet>

  const defeated = data.boss.status === "defeated"

  async function strike(label: string, damage: number) {
    setBusy(true)
    try {
      const res = await addBossHitAction(data!.boss.id, label, damage)
      toast.success(`-${damage} HP`)
      if (res.defeated) toast.success("Boss defeated!")
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not record move")
    } finally {
      setBusy(false)
    }
  }

  async function customStrike() {
    const dmg = Number(customDamage)
    if (!Number.isInteger(dmg)) return
    await strike(customLabel.trim() || "Direct attack", dmg)
    setCustomLabel("")
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto border-l border-border/60 sm:max-w-md">
        <SheetHeader className="gap-1 pb-2 pr-6 text-left">
          <SheetTitle className="flex items-center gap-2 text-lg font-bold uppercase tracking-[0.1em]">
            <Swords className={cn("size-4", defeated ? "text-[hsl(var(--gold))]" : "text-destructive")} /> {data.boss.title}
          </SheetTitle>
          <p className="font-mono text-[11px] text-muted-foreground">
            HP {data.currentHp} / {data.boss.hp} · {data.hits.length} moves logged
            {defeated && data.boss.defeated_at ? ` · defeated ${data.boss.defeated_at.slice(0, 10)}` : ""}
          </p>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-10">
          {/* Big HP bar */}
          <div>
            <div className="h-3 w-full overflow-hidden rounded-full border bg-muted/60">
              <div
                className={cn("h-full transition-all duration-500", defeated ? "bg-[hsl(var(--gold))]" : data.hpPct > 40 ? "bg-emerald-500" : "bg-destructive")}
                style={{ width: `${data.hpPct}%` }}
              />
            </div>
            {defeated && (
              <div className="mt-4 rounded-xl border border-[hsl(var(--gold)/0.4)] bg-[hsl(var(--gold)/0.06)] p-4 text-center">
                <Trophy className="mx-auto size-6 text-[hsl(var(--gold))]" />
                <p className="mt-2 text-sm font-bold uppercase tracking-[0.24em] text-[hsl(var(--gold))]">Boss Defeated</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Steady moves beat big gestures — that&apos;s how this one went down.
                </p>
              </div>
            )}
          </div>

          {!defeated && (
            <section className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Strike</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_MOVES.map((m) => (
                  <button
                    key={m.label}
                    type="button"
                    disabled={busy}
                    onClick={() => strike(m.label, m.damage)}
                    className="flex flex-col items-start gap-0.5 rounded-xl border p-2.5 text-left transition-colors hover:border-destructive/50 hover:bg-destructive/5 disabled:opacity-50"
                  >
                    <span className="font-mono text-[10px] font-bold text-destructive">-{m.damage} HP</span>
                    <span className="text-xs leading-tight">{m.label}</span>
                  </button>
                ))}
              </div>

              <div className="flex items-end gap-2 pt-1">
                <div className="min-w-0 flex-1 space-y-1">
                  <Input placeholder="Custom move…" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} maxLength={80} className="h-8" />
                </div>
                <Input
                  type="number" min={1} max={1000}
                  value={customDamage}
                  onChange={(e) => setCustomDamage(e.target.value)}
                  className="h-8 w-20"
                  aria-label="Damage"
                />
                <Button variant="outline" size="sm" className="h-8 shrink-0 px-2.5" disabled={busy || !Number.isInteger(Number(customDamage))} onClick={customStrike}>
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </section>
          )}

          {/* Move log */}
          <section className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Battle log</p>
            {data.hits.length === 0 ? (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No moves yet. Small hits add up.</p>
            ) : (
              <ul className="space-y-1">
                {data.hits.map((h) => (
                  <li key={h.id} className="flex items-center gap-2.5 rounded-lg border px-3 py-1.5 text-sm">
                    <span className="font-mono text-[10px] font-bold text-destructive">-{h.damage}</span>
                    <span className="min-w-0 flex-1 truncate">{h.label}</span>
                    <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground">{h.created_at.slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="rounded-xl border bg-muted/20 p-3 text-center font-mono text-[9.5px] leading-relaxed text-muted-foreground">
            A playful metaphor for chipping away at obstacles — not a diagnosis of anything.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function useCreateBoss(onDone?: () => void) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [hp, setHp] = React.useState(1000)
  const [busy, setBusy] = React.useState(false)

  async function create() {
    setBusy(true)
    try {
      await createBossAction(title.trim(), hp)
      toast.success("Challenge created")
      setOpen(false)
      setTitle("")
      onDone?.()
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create challenge")
    } finally {
      setBusy(false)
    }
  }

  return { open, setOpen, title, setTitle, hp, setHp, busy, create }
}
