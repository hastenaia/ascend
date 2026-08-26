"use client"
import * as React from "react"
import { BossChallengeCard } from "@/components/bosses/boss-challenge-card"
import { BossChallengeDetail } from "@/components/bosses/boss-challenge-detail"
import type { BossWithStats } from "@/lib/bosses/queries"

export function BossesClient({ bosses }: { bosses: BossWithStats[] }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)

  const selected = bosses.find((b) => b.boss.id === selectedId) ?? null

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {bosses.map((b) => (
          <BossChallengeCard
            key={b.boss.id}
            data={b}
            onSelect={() => {
              setSelectedId(b.boss.id)
              setOpen(true)
            }}
          />
        ))}
      </div>
      <BossChallengeDetail data={selected} open={open} onOpenChange={setOpen} />
    </>
  )
}
