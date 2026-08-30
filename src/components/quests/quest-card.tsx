"use client"
import { motion, useReducedMotion } from "framer-motion"
import { Clock, Calendar, Repeat, Check, Zap } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { CATEGORY_ICONS } from "@/lib/icons"
import type { QuestRow } from "@/lib/quests/queries"

export const difficultyStyles: Record<string, string> = {
  easy: "text-emerald-600 dark:text-emerald-400",
  medium: "text-sky-600 dark:text-sky-400",
  hard: "text-amber-600 dark:text-amber-400",
  challenge: "text-rose-600 dark:text-rose-400",
}

export function formatDueLabel(dueDate: string | null): string | null {
  if (!dueDate) return null
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`
  if (dueDate < todayStr) return `Overdue · ${dueDate}`
  if (dueDate === todayStr) return "Due today"
  return `Due ${dueDate}`
}

type Props = {
  quest: QuestRow
  onOpen?: (quest: QuestRow) => void
  onComplete?: (quest: QuestRow) => void
  busy?: boolean
  index?: number
}

export function QuestCard({ quest, onOpen, onComplete, busy, index = 0 }: Props) {
  const reduced = useReducedMotion()
  const done = quest.status === "completed"
  const dueLabel = formatDueLabel(quest.due_date)
  const overdue = dueLabel?.startsWith("Overdue")
  const CategoryIcon = CATEGORY_ICONS[quest.category] ?? CATEGORY_ICONS.general

  return (
    <motion.div
      layout={!reduced}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      transition={reduced ? { duration: 0 } : { duration: 0.25, delay: Math.min(index * 0.03, 0.3) }}
      whileHover={done || reduced ? undefined : { y: -1 }}
    >
      <Card
        role="button"
        tabIndex={0}
        aria-label={`Open quest ${quest.title}`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onOpen?.(quest)
          }
        }}
        className={cn(
          "group cursor-pointer overflow-hidden transition-colors",
          done ? "border-emerald-200/50 bg-emerald-50/40 dark:border-emerald-900/40 dark:bg-emerald-950/20" : "hover:border-primary/25 hover:shadow-[0_10px_30px_-14px_hsl(252_60%_50%/0.25)]"
        )}
        onClick={() => onOpen?.(quest)}
      >
        <CardContent className="flex items-center gap-3 p-4">
          <button
            type="button"
            aria-label={done ? "Completed" : "Complete quest"}
            disabled={done || busy}
            onClick={(e) => {
              e.stopPropagation()
              if (!done) onComplete?.(quest)
            }}
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full border transition-all active:scale-90",
              done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border bg-card hover:border-primary hover:bg-primary/10",
              busy && !done && "animate-pulse"
            )}
          >
            {done && <Check className="size-4" />}
          </button>

          {!done && (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg ascend-gradient text-primary ring-1 ring-primary/20">
              <CategoryIcon className="size-4" />
            </span>
          )}

          <div className="min-w-0 flex-1">
            <p className={cn("truncate text-sm font-medium", done && "text-muted-foreground line-through")}>{quest.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="font-medium capitalize">{quest.category}</span>
              <span className={cn("font-semibold capitalize", difficultyStyles[quest.difficulty])}>{quest.difficulty}</span>
              {quest.recurrence !== "none" && (
                <span className="inline-flex items-center gap-0.5 capitalize">
                  <Repeat className="size-3" /> {quest.recurrence}
                </span>
              )}
              {quest.estimated_duration ? (
                <span className="inline-flex items-center gap-0.5">
                  <Clock className="size-3" /> {quest.estimated_duration}m
                </span>
              ) : null}
              {dueLabel ? (
                <span className={cn("inline-flex items-center gap-0.5", overdue && "font-medium text-destructive")}>
                  <Calendar className="size-3" /> {dueLabel}
                </span>
              ) : null}
            </div>
          </div>

          <Badge variant={done ? "soft" : "outline"} className="shrink-0 rounded-full font-mono text-[11px]">
            <Zap className="mr-0.5 size-3" />+{quest.xp_reward}
          </Badge>
        </CardContent>
      </Card>
    </motion.div>
  )
}
