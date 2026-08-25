"use client"
import * as React from "react"
import { cn } from "@/lib/utils"

export function Progress({ value = 0, className, indicatorClassName }: { value?: number; className?: string; indicatorClassName?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <div className={cn("h-full rounded-full transition-all duration-700 ease-out ascend-gradient-strong", indicatorClassName)} style={{ width: `${v}%` }} />
    </div>
  )
}
