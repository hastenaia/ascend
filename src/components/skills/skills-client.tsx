"use client"
import * as React from "react"
import { motion } from "framer-motion"
import { Lock, CircleDashed, LoaderCircle, CircleCheckBig } from "lucide-react"
import { SkillNode } from "@/components/skills/skill-node"
import { SkillDetails } from "@/components/skills/skill-details"
import { STAT_META, type StatSlug } from "@/lib/stats"
import type { DerivedSkillNode, SkillNodeState } from "@/lib/skills/tree"
import type { SkillTreeData } from "@/lib/stats/queries"
import { cn } from "@/lib/utils"

const LEGEND: { state: SkillNodeState; icon: typeof Lock; label: string }[] = [
  { state: "locked", icon: Lock, label: "Locked" },
  { state: "available", icon: CircleDashed, label: "Available" },
  { state: "in_progress", icon: LoaderCircle, label: "In progress" },
  { state: "unlocked", icon: CircleCheckBig, label: "Unlocked" },
]

const nodeText: Record<SkillNodeState, string> = {
  unlocked: "text-emerald-600 dark:text-emerald-400",
  in_progress: "text-foreground",
  available: "text-muted-foreground",
  locked: "text-muted-foreground/45",
}

export function SkillsClient({ tree }: { tree: SkillTreeData }) {
  const [detail, setDetail] = React.useState<DerivedSkillNode | null>(null)
  const [detailCategory, setDetailCategory] = React.useState<StatSlug | null>(null)
  const [open, setOpen] = React.useState(false)

  function select(node: DerivedSkillNode, category: StatSlug) {
    setDetail(node)
    setDetailCategory(category)
    setOpen(true)
  }

  return (
    <div className="space-y-5">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {LEGEND.map((l) => (
          <span key={l.state} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <l.icon className="size-3.5" /> {l.label}
          </span>
        ))}
        <span className="ml-auto hidden text-[11px] text-muted-foreground/60 sm:block">Select a skill for details</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tree.categories.map((cat, ci) => {
          const meta = STAT_META[cat.slug]
          const Icon = meta.icon
          return (
            <motion.section
              key={cat.slug}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(ci * 0.05, 0.35) }}
              className="sheen overflow-hidden rounded-2xl border bg-card"
            >
              <header className="flex items-center gap-2 border-b bg-muted/20 px-4 py-3">
                <span className="flex size-7 items-center justify-center rounded-lg ascend-gradient text-primary ring-1 ring-primary/20">
                  <Icon className="size-3.5" />
                </span>
                <h2 className="truncate text-xs font-bold uppercase tracking-[0.14em]">{meta.label}</h2>
              </header>

              <div className="space-y-5 p-4">
                {cat.branches.map(({ branch, leaves }) => (
                  <div key={branch.skill.id}>
                    {/* Branch row */}
                    <div className="flex w-full items-center gap-3 text-left">
                      <SkillNode node={branch} onSelect={() => select(branch, cat.slug)} />
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm font-semibold", nodeText[branch.state])}>{branch.skill.name}</p>
                        <p className="font-mono text-[10.5px] text-muted-foreground">
                          {leaves.filter((l) => l.state === "unlocked").length}/{leaves.length} skills
                        </p>
                      </div>
                    </div>

                    {/* Leaves hanging off the branch rail */}
                    <ul className="ml-[19px] mt-2 space-y-2 border-l border-border/70 pl-4">
                      {leaves.map((leaf) => (
                        <li key={leaf.skill.id}>
                          <div className="flex w-full items-center gap-3 rounded-lg px-1 py-1 text-left transition-colors hover:bg-muted/40">
                            <SkillNode node={leaf} onSelect={() => select(leaf, cat.slug)} />
                            <div className="min-w-0 flex-1">
                              <p className={cn("truncate text-[13px] font-medium", nodeText[leaf.state])}>{leaf.skill.name}</p>
                              {leaf.xp > 0 && leaf.state !== "unlocked" && (
                                <p className="font-mono text-[10px] text-muted-foreground">{leaf.xp}/{leaf.skill.unlock_xp} XP</p>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </motion.section>
          )
        })}
      </div>

      <SkillDetails
        node={detail}
        category={detail ? detailCategory : null}
        open={open}
        onOpenChange={setOpen}
      />
    </div>
  )
}
