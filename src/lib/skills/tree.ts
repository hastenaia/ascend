/**
 * Skill tree derivation rules. Catalog rows (branches/leaves) live in the DB
 * (seeded by migration 0005); this module derives each node's STATE purely from
 * real progress ledgers (user_skills xp) — no fake progress.
 *
 * States:
 *   locked      — prerequisite branch not yet unlocked
 *   available   — reachable now, no XP yet
 *   in_progress — has some XP but below unlock threshold
 *   unlocked    — XP >= LEAF_UNLOCK_XP (leaf) / contains an unlocked leaf (branch)
 */

export const LEAF_UNLOCK_XP = 100 // keep in sync with skills.unlock_xp seed default
export const BRANCH_XP_SHARE = 0.5 // parent branch earns half of leaf awards (SQL-side)

export type SkillNodeState = "locked" | "available" | "in_progress" | "unlocked"

export type SkillCatalogRow = {
  id: string
  slug: string
  name: string
  description: string | null
  category: string | null
  parent_id: string | null
  sort_order: number
  unlock_xp: number
}

export type UserSkillRow = { skill_id: string; xp: number }

export type DerivedSkillNode = {
  skill: SkillCatalogRow
  xp: number
  progressPct: number
  state: SkillNodeState
}

export function isLeaf(skill: SkillCatalogRow): boolean {
  return skill.parent_id !== null
}

export function deriveLeafState(xp: number, parentReachable: boolean): SkillNodeState {
  if (xp >= LEAF_UNLOCK_XP) return "unlocked"
  if (xp > 0) return "in_progress"
  return parentReachable ? "available" : "locked"
}

/**
 * Derive states for one category's branches+leaves.
 * Branch gating: first branch (by sort_order) is always available;
 * later branches require ≥1 unlocked leaf in any earlier sibling branch.
 */
export function deriveCategoryNodes(
  branches: SkillCatalogRow[],
  leavesByBranch: Record<string, SkillCatalogRow[]>,
  xpBySkillId: Map<string, number>
): { branches: { branch: DerivedSkillNode; leaves: DerivedSkillNode[] }[] } {
  const sorted = [...branches].sort((a, b) => a.sort_order - b.sort_order)
  const result: { branch: DerivedSkillNode; leaves: DerivedSkillNode[] }[] = []
  let anyUnlockedSoFar = false

  for (const branch of sorted) {
    const branchXp = xpBySkillId.get(branch.id) ?? 0
    const leaves = [...(leavesByBranch[branch.id] ?? [])].sort((a, b) => a.sort_order - b.sort_order)

    const branchReachable = branch.sort_order === 0 || anyUnlockedSoFar
    const derivedLeaves: DerivedSkillNode[] = leaves.map((leaf) => {
      const xp = xpBySkillId.get(leaf.id) ?? 0
      return {
        skill: leaf,
        xp,
        progressPct: Math.min(100, Math.round((xp / Math.max(1, leaf.unlock_xp)) * 100)),
        state: deriveLeafState(xp, branchReachable),
      }
    })

    const childUnlocked = derivedLeaves.some((l) => l.state === "unlocked")
    const childActive = derivedLeaves.some((l) => l.state === "in_progress" || l.state === "unlocked")

    const branchState: SkillNodeState = childUnlocked
      ? "unlocked"
      : childActive || branchXp > 0
        ? "in_progress"
        : branchReachable
          ? "available"
          : "locked"

    result.push({
      branch: {
        skill: branch,
        xp: branchXp,
        progressPct: Math.min(
          100,
          Math.round((derivedLeaves.reduce((s, l) => s + l.progressPct, 0) / Math.max(1, derivedLeaves.length)))
        ),
        state: branchState,
      },
      leaves: derivedLeaves,
    })

    if (childUnlocked) anyUnlockedSoFar = true
  }

  return { branches: result }
}
