"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Sidebar } from "@/components/layout/sidebar"
import { MobileHeader, BottomNav } from "@/components/layout/mobile-nav"
import { Topbar } from "@/components/layout/topbar"
import { toast } from "sonner"
import type { LevelChip } from "@/components/layout/sidebar"

export function AppShell({
  children,
  userEmail,
  displayName,
  level,
}: {
  children: React.ReactNode
  userEmail?: string | null
  displayName?: string | null
  level?: LevelChip
}) {
  const router = useRouter()
  const [signingOut, setSigningOut] = React.useState(false)

  async function handleSignOut() {
    if (signingOut) return
    setSigningOut(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      toast.success("Signed out")
      router.push("/auth/login")
      router.refresh()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to sign out"
      toast.error(msg)
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="ambient-bg flex min-h-screen">
      <Sidebar onSignOut={handleSignOut} userEmail={userEmail} level={level} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader onSignOut={handleSignOut} userEmail={userEmail} level={level} />
        <Topbar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 lg:px-6 lg:pb-10">{children}</main>
        <BottomNav />
      </div>
    </div>
  )
}
