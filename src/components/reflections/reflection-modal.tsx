"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { NotebookPen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { savePhaseReflection } from "@/lib/phases/actions"

const QUESTIONS = [
  { field: "learnings" as const, label: "What did you learn?", placeholder: "Insights, surprises, skills…" },
  { field: "worked" as const, label: "What worked?", placeholder: "Habits, timing, environments…" },
  { field: "didntWork" as const, label: "What didn't work?", placeholder: "Be honest — this is for you." },
  { field: "changePlan" as const, label: "What do you want to change?", placeholder: "One concrete adjustment…" },
]

export function ReflectionModal({
  phaseId,
  phaseTitle,
  initial,
  open,
  onOpenChange,
}: {
  phaseId: string
  phaseTitle?: string
  initial?: { learnings?: string; worked?: string; didntWork?: string; changePlan?: string }
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [values, setValues] = React.useState({
    learnings: initial?.learnings ?? "",
    worked: initial?.worked ?? "",
    didntWork: initial?.didntWork ?? "",
    changePlan: initial?.changePlan ?? "",
  })
  const [busy, setBusy] = React.useState(false)

  // Reset draft from `initial` each time the modal opens (render-time adjustment pattern)
  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setValues({
        learnings: initial?.learnings ?? "",
        worked: initial?.worked ?? "",
        didntWork: initial?.didntWork ?? "",
        changePlan: initial?.changePlan ?? "",
      })
    }
  }

  async function save() {
    setBusy(true)
    try {
      await savePhaseReflection(phaseId, values)
      toast.success("Reflection saved")
      onOpenChange(false)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save reflection")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <NotebookPen className="size-4 text-primary" /> Phase Reflection{phaseTitle ? ` · ${phaseTitle}` : ""}
          </DialogTitle>
          <DialogDescription>Four questions. Honest answers only — no one else reads this.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {QUESTIONS.map((q) => (
            <div key={q.field} className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">{q.label}</label>
              <Textarea
                rows={2}
                maxLength={1500}
                value={values[q.field]}
                onChange={(e) => setValues((v) => ({ ...v, [q.field]: e.target.value }))}
                placeholder={q.placeholder}
              />
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save reflection"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
