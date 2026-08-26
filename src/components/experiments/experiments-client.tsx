"use client"
import * as React from "react"
import { ExperimentCard } from "@/components/experiments/experiment-card"
import { ExperimentDetail } from "@/components/experiments/experiment-detail"
import type { ExperimentWithStats } from "@/lib/experiments/queries"

export function ExperimentsClient({ experiments }: { experiments: ExperimentWithStats[] }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState(false)

  const selected = experiments.find((e) => e.experiment.id === selectedId) ?? null

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {experiments.map((exp) => (
          <ExperimentCard
            key={exp.experiment.id}
            data={exp}
            onSelect={() => {
              setSelectedId(exp.experiment.id)
              setOpen(true)
            }}
          />
        ))}
      </div>
      <ExperimentDetail data={selected} open={open} onOpenChange={setOpen} />
    </>
  )
}
