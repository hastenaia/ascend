/**
 * AI Coach provider — server-side only. NEVER import from client components.
 *
 * Prefers Google Gemini (GEMINI_API_KEY) via generateContent REST.
 * Falls back to OpenAI-compatible gateway (AI_API_KEY / OPENAI_API_KEY) for legacy.
 *   GEMINI_API_KEY — preferred; without any key the coach is OFF
 *   GEMINI_MODEL   — default gemini-2.5-flash
 *   AI_API_KEY / OPENAI_API_KEY — legacy fallback
 *
 * If no key is configured or the upstream call fails, callers receive
 * { ok:false, unavailable:true } and MUST surface "AI Coach is currently
 * unavailable." — fabricating responses is strictly forbidden.
 */

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string }

export type ModelResult =
  | { ok: true; content: string }
  | { ok: false; unavailable: true; reason: "no_key" | "upstream_error" }

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

async function callGemini(messages: ChatMessage[], opts: { maxTokens?: number; temperature?: number }): Promise<ModelResult> {
  const key = geminiKey()
  if (!key) return { ok: false, unavailable: true, reason: "no_key" }
  // Gemini generateContent: system instruction + contents (user/model)
  const systemMsg = messages.find((m) => m.role === "system")
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || "gemini-2.5-flash")}:generateContent?key=${encodeURIComponent(key)}`
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: systemMsg ? { parts: [{ text: systemMsg.content }] } : undefined,
        contents,
        generationConfig: { temperature: opts.temperature ?? 0.7, maxOutputTokens: opts.maxTokens ?? 700 },
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      console.error("[coach] gemini upstream", res.status, (await res.text()).slice(0, 400))
      return { ok: false, unavailable: true, reason: "upstream_error" }
    }
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? ""
    if (!text) return { ok: false, unavailable: true, reason: "upstream_error" }
    return { ok: true, content: text }
  } catch (e) {
    console.error("[coach] gemini call failed", e instanceof Error ? e.message : e)
    return { ok: false, unavailable: true, reason: "upstream_error" }
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
      console.error("[coach] upstream error", res.status, (await res.text()).slice(0, 300))
      return { ok: false, unavailable: true, reason: "upstream_error" }
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = json.choices?.[0]?.message?.content?.trim()
    if (!content) return { ok: false, unavailable: true, reason: "upstream_error" }
    return { ok: true, content }
  } catch (e) {
    console.error("[coach] model call failed", e instanceof Error ? e.message : e)
    return { ok: false, unavailable: true, reason: "upstream_error" }
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
