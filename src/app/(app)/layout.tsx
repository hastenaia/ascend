import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AppShell } from "@/components/layout/app-shell"

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Middleware already guards, but server check prevents flash
  if (!user) redirect("/auth/login")

  return <AppShell userEmail={user.email}>{children}</AppShell>
}
