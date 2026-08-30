"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Save, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { updateCoachProfileAction } from "@/lib/profile/actions"
import { COACH_STYLES, EXPERIENCE_LEVELS } from "@/lib/validations/profile"
import type { CoachStyle, ProfileExperienceLevel } from "@/types/database"

type Props = {
  initial: {
    experience_level: ProfileExperienceLevel | null
    long_term_objectives: string | null
    coach_style: CoachStyle | null
  }
}

const selectClass =
  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary"

export function CoachProfileForm({ initial }: Props) {
  const router = useRouter()
  const [experience, setExperience] = React.useState<ProfileExperienceLevel | null>(initial.experience_level)
  const [objectives, setObjectives] = React.useState(initial.long_term_objectives ?? "")
  const [style, setStyle] = React.useState<CoachStyle | null>(initial.coach_style)
  const [saving, setSaving] = React.useState(false)

  const dirty = experience !== initial.experience_level || objectives.trim() !== (initial.long_term_objectives ?? "") || style !== initial.coach_style

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      await updateCoachProfileAction({ experience_level: experience, long_term_objectives: objectives, coach_style: style })
      toast.success("Coach profile saved", { description: "Your AI coach will use this context from now on." })
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save coach profile")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="experience">Self-rated experience with personal growth work</Label>
        <select id="experience" value={experience ?? ""} onChange={(e) => setExperience((e.target.value || null) as ProfileExperienceLevel | null)} className={selectClass}>
          <option value="">Prefer not to say</option>
          {EXPERIENCE_LEVELS.map((l) => (
            <option key={l} value={l} className="capitalize">
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="objectives">Long-term objectives</Label>
        <Textarea
          id="objectives"
          rows={3}
          value={objectives}
          onChange={(e) => setObjectives(e.target.value)}
          maxLength={1000}
          placeholder="e.g. Publish a book, run a marathon, transition into engineering leadership."
          className="min-h-[80px] resize-none text-sm"
        />
        <p className="text-[11px] text-muted-foreground">{objectives.length}/1000 — the coach references these when suggesting quests and plans.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="style">Coach style</Label>
        <select id="style" value={style ?? ""} onChange={(e) => setStyle((e.target.value || null) as CoachStyle | null)} className={selectClass}>
          <option value="">Let the coach decide</option>
          {COACH_STYLES.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s === "balanced" ? "Balanced (warm + practical)" : s === "socratic" ? "Socratic (question-first)" : "Direct (blunt + efficient)"}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center justify-end">
        <Button onClick={save} disabled={saving || !dirty} className="rounded-xl">
          {saving ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Save className="mr-1 size-4" />} Save coach profile
        </Button>
      </div>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
        This is honest context for the AI Coach only — never supposed to inflate your stats. You can change it anytime.
      </p>
    </div>
  )
}