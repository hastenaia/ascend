"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { LogOut, Mountain } from "lucide-react"
import { NAV_ITEMS } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"

export function Sidebar({ onSignOut, userEmail }: { onSignOut?: () => void; userEmail?: string | null }) {
  const pathname = usePathname()
  const groups: Array<{ label: string; items: typeof NAV_ITEMS }> = [
    { label: "Ascend", items: NAV_ITEMS.filter((n) => n.group === "primary") },
    { label: "Growth", items: NAV_ITEMS.filter((n) => n.group === "growth") },
    { label: "System", items: NAV_ITEMS.filter((n) => n.group === "system") },
  ]

  return (
    <aside className="hidden lg:flex lg:w-[264px] lg:shrink-0 lg:flex-col lg:border-r lg:bg-sidebar">
      <div className="sticky top-0 flex h-screen flex-col">
        {/* Brand */}
        <div className="px-5 pb-4 pt-7">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl ascend-gradient-strong text-white shadow-sm">
              <Mountain className="size-5" />
            </span>
            <span className="flex flex-col">
              <span className="text-[15px] font-bold leading-none tracking-tight">ASCEND</span>
              <span className="text-[11px] font-medium leading-none text-muted-foreground">Become better</span>
            </span>
          </Link>
          <p className="mt-4 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">One phase at a time</p>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          <nav className="space-y-6">
            {groups.map((grp) => (
              <div key={grp.label}>
                <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">{grp.label}</p>
                <div className="space-y-1">
                  {grp.items.map((item) => {
                    const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                          active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                        )}
                      >
                        <Icon className={cn("size-4 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {active ? <motion.span layoutId="sidebar-active" className="size-1.5 rounded-full bg-primary" /> : null}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="border-t p-3">
          <div className="mb-3 flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{userEmail ?? "Guest"}</p>
              <p className="text-[11px] text-muted-foreground">Ascend member</p>
            </div>
            <ThemeToggle />
          </div>
          {onSignOut ? (
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={onSignOut}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  )
}
