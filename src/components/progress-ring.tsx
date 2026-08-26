"use client"
import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"

type Props = {
  value: number // 0-100
  size?: number
  strokeWidth?: number
  className?: string
  trackClassName?: string
  children?: React.ReactNode
}

/** Elegant SVG radial progress with animated sweep. Honors reduced motion. */
export function ProgressRing({ value, size = 96, strokeWidth = 8, className, trackClassName, children }: Props) {
  const reduced = useReducedMotion()
  const v = Math.max(0, Math.min(100, value))
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={strokeWidth} className={cn("stroke-secondary", trackClassName)} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="stroke-primary"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - (c * v) / 100 }}
          transition={{ duration: reduced ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      {children ? <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div> : null}
    </div>
  )
}
