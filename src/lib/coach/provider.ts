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

/** A tool call the model wants to execute. */
export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

/** A function response step to send back to the model. */
export interface FunctionResponseStep {
  type: "function_response"
  id: string
  name: string
  response: Record<string, unknown>
}

export type ModelCallOptions = {
  maxTokens?: number
  temperature?: number
  /** Gemini tool declarations (function_declarations). When present, the model may emit tool calls. */
  tools?: unknown[]
  /**
   * Raw Interactions API input steps. When provided, these are sent directly
   * instead of building input from `messages`. Used for tool-call follow-ups
   * where the input includes function_call / function_response steps.
   */
  rawInput?: Array<Record<string, unknown>>
}

export type ModelResult =
  | { ok: true; content: string; toolCalls?: ToolCall[] }
  | {
      ok: false
      unavailable: true
      reason: "no_key" | "upstream_error" | "rate_limited"
      detail?: string
      /** Seconds to wait before retrying, when the upstream rate-limited us (reason === "rate_limited"). */
      retryAfterSeconds?: number
    }

export function coachConfigured(): boolean {
  return !!(process.env.GEMINI_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY)
}

export function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY
}
function legacyApiKey(): string | undefined {
  return process.env.AI_API_KEY || process.env.OPENAI_API_KEY
}
function legacyBaseUrl(): string {
  return (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "")
}

export async function callGemini(messages: ChatMessage[], opts: ModelCallOptions = {}): Promise<ModelResult> {
  const key = geminiKey()
  if (!key) return { ok: false, unavailable: true, reason: "no_key" }
  const systemMsg = messages.find((m) => m.role === "system")
  const systemInstruction = systemMsg?.content ?? ""
  const input = opts.rawInput ?? messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      type: m.role === "assistant" ? "model_output" : "user_input",
      content: [{ type: "text", text: m.content }],
    }))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/interactions`
    const body: Record<string, unknown> = {
      model: process.env.GEMINI_MODEL || "gemini-3.6-flash",
      input,
      system_instruction: systemInstruction,
      generation_config: {
        max_output_tokens: opts.maxTokens ?? 700,
        temperature: opts.temperature ?? 0.6,
      },
    }
    if (opts.tools && opts.tools.length > 0) {
      body.tools = opts.tools
    }
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) {
      const body = (await res.text()).slice(0, 600)
      console.error("[coach] gemini upstream", res.status, body)
      if (res.status === 429) {
        return {
          ok: false,
          unavailable: true,
          reason: "rate_limited",
          detail: `HTTP 429: ${body.slice(0, 200)}`,
          retryAfterSeconds: parseRetryAfter(body),
        }
      }
      return { ok: false, unavailable: true, reason: "upstream_error", detail: `HTTP ${res.status}: ${body.slice(0, 200)}` }
    }
    const json = (await res.json()) as {
      steps?: { type?: string; content?: string | { type?: string; text?: string }[]; text?: string; id?: string; name?: string; arguments?: Record<string, unknown> }[]
      output?: { content?: { type?: string; text?: string }[] }[]
      candidates?: { content?: { parts?: { text?: string }[] } }[]
      response?: string
      text?: string
    }

    // Extract function_call steps (tool calls the model wants to execute).
    const toolCalls: ToolCall[] = []
    if (Array.isArray(json.steps)) {
      for (const step of json.steps) {
        if (step.type === "function_call" && step.id && step.name) {
          toolCalls.push({ id: step.id, name: step.name, args: step.arguments ?? {} })
        }
      }
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
    // When the model emitted tool calls, return them even if there's no text
    // (the caller will execute the tools and send results back for a follow-up).
    if (toolCalls.length > 0) {
      return { ok: true, content: text, toolCalls }
    }
    if (!text) {
      const keys = Object.keys(json).join(",")
      console.error("[coach][diag] gemini returned 200 but response had no parseable text; keys:", keys, "; input messages:", messages.length)
      return { ok: false, unavailable: true, reason: "upstream_error", detail: `HTTP 200 with no parseable text (keys: ${keys || "none"})` }
    }
    return { ok: true, content: text, ...(toolCalls.length > 0 ? { toolCalls } : {}) }
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

export async function callModel(messages: ChatMessage[], opts: ModelCallOptions = {}): Promise<ModelResult> {
  if (geminiKey()) return callGemini(messages, opts)
  return callLegacy(messages, opts)
}

/**
 * Parse a retry delay (seconds) out of a Gemini 429 error body. The upstream
 * message typically contains "Please retry in 25.804533271s." This is a best
 * effort — falls back to `undefined` when it can't be determined.
 */
function parseRetryAfter(body: string): number | undefined {
  const match = /retry in\s+([0-9.]+)\s*s/i.exec(body)
  if (!match) return undefined
  const seconds = Number(match[1])
  return Number.isFinite(seconds) && seconds >= 1 ? Math.ceil(seconds) : undefined
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

/**
 * Build the Gemini Interactions API input for a tool-call follow-up turn.
 *
 * Takes the original messages (which produced tool calls), the tool calls
 * themselves, and the results. Returns the full `input` array ready to send
 * in a second request so the model can generate a user-friendly response.
 */
export function buildToolFollowUpInput(
  messages: ChatMessage[],
  toolCalls: ToolCall[],
  results: Array<{ id: string; name: string; result: unknown }>,
): Array<{ type: string; content?: { type: string; text: string }[]; id?: string; name?: string; arguments?: Record<string, unknown>; response?: Record<string, unknown> }> {
  const input: Array<{ type: string; content?: { type: string; text: string }[]; id?: string; name?: string; arguments?: Record<string, unknown>; response?: Record<string, unknown> }> = []

  // Replay the original messages (minus system) as input steps.
  for (const m of messages) {
    if (m.role === "system") continue
    input.push({
      type: m.role === "assistant" ? "model_output" : "user_input",
      content: [{ type: "text", text: m.content }],
    })
  }

  // Append the function_call steps the model produced.
  for (const tc of toolCalls) {
    input.push({
      type: "function_call",
      id: tc.id,
      name: tc.name,
      arguments: tc.args,
    })
  }

  // Append the function_response steps with the execution results.
  for (const r of results) {
    input.push({
      type: "function_response",
      id: r.id,
      name: r.name,
      response: typeof r.result === "object" && r.result !== null ? (r.result as Record<string, unknown>) : { result: r.result },
    })
  }

  return input
}
