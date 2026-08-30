"use client"
import * as React from "react"
import { Clock, Calendar, Repeat, Zap, Trash2, Target, Sparkles, Save, SkipForward, CalendarClock } from "lucide-react"
import Link from "next/link"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { difficultyStyles } from "@/components/quests/quest-card"
import type { QuestRow } from "@/lib/quests/queries"

type Props = {
  quest: QuestRow | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onComplete?: (quest: QuestRow) => void
  onDelete?: (quest: QuestRow) => void
  onPostpone?: (quest: QuestRow) => void
  onSkip?: (quest: QuestRow) => void
  onSaveEvidence?: (quest: QuestRow, evidence: string) => void
  busy?: boolean
  milestoneTitle?: string | null
  skillName?: string | null
}

function Row({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <Icon className="size-3.5" /> {label}
      </span>
      <span className="font-medium capitalize">{value}</span>
    </div>
  )
}

export function QuestDetail({ quest, open, onOpenChange, onComplete, onDelete, onPostpone, onSkip, onSaveEvidence, busy, milestoneTitle, skillName }: Props) {
  const [evidence, setEvidence] = React.useState("")
  const [evidenceQuestId, setEvidenceQuestId] = React.useState<string | null>(null)

  // Reset evidence state when a different quest is opened (render-phase adjustment)
  if (quest && quest.id !== evidenceQuestId) {
    setEvidenceQuestId(quest.id)
    setEvidence(quest.evidence ?? "")
  }
  const evidenceDirty = evidence !== (quest?.evidence ?? "")

  if (!quest) return null
  const done = quest.status === "completed"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle className="text-left leading-snug">{quest.title}</DialogTitle>
            <Badge variant={done ? "soft" : "outline"} className="shrink-0 rounded-full font-mono">
              <Zap className="mr-0.5 size-3" />+{quest.xp_reward} XP
            </Badge>
          </div>
          {quest.description ? <DialogDescription className="text-left">{quest.description}</DialogDescription> : null}
        </DialogHeader>

        <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
          <Row icon={Sparkles} label="Category" value={quest.category} />
          <div className="flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Target className="size-3.5" /> Difficulty
            </span>
            <span className={`text-sm font-semibold capitalize ${difficultyStyles[quest.difficulty]}`}>{quest.difficulty}</span>
          </div>
          {quest.estimated_duration ? <Row icon={Clock} label="Duration" value={`${quest.estimated_duration} min`} /> : null}
          {quest.recurrence !== "none" && <Row icon={Repeat} label="Repeats" value={quest.recurrence} />}
          {quest.due_date && (
            <div className="flex items-center justify-between text-sm">
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Calendar className="size-3.5" /> Due date
              </span>
              <span className="font-medium">{quest.due_date}</span>
            </div>
          )}
          {milestoneTitle && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="shrink-0 text-muted-foreground">Milestone</span>
              <span className="truncate text-right font-medium">{milestoneTitle}</span>
            </div>
          )}
          {skillName && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="shrink-0 text-muted-foreground">Linked skill</span>
              <span className="truncate text-right font-medium">{skillName}</span>
            </div>
          )}
          {done && quest.completed_at && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Completed {new Date(quest.completed_at).toLocaleString()}</p>
          )}
          {(quest.postponed_count > 0 || quest.skipped_count > 0) && (
            <p className="text-xs text-muted-foreground">
              Postponed {quest.postponed_count}× · skipped {quest.skipped_count}×
            </p>
          )}
        </div>

        <div className="space-y-2 rounded-xl border bg-muted/30 p-4">
          <p className="text-sm font-medium leading-none">Evidence of growth</p>
          <p className="text-[11px] leading-relaxed text-muted-foreground">What can you now do that you couldn&apos;t before this quest? Honest proof beats guesses.</p>
          <Textarea
            rows={3}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            disabled={busy}
            placeholder="e.g. I can now run 5k without stopping, or I shipped a feature end-to-end."
            className="min-h-[70px] resize-none text-sm"
          />
          {onSaveEvidence && (
            <div className="flex justify-end">
              <Button variant="outline" size="sm" disabled={busy || !evidenceDirty} onClick={() => onSaveEvidence(quest, evidence)}>
                <Save className="mr-1 size-3.5" /> {quest.evidence ? "Update" : "Save evidence"}
              </Button>
            </div>
          )}
        </div>

        <Separator />

        {!done && (
          <div className="rounded-lg border bg-primary/5 p-2.5 text-xs leading-relaxed text-muted-foreground">
            Reflect after completing? <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild><Link href={`/journal?quest=${quest.id}`}>Journal about this quest →</Link></Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {!done && onDelete && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(quest)
              }}
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          )}
          {!done && onPostpone && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                onPostpone(quest)
              }}
            >
              <CalendarClock className="size-3.5" /> Postpone
            </Button>
          )}
          {!done && onSkip && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                onSkip(quest)
              }}
            >
              <SkipForward className="size-3.5" /> Skip
            </Button>
          )}
          {!done && onComplete && (
            <Button
              size="sm"
              className="ml-auto"
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                onComplete(quest)
              }}
            >
              Complete quest
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
