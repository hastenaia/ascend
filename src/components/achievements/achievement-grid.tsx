"use client"
import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { AchievementCard } from "@/components/achievements/achievement-card"
import { AchievementDetail } from "@/components/achievements/achievement-detail"
import type { AchievementView } from "@/lib/achievements/queries"

export function AchievementGrid({ views }: { views: AchievementView[] }) {
  const reduced = useReducedMotion()
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)

  const selected = views.find((v) => v.def.id === selectedId) ?? null

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {views.map((view, i) => (
          <motion.div
            key={view.def.id}
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduced ? 0 : i * 0.05, duration: 0.35 }}
          >
            <AchievementCard
              view={view}
              onSelect={() => {
                setSelectedId(view.def.id)
                setOpen(true)
              }}
            />
          </motion.div>
        ))}
      </div>
      <AchievementDetail view={selected} open={open} onOpenChange={setOpen} />
    </>
  )
}
