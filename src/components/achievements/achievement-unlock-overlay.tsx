"use client"
import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Trophy } from "lucide-react"
import { ACHIEVEMENT_EVENT } from "@/lib/achievements/events"
import type { UnlockedAchievement } from "@/types/database"

const DISPLAY_MS = 4500

/**
 * Global achievement unlock overlay. Listens for ACHIEVEMENT_EVENT dispatched
 * by any completion flow and plays a queued, subtle premium reveal.
 */
export function AchievementUnlockOverlay() {
  const reduced = useReducedMotion()
  const [queue, setQueue] = React.useState<UnlockedAchievement[]>([])
  const current = queue[0] ?? null

  React.useEffect(() => {
    function onUnlock(e: Event) {
      const detail = (e as CustomEvent<UnlockedAchievement[]>).detail
      if (!Array.isArray(detail) || detail.length === 0) return
      setQueue((q) => [...q, ...detail])
    }
    window.addEventListener(ACHIEVEMENT_EVENT, onUnlock)
    return () => window.removeEventListener(ACHIEVEMENT_EVENT, onUnlock)
  }, [])

  const dismiss = React.useCallback(() => {
    setQueue((q) => q.slice(1))
  }, [])

  React.useEffect(() => {
    if (!current) return
    const t = setTimeout(dismiss, DISPLAY_MS)
    return () => clearTimeout(t)
  }, [current, dismiss])

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={`${current.slug}-${queue.length}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={dismiss}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-background/60 p-6 backdrop-blur-sm"
          role="status"
          aria-live="polite"
        >
          <motion.div
            initial={reduced ? { scale: 0.98 } : { scale: 0.85, y: 16 }}
            animate={reduced ? { scale: 1 } : { scale: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { scale: 0.95, y: -8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-[hsl(var(--gold)/0.35)] bg-card p-8 text-center shadow-2xl"
          >
            <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-20 mx-auto size-56 rounded-full bg-[hsl(var(--gold)/0.18)] blur-3xl" />
            <motion.p
              initial={reduced ? false : { letterSpacing: "0.5em", opacity: 0 }}
              animate={{ letterSpacing: "0.28em", opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="text-[11px] font-bold uppercase text-muted-foreground"
            >
              Achievement Unlocked
            </motion.p>
            <motion.div
              initial={reduced ? false : { scale: 0, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.12, type: "spring", stiffness: 260, damping: 18 }}
              className="relative mx-auto mt-5 flex size-16 items-center justify-center rounded-2xl bg-[hsl(var(--gold)/0.12)] ring-1 ring-[hsl(var(--gold)/0.45)]"
            >
              <Trophy className="size-8 text-[hsl(var(--gold))]" />
              {!reduced && (
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-2xl ring-2 ring-[hsl(var(--gold)/0.4)]"
                  animate={{ scale: [1, 1.25], opacity: [0.7, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                />
              )}
            </motion.div>
            <h2 className="mt-4 text-xl font-bold tracking-tight">{current.name}</h2>
            {current.flavor && <p className="mt-1.5 text-sm italic leading-relaxed text-muted-foreground">&ldquo;{current.flavor}&rdquo;</p>}
            <span className="mt-4 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--gold)/0.14)] px-3 py-1 font-mono text-xs font-bold text-[hsl(var(--gold))]">
              +{current.xp_reward} XP
            </span>
            <p className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground/70">Tap to continue</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
