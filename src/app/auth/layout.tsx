import Link from "next/link"
import { Mountain } from "lucide-react"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="ascend-gradient absolute inset-0 -z-10" />
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col">
        <header className="flex items-center justify-between px-6 py-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-xl ascend-gradient-strong text-white">
              <Mountain className="size-5" />
            </span>
            <span className="text-sm font-bold tracking-tight">ASCEND</span>
          </Link>
          <span className="hidden text-xs text-muted-foreground md:block">Goal → Phase → Quests → XP → Skills</span>
        </header>
        <div className="flex flex-1 items-center justify-center px-4 py-10">{children}</div>
        <footer className="px-6 py-6 text-center text-xs text-muted-foreground">Become better, one phase at a time.</footer>
      </div>
    </div>
  )
}
