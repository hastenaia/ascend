"use client"
import * as React from "react"
import { Plus, Swords } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useCreateBoss } from "@/components/bosses/boss-challenge-detail"

const HP_PRESETS = [500, 1000, 2000]

export function BossCreateDialog() {
  const boss = useCreateBoss()

  return (
    <Dialog open={boss.open} onOpenChange={boss.setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1 size-4" /> New Challenge
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Swords className="size-4 text-destructive" /> New Boss Challenge
          </DialogTitle>
          <DialogDescription>Name an obstacle and chip away at it with real moves. Purely a metaphor — you set the rules.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="boss-title">The obstacle</Label>
            <Input id="boss-title" placeholder="PROCRASTINATION" value={boss.title} onChange={(e) => boss.setTitle(e.target.value)} maxLength={80} />
          </div>

          <div className="space-y-1.5">
            <Label>HP</Label>
            <div className="flex gap-2">
              {HP_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => boss.setHp(p)}
                  className={cn(
                    "flex-1 rounded-lg border py-1.5 font-mono text-xs transition-colors",
                    boss.hp === p ? "border-primary bg-primary/10 font-bold text-primary" : "hover:bg-muted/50",
                  )}
                >
                  {p}
                </button>
              ))}
              <Input
                type="number" min={100} max={10000}
                value={boss.hp}
                onChange={(e) => boss.setHp(Number(e.target.value) || 0)}
                className="h-[34px] w-24"
                aria-label="Custom HP"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => boss.setOpen(false)}>Cancel</Button>
            <Button onClick={boss.create} disabled={boss.busy || !boss.title.trim()}>
              {boss.busy ? "Creating…" : "Create challenge"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
