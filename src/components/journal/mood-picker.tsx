"use client"
import { cn } from "@/lib/utils"
import type { Mood } from "@/lib/validations/journal"

const MOODS: { value: Mood; label: string; emoji: string }[] = [
  { value: "terrible", label: "Rough", emoji: "😔" },
  { value: "low", label: "Low", emoji: "😕" },
  { value: "okay", label: "Okay", emoji: "😐" },
  { value: "good", label: "Good", emoji: "🙂" },
  { value: "great", label: "Great", emoji: "🤩" },
]

export function MoodPicker({ value, onChange }: { value: Mood | null; onChange: (v: Mood | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {MOODS.map((m) => (
        <button
          key={m.value}
          type="button"
          onClick={() => onChange(value === m.value ? null : m.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            value === m.value ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-card hover:border-primary/30 hover:text-foreground text-muted-foreground"
          )}
        >
          <span>{m.emoji}</span> {m.label}
        </button>
      ))}
    </div>
  )
}
