"use client"
import * as React from "react"
import { useReducedMotion } from "framer-motion"

/** Smoothly counts toward `target`. Honors prefers-reduced-motion (instant jump). */
export function useAnimatedNumber(target: number, duration = 900): number {
  const reduced = useReducedMotion()
  const [value, setValue] = React.useState(reduced ? target : 0)
  const latestRef = React.useRef(value)

  React.useEffect(() => {
    let raf = 0
    const from = latestRef.current
    const start = performance.now()
    const tick = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      const v = Math.round(from + (target - from) * eased)
      latestRef.current = v
      setValue(v)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration, reduced])

  return value
}
