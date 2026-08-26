"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { initializeJourney } from "@/lib/phases/actions"
import { Button } from "@/components/ui/button"

export function JourneyInit() {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)

  async function init() {
    setBusy(true)
    try {
      await initializeJourney()
      toast.success("Journey created")
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not initialize journey")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button onClick={init} disabled={busy}>
      {busy ? "Creating…" : "Initialize Journey"}
    </Button>
  )
}
