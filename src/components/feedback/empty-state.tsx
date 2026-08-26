import * as React from "react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Opportunity-style empty state: abstract concentric "path ahead" visual,
 * calm copy slot, optional action. API preserved.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ElementType
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <Card className={cn("relative overflow-hidden border-dashed", className)}>
      {/* abstract depth: concentric ascent rings */}
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full border border-primary/10" />
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full border border-primary/15" />
      <div aria-hidden className="pointer-events-none absolute -right-1 -top-1 size-3 rounded-full bg-primary/25 blur-[1px]" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 ascend-gradient opacity-60" />

      <CardContent className="relative flex flex-col items-center justify-center px-6 py-12 text-center">
        {Icon ? (
          <div className="mb-5 flex size-14 items-center justify-center rounded-2xl ascend-gradient-strong text-white shadow-md shadow-primary/20 ring-1 ring-primary/30">
            <Icon className="size-6" />
          </div>
        ) : null}
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </CardContent>
    </Card>
  )
}
