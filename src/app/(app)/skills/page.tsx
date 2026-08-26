import { PageTransition } from "@/components/feedback/page-transition"
import { EmptyState } from "@/components/feedback/empty-state"
import { Sparkles } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { createClient } from "@/lib/supabase/server"
import { getSkillTreeData } from "@/lib/stats/queries"
import { SkillsClient } from "@/components/skills/skills-client"

export const metadata = { title: "Skills — Ascend" }
export const dynamic = "force-dynamic"

export default async function SkillsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <PageTransition>
        <div className="text-sm text-muted-foreground">Not authenticated.</div>
      </PageTransition>
    )
  }

  let tree
  try {
    tree = await getSkillTreeData(supabase)
  } catch {
    tree = null
  }

  const totalSkills = tree?.categories.reduce((s, c) => s + c.branches.reduce((n, b) => n + b.leaves.length, 0), 0) ?? 0

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Skill Tree</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sixteen branches across eight disciplines — grown by quests you actually complete.
          </p>
        </div>

        {!tree || totalSkills === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="The skill tree hasn't been seeded yet"
            description="Run supabase/migrations/0005_stats_skills.sql to plant the tree. Until then, quests keep earning XP safely."
            action={
              <Button asChild>
                <Link href="/quests">Open Quests</Link>
              </Button>
            }
          />
        ) : (
          <SkillsClient tree={tree} />
        )}
      </div>
    </PageTransition>
  )
}
