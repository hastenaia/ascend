"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Route } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { EmptyState } from "@/components/feedback/empty-state"
import { PhaseCard } from "@/components/phases/phase-card"
import { PhaseTimeline } from "@/components/phases/phase-timeline"
import { initializeJourney, beginNextPhase } from "@/lib/phases/actions"

type TimelineItem = { id: string; title: string; order_index: number; status: string; subtitle?: string | null; objective?: string | null; progress?: number; done?: number; total?: number; focusAreas?: string[] }

/* eslint-disable @typescript-eslint/no-explicit-any */
export function JourneyClient({ hasJourney, items, templates }: { hasJourney: boolean; items: TimelineItem[]; templates: TimelineItem[] }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)

  async function handleStart() {
    setBusy(true)
    try {
      const res = await initializeJourney()
      toast.success(res.created ? "Journey started" : "Journey already exists")
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to start")
    } finally {
      setBusy(false)
    }
  }

  async function handleBegin(id: string) {
    try {
      await beginNextPhase(id)
      toast.success("Phase started")
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Cannot start")
    }
  }

  if (!hasJourney) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Journey</h1>
          <p className="text-sm text-muted-foreground">Your full progression arc across every phase — past, present, and next.</p>
        </div>
        <EmptyState icon={Route} title="Your journey hasn't started" description="Complete phases to build a living timeline of who you are becoming. Each phase adds a chapter to your journey." action={<Button onClick={handleStart} disabled={busy}>{busy ? <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null} Start Journey</Button>} />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>These are the template phases. Your journey will be created from them.</CardDescription>
          </CardHeader>
          <CardContent>
            <PhaseTimeline items={templates.map((t) => ({ id: t.id, title: t.title, order_index: t.order_index, status: "locked" as const, subtitle: t.subtitle }))} />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Journey</h1>
        <p className="text-sm text-muted-foreground">Your full progression arc — past, present, and next.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Route className="size-4 text-primary" /> Timeline
              </CardTitle>
              <CardDescription>Strict sequential unlocking · available → active via explicit action</CardDescription>
            </CardHeader>
            <CardContent>
              <PhaseTimeline items={items.map((it) => ({ id: it.id, title: it.title, order_index: it.order_index, status: it.status as any, subtitle: it.subtitle }))} onSelect={() => router.push("/phase")} />
            </CardContent>
          </Card>
        </div>
        <div className="space-y-4">
          {items.map((it) => (
            <PhaseCard
              key={it.id}
              title={it.title}
              subtitle={it.subtitle}
              objective={it.objective}
              status={it.status as any}
              orderIndex={it.order_index}
              progress={it.progress}
              done={it.done}
              total={it.total}
              focusAreas={it.focusAreas}
              onAction={it.status === "available" ? () => handleBegin(it.id) : it.status === "active" ? () => router.push("/phase") : undefined}
              actionLabel={it.status === "available" ? "Begin Phase" : it.status === "active" ? "Continue" : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
