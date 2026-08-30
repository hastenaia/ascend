/**
 * AI Coach provider — server-side only. NEVER import from client components.
 *
 * Prefers Google Gemini (GEMINI_API_KEY) via Interactions API.
 * Falls back to OpenAI-compatible gateway (AI_API_KEY / OPENAI_API_KEY) for legacy.
 *   GEMINI_API_KEY — preferred; without any key the coach is OFF
 *   GEMINI_MODEL   — default gemini-3.6-flash
 *   AI_API_KEY / OPENAI_API_KEY — legacy fallback
 *
 * If no key is configured or the upstream call fails, callers receive
 * { ok:false, unavailable:true } and MUST surface "AI Coach is currently
 * unavailable." — fabricating responses is strictly forbidden.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export type ModelResult =
  | { ok: true; content: string }
  | { ok: false; unavailable: true; reason: "no_key" | "upstream_error"; detail?: string }

export function coachConfigured(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY)
}

function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY
}
function legacyApiKey(): string | undefined {
  return process.env.AI_API_KEY || process.env.OPENAI_API_KEY
}
function legacyBaseUrl(): string {
  return (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "")
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function callGemini(messages: ChatMessage[], _opts: { maxTokens?: number; temperature?: number }): Promise<ModelResult> {
  const key = geminiKey()
  if (!key) return { ok: false, unavailable: true, reason: "no_key" }
  const systemMsg = messages.find((m) => m.role === "system")
  const systemInstruction = systemMsg?.content ?? ""
  const input = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      type: m.role === "assistant" ? "model_output" : "user_input",
      content: [{ type: "text", text: m.content }],
    }))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/interactions`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
        input,
        system_instruction: systemInstruction,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 600)
      console.error("[coach] gemini upstream", res.status, body)
      return { ok: false, unavailable: true, reason: "upstream_error", detail: `HTTP ${res.status}: ${body.slice(0, 200)}` }
    }
    const json = (await res.json()) as {
      steps?: { type?: string; content?: string | { type?: string; text?: string }[]; text?: string }[]
      output?: { content?: { type?: string; text?: string }[] }[]
      candidates?: { content?: { parts?: { text?: string }[] } }[]
      response?: string
      text?: string
    }
    let text = ""
    if (Array.isArray(json.steps) && json.steps.length > 0) {
      const modelSteps = json.steps.filter((s) => s.type === "model_output")
      const last = (modelSteps[modelSteps.length - 1] ?? json.steps[json.steps.length - 1]) as { content?: string | { type?: string; text?: string }[]; text?: string } | undefined
      if (last) {
        const c: unknown = (last as { content?: unknown }).content ?? (last as { text?: unknown }).text
        if (Array.isArray(c)) text = (c as { text?: string }[]).map((p) => p.text ?? "").join("").trim()
        else if (typeof c === "string") text = c.trim()
        else if (typeof (last as { text?: unknown }).text === "string") text = ((last as { text?: string }).text ?? "").trim()
      }
      if (!text) {
        text = modelSteps
          .map((s) => {
            const cc: unknown = (s as { content?: unknown }).content
            if (Array.isArray(cc)) return (cc as { text?: string }[]).map((p) => p.text ?? "").join("")
            if (typeof cc === "string") return cc
            return ""
          })
          .join("")
          .trim()
      }
    }
    if (!text && Array.isArray(json.output) && json.output.length > 0) {
      text = json.output.flatMap((o) => o.content ?? []).map((p) => (p as { text?: string }).text ?? "").join("").trim()
    }
    if (!text && json.candidates?.[0]?.content?.parts) {
      text = json.candidates[0].content.parts.map((p) => p.text ?? "").join("").trim()
    }
    if (!text && typeof json.response === "string") text = json.response.trim()
    if (!text && typeof json.text === "string") text = json.text.trim()
    if (!text) return { ok: false, unavailable: true, reason: "upstream_error" }
    return { ok: true, content: text }
  } catch (e) {
    console.error("[coach] gemini call failed", e instanceof Error ? e.message : e)
    return { ok: false, unavailable: true, reason: "upstream_error", detail: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}

async function callLegacy(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number }): Promise<ModelResult> {
  const key = legacyApiKey()
  if (!key) return { ok: false, unavailable: true, reason: "no_key" }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`${legacyBaseUrl()}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "gpt-4o-mini",
        messages,
        max_tokens: opts.maxTokens ?? 700,
        temperature: opts.temperature ?? 0.6,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300)
      console.error("[coach] upstream error", res.status, body)
      return { ok: false, unavailable: true, reason: "upstream_error", detail: `HTTP ${res.status}: ${body.slice(0, 120)}` }
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = json.choices?.[0]?.message?.content?.trim()
    if (!content) return { ok: false, unavailable: true, reason: "upstream_error" }
    return { ok: true, content }
  } catch (e) {
    console.error("[coach] model call failed", e instanceof Error ? e.message : e)
    return { ok: false, unavailable: true, reason: "upstream_error", detail: e instanceof Error ? e.message : String(e) }
  } finally {
    clearTimeout(timer)
  }
}

export async function callModel(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number } = {}): Promise<ModelResult> {
  if (geminiKey()) return callGemini(messages, opts)
  return callLegacy(messages, opts)
}

/** Extract a JSON object/array from a model response that may wrap it in prose or code fences */
export function extractJson<T>(raw: string): T | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced ? fenced[1] : raw).trim()
  const start = candidate.search(/[[{]/)
  if (start === -1) return null
  const end = Math.max(candidate.lastIndexOf("]"), candidate.lastIndexOf("}"))
  if (end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T
  } catch {
    return null
  }
}
