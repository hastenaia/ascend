"use client"
import { Swords } from "lucide-react"
import { cn } from "@/lib/utils"
import type { BossWithStats } from "@/lib/bosses/queries"

export function BossChallengeCard({ data, onSelect }: { data: BossWithStats; onSelect: () => void }) {
  const defeated = data.boss.status === "defeated"

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-2xl border p-4 text-left transition-all",
        defeated
          ? "border-[hsl(var(--gold)/0.35)] bg-[hsl(var(--gold)/0.04)] hover:-translate-y-0.5"
          : "border-border bg-card hover:-translate-y-0.5 hover:border-destructive/40",
      )}
    >
      {defeated && (
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-[hsl(var(--gold)/0.15)] blur-2xl" />
      )}

      <div className="flex items-start justify-between gap-2">
        <span className={cn("flex size-9 items-center justify-center rounded-xl ring-1", defeated ? "bg-[hsl(var(--gold)/0.12)] ring-[hsl(var(--gold)/0.4)] text-[hsl(var(--gold))]" : "bg-destructive/10 ring-destructive/30 text-destructive")}>
          <Swords className="size-4" />
        </span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest", defeated ? "bg-[hsl(var(--gold)/0.14)] text-[hsl(var(--gold))]" : "bg-muted text-muted-foreground")}>
          {defeated ? "Defeated" : `${data.hpPct}% HP`}
        </span>
      </div>

      <p className="mt-3 text-sm font-bold uppercase leading-snug tracking-[0.08em]">{data.boss.title}</p>

      {/* HP bar — segmented, RPG-lite but tasteful */}
      <div className="mt-auto space-y-1 pt-4">
        <div className="flex gap-[2px]">
          {Array.from({ length: 16 }, (_, i) => {
            const segStart = (i / 16) * 100
            return (
              <span
                key={i}
                className={cn(
                  "h-2 flex-1 rounded-sm",
                  segStart < data.hpPct ? (defeated ? "bg-[hsl(var(--gold))]" : i > 11 ? "bg-emerald-500" : i > 6 ? "bg-[hsl(var(--gold))]" : "bg-destructive") : "bg-muted",
                )}
              />
            )
          })}
        </div>
        <div className="flex items-center justify-between font-mono text-[10px] text-muted-foreground">
          <span>
            {defeated ? `HP 0 / ${data.boss.hp}` : `HP ${data.currentHp} / ${data.boss.hp}`}
          </span>
          <span>{data.hits.length} hit{data.hits.length === 1 ? "" : "s"} landed</span>
        </div>
        {defeated && (
          <p className="pt-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[hsl(var(--gold))]">Boss defeated</p>
        )}
      </div>
    </button>
  )
}
