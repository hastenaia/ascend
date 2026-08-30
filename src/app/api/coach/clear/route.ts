import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { clearHistory } from "@/lib/coach/history"

export const runtime = "nodejs"

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  await clearHistory(supabase, user.id)
  return NextResponse.json({ ok: true })
}
