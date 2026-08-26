"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FlaskConical, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { createExperimentAction } from "@/lib/experiments/actions"

const DURATIONS = [7, 14, 21, 30]

export function ExperimentCreateDialog() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const [hypothesis, setHypothesis] = React.useState("")
  const [duration, setDuration] = React.useState(14)
  const [trackSleep, setTrackSleep] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    if (!title.trim()) return
    setBusy(true)
    try {
      await createExperimentAction({ title: title.trim(), hypothesis: hypothesis.trim() || null, duration_days: duration, track_sleep: trackSleep })
      toast.success("Experiment started")
      setOpen(false)
      setTitle("")
      setHypothesis("")
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not start experiment")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 size-4" /> New Experiment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="size-4 text-primary" /> New Experiment
          </DialogTitle>
          <DialogDescription>Test a routine for a fixed window. Track how it actually makes you feel.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ex-title">The routine</Label>
            <Input id="ex-title" placeholder="Read for 20 minutes before bed" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={150} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ex-hypo">Your hypothesis</Label>
            <Textarea id="ex-hypo" rows={2} placeholder="What do you expect will happen?" value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} maxLength={1000} />
          </div>

          <div className="grid grid-cols-2 items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ex-duration">Duration</Label>
              <select id="ex-duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>{d} days</option>
                ))}
              </select>
            </div>
            <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-muted-foreground">
              <Checkbox checked={trackSleep} onCheckedChange={(v) => setTrackSleep(!!v)} aria-label="Track sleep quality" />
              Also track sleep quality
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy || !title.trim()}>
              {busy ? "Starting…" : "Start experiment"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
