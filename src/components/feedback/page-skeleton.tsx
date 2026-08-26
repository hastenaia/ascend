import { cn } from "@/lib/utils"

function Bar({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />
}

/** Layout-stable skeletons (uses the existing .skeleton pulse; respects prefers-reduced-motion) */
export function PageSkeleton({ variant = "default" }: { variant?: "default" | "dashboard" | "list" | "charts" }) {
  if (variant === "dashboard") {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="space-y-2">
          <Bar className="h-8 w-64" />
          <Bar className="h-4 w-40" />
        </div>
        <Bar className="h-36 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <Bar className="h-24 w-full rounded-xl" />
            <div className="grid grid-cols-2 gap-3">
              <Bar className="h-20 rounded-xl" />
              <Bar className="h-20 rounded-xl" />
            </div>
          </div>
          <div className="space-y-3">
            <Bar className="h-20 rounded-xl" />
            <Bar className="h-32 rounded-xl" />
            <Bar className="h-28 rounded-xl" />
          </div>
        </div>
      </div>
    )
  }

  if (variant === "charts") {
    return (
      <div className="space-y-6" aria-busy="true">
        <Bar className="h-5 w-48" />
        <Bar className="h-24 w-full rounded-xl" />
        <div className="grid gap-3 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Bar key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  const rows = variant === "list" ? 6 : 4
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="flex items-center justify-between">
        <Bar className="h-5 w-44" />
        <Bar className="h-9 w-28 rounded-lg" />
      </div>
      <div className={cn(variant === "list" ? "space-y-2.5" : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3")}>
        {Array.from({ length: rows }, (_, i) => (
          <Bar key={i} className={cn(variant === "list" ? "h-14 w-full rounded-xl" : "h-36 rounded-2xl")} />
        ))}
      </div>
    </div>
  )
}
