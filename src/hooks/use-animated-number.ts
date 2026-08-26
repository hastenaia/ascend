"use client"
import * as React from "react"
import { useReducedMotion } from "framer-motion"

/** Smoothly counts a number up when the target changes. Honors prefers-reduced-motion. */
export function useAnimatedNumber(target: number, duration = 900): number {
  const reduced = useReducedMotion()
  const [value, setValue] = React.useState(reduced ? target : 0)
  const fromRef = React.useRef(0)

  React.useEffect(() => {
    if (reduced) {
      setValue(target)
      return
    }
    const from = fromRef.current
    const start = performance.now()
    let raf: number
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const next = Math.round(from + (target - from) * eased)
      setValue(next)
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, reduced])

  React.useEffect(() => {
    // Keep ref in sync if value was set directly (reduced motion)
    fromRef.current = value
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return value
}
