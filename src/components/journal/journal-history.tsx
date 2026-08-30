"use client"
import { motion, useReducedMotion } from "framer-motion"
import { CalendarDays, NotebookPen, Quote, Link2, Tag } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { JournalEntry } from "@/lib/journal/queries"

const moodEmoji: Record<string, string> = { terrible: "😔", low: "😕", okay: "😐", good: "🙂", great: "🤩" }

export function JournalHistory({ entries }: { entries: JournalEntry[] }) {
  const reduced = useReducedMotion()
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/30 p-6 text-center">
        <NotebookPen className="mx-auto size-5 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No journal entries yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Your daily reflections will appear here — each one grows your character and momentum.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {entries.map((e, i) => {
        const hasStructured = !!(e.learnings || e.worked || e.didnt_work || e.change_plan)
        return (
          <motion.article
            key={e.id}
            initial={reduced ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.25, delay: reduced ? 0 : Math.min(i * 0.04, 0.3) }}
            className="rounded-xl border bg-card p-4"
          >
            <header className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
                <NotebookPen className="size-3.5 text-primary" /> {e.entry_date ?? e.created_at.slice(0, 10)}
              </span>
              {e.mood && <Badge variant="outline" className="rounded-full text-xs">{moodEmoji[e.mood] ?? ""} {e.mood}</Badge>}
              <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground"><CalendarDays className="size-3" /> {(e.updated_at ?? e.created_at).slice(0, 16).replace("T", " ")}</span>
            </header>
            {(e.phaseTitle || e.questTitle) && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Link2 className="size-3" /> {e.phaseTitle ? `Phase: ${e.phaseTitle}` : ""} {e.phaseTitle && e.questTitle ? " · " : ""} {e.questTitle ? `Quest: ${e.questTitle}` : ""}</p>
            )}
            {e.tags && e.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {e.tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-[10px]"><Tag className="size-3" /> {t}</span>
                ))}
              </div>
            )}
            <div className="mt-3 space-y-2">
              {hasStructured ? (
                <>
                  {e.learnings && <Section label="Learned" text={e.learnings} />}
                  {e.worked && <Section label="Worked" text={e.worked} />}
                  {e.didnt_work && <Section label="Didn't work" text={e.didnt_work} />}
                  {e.change_plan && <Section label="Will change" text={e.change_plan} />}
                  {e.body && <p className="whitespace-pre-line rounded-lg bg-muted/30 p-3 text-sm leading-relaxed">{e.body}</p>}
                </>
              ) : (
                <blockquote className="rounded-lg bg-muted/30 p-3 text-sm italic leading-relaxed"><Quote className="mb-1 size-3 opacity-60" /> {e.body}</blockquote>
              )}
            </div>
          </motion.article>
        )
      })}
    </div>
  )
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{text}</p>
    </div>
  )
}
