"use client"
import { motion, useReducedMotion } from "framer-motion"

/** Fast, GPU-only page transition (transform/opacity). Immediate-feeling by design. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.16, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  )
}
