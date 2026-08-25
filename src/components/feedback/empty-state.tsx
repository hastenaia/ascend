import * as React from "react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

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
    <Card className={cn("border-dashed", className)}>
      <CardContent className="flex flex-col items-center justify-center px-6 py-12 text-center">
        {Icon ? (
          <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-accent text-primary ring-1 ring-border">
            <Icon className="size-7" />
          </div>
        ) : null}
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </CardContent>
    </Card>
  )
}
