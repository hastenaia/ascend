"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion } from "framer-motion"
import { Menu, Mountain } from "lucide-react"
import { NAV_ITEMS, NAV_GROUP_LABELS, MOBILE_PRIMARY_HREFS, type NavGroup } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

type LevelChip = { level: number; progressPct: number; xpToNext: number } | null

const GROUP_ORDER: NavGroup[] = ["overview", "progression", "development", "system"]

export function MobileHeader({
  onSignOut,
  userEmail,
  level,
}: {
  onSignOut?: () => void
  userEmail?: string | null
  level?: LevelChip
}) {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 px-4 lg:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="size-10">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] overflow-y-auto p-0">
          <SheetHeader className="border-b px-5 py-5 text-left">
            <SheetTitle className="flex items-center gap-3 text-left">
              <span className="flex size-9 items-center justify-center rounded-xl ascend-gradient-strong text-white shadow-md shadow-primary/25 ring-1 ring-primary/40">
                <Mountain className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-bold tracking-tight">ASCEND</span>
                <span className="block text-xs font-normal text-muted-foreground">Become better, one phase at a time.</span>
              </span>
            </SheetTitle>
          </SheetHeader>
          {level ? (
            <div className="mx-3 mt-3 rounded-xl border bg-card p-3">
              <p className="stat-num text-sm font-bold text-gradient">LEVEL {level.level}</p>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full ascend-gradient-strong" style={{ width: `${Math.max(3, level.progressPct)}%` }} />
              </div>
            </div>
          ) : null}
          <nav className="space-y-4 p-3 pb-5">
            {GROUP_ORDER.map((g) => (
              <div key={g}>
                <p className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60">{NAV_GROUP_LABELS[g]}</p>
                <div className="space-y-0.5">
                  {NAV_ITEMS.filter((n) => n.group === g).map((item) => {
                    const active = pathname === item.href
                    const Icon = item.icon
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium",
                          active ? "bg-accent text-accent-foreground" : "text-muted-foreground"
                        )}
                      >
                        <Icon className={cn("size-4", active && "text-primary")} />
                        {item.label}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{userEmail ?? "Guest"}</span>
              <ThemeToggle />
            </div>
            {onSignOut ? (
              <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onSignOut}>
                Sign out
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg ascend-gradient-strong text-white shadow-sm shadow-primary/25 ring-1 ring-primary/30">
          <Mountain className="size-4" />
        </span>
        <span className="text-sm font-bold tracking-tight">ASCEND</span>
      </Link>

      {level ? (
        <Link href="/dashboard" className="rounded-full border bg-card px-2.5 py-1 text-[11px] font-semibold text-primary stat-num">
          LVL {level.level}
        </Link>
      ) : (
        <ThemeToggle />
      )}
    </header>
  )
}

export function BottomNav() {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((n) => (MOBILE_PRIMARY_HREFS as readonly string[]).includes(n.href))
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-w-[56px] flex-col items-center gap-0.5 rounded-xl px-3 py-2 transition-colors",
                active ? "text-primary" : "text-muted-foreground active:text-foreground"
              )}
            >
              {active && (
                <motion.span layoutId="bottomnav-pill" className="absolute inset-x-2 -top-[7px] h-[3px] rounded-full ascend-gradient-strong shadow-[0_0_12px_hsl(252_80%_62%/0.6)]" />
              )}
              <Icon className={cn("size-[22px]", active && "drop-shadow-[0_0_8px_hsl(252_80%_62%/0.45)]")} />
              <span className="text-[10px] font-medium leading-none">{item.label === "Current Phase" ? "Phase" : item.label === "AI Coach" ? "Coach" : item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
