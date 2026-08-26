"use client"
import * as React from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Bot, CornerDownLeft, Sparkles, User } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { COACH_UNAVAILABLE_MESSAGE, SUGGESTED_PROMPTS, type CoachMsg } from "@/components/coach/types"

export function CoachChat({ initialHistory }: { initialHistory: CoachMsg[] }) {
  const reduced = useReducedMotion()
  const [messages, setMessages] = React.useState<CoachMsg[]>(initialHistory)
  const [input, setInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: reduced ? "auto" : "smooth" })
  }, [messages, loading, reduced])

  async function send(text: string) {
    const message = text.trim()
    if (!message || loading) return
    setInput("")
    setMessages((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "…" }])
    setLoading(true)
    try {
      const res = await fetch("/api/coach/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      })
      const json = (await res.json()) as { ok?: boolean; reply?: string; error?: string }
      setMessages((m) => {
        const next = [...m]
        const placeholder = next[next.length - 1]
        if (json.ok && json.reply) {
          if (placeholder?.role === "assistant") next[next.length - 1] = { role: "assistant", content: json.reply }
          else next.push({ role: "assistant", content: json.reply })
        } else {
          const note = json.error === "rate_limited" ? "Too many requests — take a short break." : COACH_UNAVAILABLE_MESSAGE
          if (placeholder?.role === "assistant") next[next.length - 1] = { role: "assistant", content: note, unavailableFlag: true } as CoachMsg & { unavailableFlag?: boolean }
          else next.push({ role: "assistant", content: note })
        }
        return next
      })
    } catch {
      setMessages((m) => {
        const next = [...m]
        const placeholder = next[next.length - 1]
        if (placeholder?.role === "assistant") next[next.length - 1] = { role: "assistant", content: COACH_UNAVAILABLE_MESSAGE }
        return next
      })
    } finally {
      setLoading(false)
    }
  }

  const empty = messages.length === 0

  return (
    <div className="flex h-[560px] flex-col overflow-hidden rounded-2xl border bg-card">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl ascend-gradient-strong text-white shadow-md">
              <Sparkles className="size-5" />
            </span>
            <div>
              <p className="text-sm font-semibold">Your coach knows your phases, quests, and momentum.</p>
              <p className="mt-1 text-xs text-muted-foreground">Ask anything about your growth — or start with a suggestion.</p>
            </div>
            <div className="flex max-w-md flex-wrap justify-center gap-1.5">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => send(p.text)}
                  className="rounded-full border bg-muted/40 px-3 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <motion.div
              key={i}
              initial={reduced ? false : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("flex items-start gap-2.5", m.role === "user" && "flex-row-reverse")}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-lg ring-1",
                  m.role === "user" ? "bg-muted ring-border text-muted-foreground" : "ascend-gradient-strong ring-primary/30 text-white",
                )}
              >
                {m.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
              </span>
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  m.role === "user"
                    ? "rounded-tr-sm bg-primary text-primary-foreground"
                    : "rounded-tl-sm border bg-background",
                )}
              >
                {m.content}
              </div>
            </motion.div>
          ))
        )}
        {loading && (
          <div className="flex items-center gap-2 pl-9 text-xs text-muted-foreground">
            <span className="flex gap-1">
              {[0, 1, 2].map((d) => (
                <motion.span
                  key={d}
                  className="size-1.5 rounded-full bg-primary/60"
                  animate={reduced ? undefined : { opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity, delay: d * 0.18 }}
                />
              ))}
            </span>
            Thinking…
          </div>
        )}
      </div>

      <div className="border-t p-3">
        <div className="flex items-end gap-2">
          <Textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder="Ask your coach…"
            className="max-h-32 min-h-[42px] flex-1 resize-none"
          />
          <Button size="icon" className="size-[42px] shrink-0" disabled={loading || !input.trim()} onClick={() => send(input)} aria-label="Send">
            <CornerDownLeft className="size-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          Supports healthy growth only — never medical or mental-health advice.
        </p>
      </div>
    </div>
  )
}
