"use client"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/feedback/empty-state"
import { AlertTriangle } from "lucide-react"

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-12">
      <EmptyState icon={AlertTriangle} title="Something went wrong" description={error.message || "An unexpected error occurred. Try again."} action={<Button onClick={reset}>Try again</Button>} />
    </div>
  )
}
