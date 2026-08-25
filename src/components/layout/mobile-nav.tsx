"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, Mountain } from "lucide-react"
import { NAV_ITEMS, MOBILE_PRIMARY_HREFS } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/theme-toggle"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

export function MobileHeader({ onSignOut, userEmail }: { onSignOut?: () => void; userEmail?: string | null }) {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 lg:hidden">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="size-9">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] overflow-y-auto p-0">
          <SheetHeader className="border-b px-5 py-5 text-left">
            <SheetTitle className="flex items-center gap-3 text-left">
              <span className="flex size-9 items-center justify-center rounded-xl ascend-gradient-strong text-white">
                <Mountain className="size-5" />
              </span>
              <span>
                <span className="block text-sm font-bold tracking-tight">ASCEND</span>
                <span className="block text-xs font-normal text-muted-foreground">Become better, one phase at a time.</span>
              </span>
            </SheetTitle>
          </SheetHeader>
          <nav className="space-y-1 p-3">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href
              const Icon = item.icon
              return (
                <Link key={item.href} href={item.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium", active ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              )
            })}
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
        <span className="flex size-8 items-center justify-center rounded-lg ascend-gradient-strong text-white">
          <Mountain className="size-4" />
        </span>
        <span className="text-sm font-bold tracking-tight">ASCEND</span>
      </Link>

      <ThemeToggle />
    </header>
  )
}

export function BottomNav() {
  const pathname = usePathname()
  const items = NAV_ITEMS.filter((n) => (MOBILE_PRIMARY_HREFS as readonly string[]).includes(n.href))
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-1.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/")
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href} className={cn("flex flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-medium transition-colors", active ? "text-primary" : "text-muted-foreground")}>
              <Icon className={cn("size-5", active && "text-primary")} />
              <span className="leading-none">{item.label === "Current Phase" ? "Phase" : item.label === "AI Coach" ? "Coach" : item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
