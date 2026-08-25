"use client"
import { motion } from "framer-motion"
import { Lock, Check, Sparkles, ArrowRight, Target, Crown } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { PhaseStatus } from "@/types/ascend"

type Props = {
  title: string
  subtitle?: string | null
  objective?: string | null
  status: PhaseStatus
  orderIndex: number
  progress?: number
  done?: number
  total?: number
  earnedXp?: number
  focusAreas?: string[]
  onAction?: () => void
  actionLabel?: string
  disabled?: boolean
}

const statusStyles: Record<PhaseStatus, string> = {
  locked: "bg-muted/40 border-dashed opacity-80",
  available: "bg-card border-primary/20 shadow-sm",
  active: "bg-card border-primary/30 shadow-md",
  completed: "bg-card border-emerald-200/50 dark:border-emerald-900/30",
  archived: "bg-muted/30 opacity-60",
}

const iconMap: Record<PhaseStatus, React.ElementType> = {
  locked: Lock,
  available: Sparkles,
  active: Target,
  completed: Check,
  archived: Crown,
}

export function PhaseCard({ title, subtitle, objective, status, orderIndex, progress = 0, done, total, focusAreas, onAction, actionLabel, disabled }: Props) {
  const Icon = iconMap[status]
  const isLocked = status === "locked"
  const isActive = status === "active"
  const isCompleted = status === "completed"
  const isAvailable = status === "available"

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: orderIndex * 0.04 }} whileHover={!isLocked ? { y: -2 } : undefined}>
      <Card className={cn("overflow-hidden transition-colors", statusStyles[status], isActive && "ring-1 ring-primary/10")}>
        {isActive && <div className="h-1 w-full ascend-gradient-strong" />}
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-xl border text-xs font-bold",
                  isLocked && "bg-muted text-muted-foreground",
                  isAvailable && "bg-primary text-primary-foreground border-primary",
                  isActive && "bg-primary text-primary-foreground border-primary shadow-sm",
                  isCompleted && "bg-emerald-500 text-white border-emerald-500"
                )}
              >
                {isCompleted ? <Check className="size-4" /> : isLocked ? <Lock className="size-3.5" /> : `0${orderIndex}`.slice(-2)}
              </span>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{`Phase ${String(orderIndex).padStart(2, "0")}`}</p>
                <h3 className={cn("text-sm font-bold tracking-tight", isLocked && "text-muted-foreground")}>{title.replace(/^PHASE \d+ — /, "") || title}</h3>
                {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
              </div>
            </div>
            <Badge variant={isCompleted ? "soft" : isActive ? "default" : isAvailable ? "outline" : "secondary"} className="rounded-full capitalize">
              <Icon className="mr-1 size-3" />
              {status}
            </Badge>
          </div>

          {objective && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">&ldquo;{objective}&rdquo;</p>}

          {focusAreas && focusAreas.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {focusAreas.slice(0, 4).map((f) => (
                <span key={f} className="rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {f}
                </span>
              ))}
              {focusAreas.length > 4 && <span className="text-[11px] text-muted-foreground">+{focusAreas.length - 4}</span>}
            </div>
          )}

          {!isLocked && typeof done === "number" && typeof total === "number" && (
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">
                  {done} / {total} · {progress}%
                </span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>
          )}

          {isLocked && <p className="mt-4 text-xs text-muted-foreground">Complete the previous phase to unlock.</p>}

          {onAction && (isAvailable || isActive || isCompleted) && (
            <Button
              size="sm"
              variant={isActive ? "default" : isAvailable ? "default" : "outline"}
              className="mt-4 w-full"
              onClick={onAction}
              disabled={disabled}
            >
              {actionLabel ?? (isAvailable ? "Begin Phase" : isActive ? "View Phase" : "View summary")}
              <ArrowRight className="size-3.5" />
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
