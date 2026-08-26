"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CalendarCheck, Coffee, Moon, NotebookPen, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { logRecoveryAction, type RecoveryKind } from "@/lib/momentum/actions"

const OPTIONS: { kind: RecoveryKind; label: string; icon: LucideIcon; hint: string }[] = [
  { kind: "rest", label: "Rest day", icon: Moon, hint: "Full recovery — the growth happens here." },
  { kind: "light", label: "Light day", icon: Coffee, hint: "Something small still counts." },
  { kind: "reflection", label: "Reflection", icon: NotebookPen, hint: "Look back to move forward." },
  { kind: "planning", label: "Planning", icon: CalendarCheck, hint: "Set up tomorrow's wins." },
]

export function WellnessCard({ recoveryKindsToday }: { recoveryKindsToday: string[] }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<RecoveryKind | null>(null)

  async function log(kind: RecoveryKind) {
    setBusy(kind)
    try {
      await logRecoveryAction(kind)
      toast.success("Logged — recovery counts as training")
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not log recovery")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Rest is part of training. Log lighter days without losing momentum — sustainable beats extreme, every time.
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {OPTIONS.map(({ kind, label, icon: Icon }) => {
          const logged = recoveryKindsToday.includes(kind)
          return (
            <button
              key={kind}
              type="button"
              disabled={busy === kind || logged}
              onClick={() => log(kind)}
              title={logged ? `${label} logged today` : undefined}
              className={cn(
                "flex flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition-colors",
                logged ? "border-primary/30 bg-primary/5" : "hover:border-primary/40 hover:bg-muted/40",
                "disabled:cursor-default",
              )}
            >
              <Icon className={cn("size-4", logged ? "text-primary" : "text-muted-foreground")} />
              <span className="text-xs font-semibold">{label}</span>
              <span className="text-[9.5px] uppercase tracking-wider text-muted-foreground">{logged ? "logged today" : "mark it"}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function WellnessFooter() {
  return (
    <Button variant="ghost" size="sm" className="h-auto px-2 py-1 text-[10px] text-muted-foreground" asChild>
      <a href="https://www.cdc.gov/physical-activity-basics/index.html" target="_blank" rel="noreferrer noopener">
        Health first — never train through injury or exhaustion.
      </a>
    </Button>
  )
}
