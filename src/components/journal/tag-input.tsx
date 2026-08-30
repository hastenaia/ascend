"use client"
import * as React from "react"
import { X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = React.useState("")

  function addFromDraft() {
    const t = draft.trim().toLowerCase()
    if (!t) return
    if (t.length > 24) return
    if (value.includes(t)) return
    if (value.length >= 8) return
    onChange([...value, t])
    setDraft("")
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Tags</Label>
      <div className="flex flex-wrap gap-1.5">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs">
            {tag}
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => onChange(value.filter((v) => v !== tag))} className="rounded-full p-0.5 hover:bg-muted-foreground/10">
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              addFromDraft()
            }
          }}
          placeholder={value.length >= 8 ? "Max 8 tags" : "Add tag + Enter"}
          disabled={value.length >= 8}
          className="h-8 max-w-[200px] rounded-full text-xs"
        />
      </div>
      <p className="text-[11px] text-muted-foreground">Max 8 · 24 chars · lowercased, no duplicates. Press Enter to add. Back-dated entries keep tags but no XP.</p>
    </div>
  )
}
