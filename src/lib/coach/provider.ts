/**
 * AI Coach provider — server-side only. NEVER import from client components.
 *
 * Zero-dependency OpenAI-compatible chat client. Works with OpenAI,
 * OpenRouter, Together, LM Studio, or any compatible gateway:
 *   AI_API_KEY   (or OPENAI_API_KEY)  — required; without it the coach is OFF
 *   AI_BASE_URL  (default https://api.openai.com/v1)
 *   AI_MODEL     (default gpt-4o-mini)
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
  return !!(process.env.AI_API_KEY || process.env.OPENAI_API_KEY)
}

function baseUrl(): string {
  return (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "")
}

function apiKey(): string | undefined {
  return process.env.AI_API_KEY || process.env.OPENAI_API_KEY
}

export async function callModel(
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number } = {}
): Promise<ModelResult> {
  const key = apiKey()
  if (!key) return { ok: false, unavailable: true, reason: "no_key" }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)

  try {
    const res = await fetch(`${baseUrl()}/chat/completions`, {
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

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
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
