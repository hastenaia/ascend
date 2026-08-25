"use client"
import * as React from "react"
import { AnimatePresence } from "framer-motion"
import { Inbox } from "lucide-react"
import { QuestCard } from "@/components/quests/quest-card"
import type { QuestRow } from "@/lib/quests/queries"

type Props = {
  quests: QuestRow[]
  onOpen?: (quest: QuestRow) => void
  onComplete?: (quest: QuestRow) => void
  busyId?: string | null
  emptyTitle?: string
  emptyDescription?: string
}

export function QuestList({ quests, onOpen, onComplete, busyId, emptyTitle = "No quests here", emptyDescription = "Nothing matches the current filters." }: Props) {
  if (quests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/30 px-6 py-10 text-center">
        <Inbox className="mb-3 size-6 text-muted-foreground" />
        <p className="text-sm font-medium">{emptyTitle}</p>
        <p className="mt-1 text-xs text-muted-foreground">{emptyDescription}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {quests.map((q, i) => (
          <QuestCard key={q.id} quest={q} index={i} onOpen={onOpen} onComplete={onComplete} busy={busyId === q.id} />
        ))}
      </AnimatePresence>
    </div>
  )
}
