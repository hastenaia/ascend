"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Sidebar } from "@/components/layout/sidebar"
import { MobileHeader, BottomNav } from "@/components/layout/mobile-nav"
import { Topbar } from "@/components/layout/topbar"
import { toast } from "sonner"

export function AppShell({ children, userEmail }: { children: React.ReactNode; userEmail?: string | null }) {
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
    <div className="flex min-h-screen bg-background">
      <Sidebar onSignOut={handleSignOut} userEmail={userEmail} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileHeader onSignOut={handleSignOut} userEmail={userEmail} />
        <Topbar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-24 lg:px-6 lg:pb-6">{children}</main>
        <BottomNav />
      </div>
    </div>
  )
}
