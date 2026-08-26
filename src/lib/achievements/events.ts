import type { UnlockedAchievement } from "@/types/database"

export const ACHIEVEMENT_EVENT = "ascend:achievements-unlocked"

/**
 * Fire-and-forget bridge from completion flows to the global unlock overlay.
 * Called inside client event handlers after an RPC reports fresh unlocks.
 */
export function announceUnlockedAchievements(list?: UnlockedAchievement[] | null): void {
  if (!list || list.length === 0 || typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent<UnlockedAchievement[]>(ACHIEVEMENT_EVENT, { detail: list }))
}
