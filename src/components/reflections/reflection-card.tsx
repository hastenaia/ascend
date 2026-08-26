import { Quote } from "lucide-react"
import type { StructuredReflection } from "@/lib/reflections/queries"

const SECTIONS: { key: keyof Omit<StructuredReflection, "body">; label: string }[] = [
  { key: "learnings", label: "What did you learn?" },
  { key: "worked", label: "What worked?" },
  { key: "didnt_work", label: "What didn't work?" },
  { key: "change_plan", label: "What do you want to change?" },
]

export function ReflectionCard({ reflection, className }: { reflection: StructuredReflection; className?: string }) {
  const sections = SECTIONS.filter((s) => (reflection[s.key] ?? "").trim().length > 0)

  if (sections.length === 0) {
    // Legacy plain-body reflections
    return (
      <blockquote className={`rounded-lg border bg-muted/30 p-3 text-sm italic leading-relaxed text-muted-foreground ${className ?? ""}`}>
        <Quote className="mb-1 size-3 opacity-60" />
        {reflection.body}
      </blockquote>
    )
  }

  return (
    <div className={`space-y-2.5 ${className ?? ""}`}>
      {sections.map((s) => (
        <div key={s.key} className="rounded-lg border bg-muted/20 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{s.label}</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{reflection[s.key]}</p>
        </div>
      ))}
    </div>
  )
}
