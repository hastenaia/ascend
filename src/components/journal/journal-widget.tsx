"use client"
import Link from "next/link"
import { NotebookPen, ArrowRight, Flame } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { JournalEntry } from "@/lib/journal/queries"

export function JournalWidget({ todays, streak }: { todays: JournalEntry | null; streak: number }) {
  const done = !!todays
  return (
    <Card className="sheen">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><NotebookPen className="size-4 text-primary" /> Daily Journal</CardTitle>
        <CardDescription>{done ? "Today's reflection saved — edit anytime" : "2-minute reflection grows Mental & EQ and keeps streak"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {done ? (
          <div className="rounded-xl border bg-muted/30 p-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Today {todays?.entry_date ?? ""} · {todays?.mood ?? "—"}</p>
            <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-relaxed">{[todays?.learnings, todays?.worked].filter(Boolean).join(" · ").slice(0, 140) || todays?.body?.slice(0, 140) || "Saved"}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-center">
            <p className="text-sm font-medium">No journal yet today</p>
            <p className="mt-1 text-xs text-muted-foreground">Takes 2 minutes — unlocks +12 XP and coach insight</p>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Flame className="size-3 text-orange-500" /> {streak} day streak</span>
          <Button asChild size="sm" className="ml-auto h-8 rounded-full"><Link href="/journal">{done ? "Edit journal" : "Write today"} <ArrowRight className="ml-1 size-3" /></Link></Button>
        </div>
      </CardContent>
    </Card>
  )
}
