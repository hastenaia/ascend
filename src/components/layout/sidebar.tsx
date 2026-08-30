"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { LogOut, Mountain } from "lucide-react"
import { NAV_ITEMS, NAV_GROUP_LABELS, type NavGroup } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"

export type LevelChip = { level: number; progressPct: number; xpToNext: number } | null

const GROUP_ORDER: NavGroup[] = ["overview", "progression", "development", "system"]

export function Sidebar({
  onSignOut,
  userEmail,
  level,
}: {
  onSignOut?: () => void
  userEmail?: string | null
  level?: LevelChip
}) {
  const pathname = usePathname()
  const groups = GROUP_ORDER.map((g) => ({ label: NAV_GROUP_LABELS[g], items: NAV_ITEMS.filter((n) => n.group === g) }))

  return (
    <aside className="hidden lg:flex lg:w-[264px] lg:shrink-0 lg:flex-col lg:border-r lg:bg-sidebar/80 lg:backdrop-blur">
      <div className="sticky top-0 flex h-screen flex-col">
        {/* Brand */}
        <div className="px-5 pb-3 pt-7">
          <Link href="/dashboard" className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl ascend-gradient-strong text-white shadow-md shadow-primary/25 ring-1 ring-primary/40">
              <Mountain className="size-5" />
            </span>
            <span className="flex flex-col">
              <span className="text-[15px] font-bold leading-none tracking-tight">ASCEND</span>
              <span className="mt-1 text-[11px] font-medium leading-none text-muted-foreground">Become better</span>
            </span>
          </Link>

          {/* Level identity */}
          {level ? (
            <div className="mt-5 rounded-xl border bg-card/70 p-3 sheen">
              <div className="flex items-baseline justify-between">
                <p className="stat-num text-sm font-bold text-gradient">LEVEL {level.level}</p>
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {level.xpToNext > 0 ? `${level.xpToNext.toLocaleString()} to go` : "Max"}
                </p>
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary">
                <motion.div
                  className="h-full rounded-full ascend-gradient-strong shimmer"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(3, level.progressPct)}%` }}
                  transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          ) : (
            <p className="mt-4 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">One phase at a time</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          <nav className="space-y-6">
            {groups.map((grp) => (
              <div key={grp.label}>
                <p className="px-3 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">{grp.label}</p>
                <div className="space-y-0.5">
                  {grp.items.map((item) => {
                    const active = pathname === item.href || (item.href !== "/dashboard" && (pathname === item.href || pathname.startsWith(item.href + "/")))
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors",
                          active ? "bg-accent text-accent-foreground shadow-sm" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="sidebar-rail"
                            className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full ascend-gradient-strong"
                            transition={{ type: "spring", stiffness: 500, damping: 40 }}
                          />
                        )}
                        <Icon className={cn("size-4 shrink-0 transition-colors", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
                        <span className="flex-1 truncate">{item.label}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="border-t p-3">
          <div className="mb-3 flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2.5">
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
