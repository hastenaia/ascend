"use client"
import * as React from "react"
import { motion } from "framer-motion"
import { Trophy, Sparkles, Check, ArrowRight, NotebookPen } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { savePhaseReflection } from "@/lib/phases/actions"

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  phaseId: string
  phaseTitle: string
  tagline?: string | null
  xp: number
  done: number
  total: number
  finalChallenge: string
  nextPhaseTitle?: string | null
  onBeginNext?: () => Promise<void>
}

export function PhaseCompleteDialog({ open, onOpenChange, phaseId, phaseTitle, tagline, xp, done, total, finalChallenge, nextPhaseTitle, onBeginNext }: Props) {
  const [busy, setBusy] = React.useState(false)
  const [reflection, setReflection] = React.useState("")
  const [reflectionSaved, setReflectionSaved] = React.useState(false)

  async function handleBegin() {
    if (!onBeginNext) return
    // Best-effort: persist reflection before moving on
    const text = reflection.trim()
    if (text.length > 0 && !reflectionSaved) {
      try {
        await savePhaseReflection(phaseId, text)
        setReflectionSaved(true)
      } catch {}
    }
    setBusy(true)
    try {
      await onBeginNext()
      toast.success("Next phase started")
      onOpenChange(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not start next phase")
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveReflection() {
    const text = reflection.trim()
    if (text.length === 0) return
    setBusy(true)
    try {
      await savePhaseReflection(phaseId, text)
      setReflectionSaved(true)
      toast.success("Reflection saved")
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save reflection")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] overflow-hidden p-0">
        <div className="h-1.5 w-full ascend-gradient-strong" />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 space-y-5">
          <div className="flex items-center justify-center">
            <span className="flex size-14 items-center justify-center rounded-2xl ascend-gradient-strong text-white shadow-md">
              <Trophy className="size-7" />
            </span>
          </div>
          <DialogHeader className="space-y-1 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Phase Complete</p>
            <DialogTitle className="text-xl text-center">{phaseTitle.replace(/^PHASE \d+ — /, "")}</DialogTitle>
            <DialogDescription className="text-center">&ldquo;{tagline ?? "A chapter closed."}&rdquo;</DialogDescription>
          </DialogHeader>

          <div className="rounded-2xl border bg-muted/30 p-4 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" /> +{xp} XP
            </span>
            <span className="text-xs text-muted-foreground">
              Milestones {done} / {total} · Final Challenge: {finalChallenge}
            </span>
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Summary</p>
            <div className="flex items-center gap-2 text-sm">
              <Check className="size-4 text-emerald-500" /> Milestones {done} / {total} completed
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Check className="size-4 text-emerald-500" /> Final Challenge: {finalChallenge}
            </div>
            <p className="text-xs text-muted-foreground">Stats improved: Coming in later progression phase</p>
          </div>

          <div className="rounded-xl border bg-card p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <NotebookPen className="size-3.5" /> Reflection
            </p>
            {reflectionSaved && reflection.trim().length > 0 ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Check className="size-4" /> Saved. See you in the next phase.
              </p>
            ) : (
              <>
                <Textarea
                  value={reflection}
                  onChange={(e) => setReflection(e.target.value)}
                  placeholder="What did this phase teach you? What will you carry forward?"
                  maxLength={5000}
                  rows={3}
                />
                <Button size="sm" variant="outline" onClick={handleSaveReflection} disabled={busy || reflection.trim().length === 0}>
                  Save Reflection
                </Button>
              </>
            )}
          </div>

          {nextPhaseTitle && (
            <>
              <Separator />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Next Phase: <span className="font-semibold text-foreground">{nextPhaseTitle.replace(/^PHASE \d+ — /, "")}</span>
                </p>
              </div>
            </>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Stay here
            </Button>
            {onBeginNext && nextPhaseTitle && (
              <Button className="flex-1" onClick={handleBegin} disabled={busy}>
                {busy ? <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
                Begin Next Phase <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
