"use client"
import * as React from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check } from "lucide-react"

type Props = {
  visible: boolean
  xp: number
  onDone?: () => void
}

/** Subtle completion flourish: ring + check + floating XP. Auto-fades; honors reduced motion. */
export function QuestCompletionAnimation({ visible, xp, onDone }: Props) {
  const reduced = useReducedMotion()
  React.useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => onDone?.(), 1400)
    return () => clearTimeout(t)
  }, [visible, onDone])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="absolute size-28 rounded-full border-2 border-emerald-400/50"
            initial={{ scale: 0.4, opacity: 0.9 }}
            animate={{ scale: reduced ? 1 : 1.9, opacity: 0 }}
            transition={{ duration: reduced ? 0.6 : 1.1, ease: "easeOut" }}
          />
          <motion.div
            className="flex size-20 flex-col items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
            initial={{ scale: 0.5, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
          >
            <Check className="size-7" strokeWidth={2.5} />
          </motion.div>
          <motion.span
            className="absolute mt-24 text-sm font-bold tracking-wide text-emerald-600 dark:text-emerald-400"
            initial={{ opacity: 0, y: 10 }}
            animate={reduced ? { opacity: 1, y: 0 } : { opacity: [0, 1, 1, 0], y: 34 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0.5 : 1.3, times: [0, 0.25, 0.75, 1] }}
          >
            +{xp} XP
          </motion.span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
