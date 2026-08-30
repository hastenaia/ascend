"use client"
import { Flame, CalendarDays } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

export function JournalStreak({ streak, count }: { streak: number; count: number }) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex items-center gap-4 p-4">
        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm"><Flame className="size-5" /></span>
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Journal streak</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">{streak} <span className="text-sm font-medium text-muted-foreground">days</span></p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground"><CalendarDays className="size-3" /> {count} total entries</p>
        </div>
      </CardContent>
    </Card>
  )
}
