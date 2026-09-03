import { afterEach, describe, expect, it, vi } from "vitest"
import { callGemini, extractJson, type ChatMessage } from "./provider"

afterEach(() => {
  vi.restoreAllMocks()
  delete process.env.GEMINI_API_KEY
  delete process.env.GEMINI_MODEL
})

function mockFetchOnce(body: unknown, status = 200) {
  const res = {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(typeof body === "string" ? body : JSON.stringify(body)),
    json: vi.fn().mockResolvedValue(body),
  }
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res))
  return res
}

const SAMPLE_MESSAGES: ChatMessage[] = [
  { role: "system", content: "You are a coach." },
  { role: "user", content: "Make quests" },
]

describe("callGemini", () => {
  it("returns no_key when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY
    const r = await callGemini(SAMPLE_MESSAGES)
    expect(r).toMatchObject({ ok: false, unavailable: true, reason: "no_key" })
  })

  it("maps a 429 response to rate_limited with parsed retryAfterSeconds", async () => {
    process.env.GEMINI_API_KEY = "fake-key"
    const body = {
      error: {
        code: "too_many_requests",
        message:
          "Quota exceeded for metric: generate_content_free_tier_requests. Please retry in 25.804533271s.",
      },
    }
    const res = mockFetchOnce(body, 429)
    const r = await callGemini(SAMPLE_MESSAGES)
    expect(r).toMatchObject({
      ok: false,
      unavailable: true,
      reason: "rate_limited",
      retryAfterSeconds: 26,
    })
    expect(res.text).toHaveBeenCalled()
  })

  it("leaves retryAfterSeconds undefined when 429 body has no parseable retry", async () => {
    process.env.GEMINI_API_KEY = "fake-key"
    mockFetchOnce({ error: { message: "rate limited" } }, 429)
    const r = await callGemini(SAMPLE_MESSAGES)
    expect(r).toMatchObject({ ok: false, unavailable: true, reason: "rate_limited" })
    expect((r as { retryAfterSeconds?: number }).retryAfterSeconds).toBeUndefined()
  })

  it("sends generation_config with max_output_tokens and temperature", async () => {
    process.env.GEMINI_API_KEY = "fake-key"
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(""),
      json: vi.fn().mockResolvedValue({ steps: [{ type: "model_output", content: [{ text: "ok" }] }] }),
    })
    vi.stubGlobal("fetch", fetchMock)

    await callGemini(SAMPLE_MESSAGES, { maxTokens: 600, temperature: 0.7 })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const sent = JSON.parse((init as RequestInit & { body: string }).body)
    expect(sent.model).toBeDefined()
    expect(sent.generation_config).toEqual({ max_output_tokens: 600, temperature: 0.7 })
  })

  it("parses a successful interactions response", async () => {
    process.env.GEMINI_API_KEY = "fake-key"
    mockFetchOnce({
      steps: [
        { type: "model_output", content: [{ type: "text", text: '[{"title":"A quest","category":"general","difficulty":"easy"}]' }] },
      ],
    })
    const r = await callGemini(SAMPLE_MESSAGES)
    expect(r).toMatchObject({ ok: true })
    if (r.ok) expect(extractJson<unknown[]>(r.content)).toHaveLength(1)
  })
})
