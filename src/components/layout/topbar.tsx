"use client"
import { usePathname } from "next/navigation"
import { NAV_ITEMS } from "@/lib/nav"

export function Topbar() {
  const pathname = usePathname()
  const current = NAV_ITEMS.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"))
  return (
    <div className="hidden border-b bg-background/60 backdrop-blur supports-[backdrop-filter]:bg-background/40 lg:block">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight">{current?.label ?? "Ascend"}</h1>
          <p className="text-xs text-muted-foreground">{current?.description ?? "Become better, one phase at a time."}</p>
        </div>
        <div className="hidden items-center gap-2 text-xs text-muted-foreground md:flex">
          <span className="rounded-full border bg-card px-3 py-1">Goal → Phase → Quests → XP</span>
        </div>
      </div>
    </div>
  )
}
