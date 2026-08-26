"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { createGoalAction } from "@/lib/goals/actions"
import { createGoalSchema, GOAL_CATEGORIES, GOAL_PRIORITIES, type CreateGoalInput } from "@/lib/validations/goal"

export function GoalCreateDialog({ children }: { children?: React.ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateGoalInput>({ resolver: zodResolver(createGoalSchema), defaultValues: { category: "skills", priority: "medium" } })

  async function onSubmit(values: CreateGoalInput) {
    try {
      await createGoalAction(values)
      toast.success("Goal created")
      setOpen(false)
      reset()
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create goal")
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children ?? <Button size="sm"><Plus className="mr-1 size-4" /> New Goal</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New Goal</DialogTitle>
            <DialogDescription>A long-term outcome your phases will climb toward.</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="g-title">Title</Label>
            <Input id="g-title" placeholder="Become a better programmer" {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="g-category">Category</Label>
              <select id="g-category" {...register("category")} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                {GOAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-priority">Priority</Label>
              <select id="g-priority" {...register("priority")} className="h-9 w-full rounded-md border bg-background px-3 text-sm">
                {GOAL_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="g-target">Target date</Label>
            <Input id="g-target" type="date" {...register("target_date")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="g-outcome">Desired outcome</Label>
            <Textarea id="g-outcome" rows={2} placeholder="What does success look like?" {...register("desired_outcome")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="g-desc">Description</Label>
            <Textarea id="g-desc" rows={2} placeholder="Why does this matter?" {...register("description")} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? "Creating…" : "Create Goal"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
