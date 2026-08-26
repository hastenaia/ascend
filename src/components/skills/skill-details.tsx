"use client"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { SkillProgress } from "@/components/skills/skill-progress"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ScrollText, Network, Layers, Check, Lock } from "lucide-react"
import { STAT_META, type StatSlug } from "@/lib/stats"
import type { DerivedSkillNode } from "@/lib/skills/tree"

const stateBadge: Record<string, string> = {
  unlocked: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-transparent",
  in_progress: "bg-primary/10 text-primary border-transparent",
  available: "",
  locked: "bg-muted text-muted-foreground border-transparent",
}

type Props = {
  node: DerivedSkillNode | null
  category: StatSlug | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function SkillDetails({ node, category, open, onOpenChange }: Props) {
  if (!node) return null
  const isBranch = node.skill.parent_id === null
  const statMeta = category ? STAT_META[category] : null
  const StateIcon = node.state === "unlocked" ? Check : node.state === "in_progress" ? Layers : Lock

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 pr-6">
            <span className="text-base font-semibold">{node.skill.name}</span>
            <Badge variant="outline" className={`rounded-full text-[10px] capitalize ${stateBadge[node.state]}`}>
              <StateIcon className="mr-1 size-3" /> {node.state.replace("_", " ")}
            </Badge>
          </SheetTitle>
          <p className="text-sm leading-relaxed text-muted-foreground [text-align:left]">
            {statMeta ? `${statMeta.label} tree · ` : ""}
            {node.skill.description}
          </p>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {!isBranch && (
            <div className="rounded-xl border bg-card p-4">
              <SkillProgress xp={node.xp} unlockXp={node.skill.unlock_xp} />
            </div>
          )}

          <div className="rounded-xl border bg-gradient-to-br from-primary/[0.06] to-transparent p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {isBranch ? <Network className="size-3.5" /> : <ScrollText className="size-3.5" />}
              How to train
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              {isBranch
                ? "Complete quests linked to any skill in this branch. Branch progress rises as its skills grow."
                : "Create a quest and link it to this skill. Completing it grants full XP here and half to the branch."}
            </p>
            <Button asChild size="sm" variant="outline" className="mt-3 w-full">
              <Link href="/quests">Go to quests</Link>
            </Button>
          </div>

          <p className="text-[10.5px] leading-relaxed text-muted-foreground/70">
            Progress comes only from quests you actually complete — there are no purchasable or simulated skill points.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
