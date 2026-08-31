import { buildSystemPrompt } from "@/lib/coach/prompt"
import type { ChatMessage } from "@/lib/coach/provider"
import { ContextTooLargeError } from "./errors"

/**
 * Safe, domain-specific context composition for AI proposals.
 *
 * - Never sends the whole database: callers supply discrete, domain-specific
 *   `sections`, each clipped to `perSection` chars and the total to `maxChars`.
 * - `sanitizeForPrompt` rejects anything that isn't a concise summary-type
 *   piece of text — raw journal entries, transactions, tokens, etc. must be
 *   summarized by the caller *before* reaching this layer.
 * - `buildSafeSystemPrompt` reuses the P1 coach safety anchor (do not
 *   duplicate the safety rules).
 */

export interface ContextSection {
  title: string
  /** MUST already be a summary — never raw private content. */
  body: string
  maxChars?: number
}

export interface ComposeOptions {
  /** Absolute cap on the combined context text. */
  maxChars?: number
  /** Max number of sections to include. */
  maxSections?: number
  /** Soft cap per section (default 1500). */
  perSection?: number
}

const DEFAULT_MAX_CHARS = 6000
const DEFAULT_MAX_SECTIONS = 8
const DEFAULT_PER_SECTION = 1500

function clip(text: string, max: number): string {
  const t = text.trim()
  if (t.length <= max) return t
  return t.slice(0, Math.max(0, max - 1)).trimEnd() + "…"
}

/** Convert domain sections into a single bounded text block. */
export function composeContext(sections: ContextSection[], opts: ComposeOptions = {}): string {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS
  const maxSections = opts.maxSections ?? DEFAULT_MAX_SECTIONS
  const perSection = opts.perSection ?? DEFAULT_PER_SECTION

  const cut = sections.slice(0, maxSections)
  const parts = cut.map((s) => `[${s.title}]\n${clip(s.body, s.maxChars ?? perSection)}`)

  let result = ""
  for (const part of parts) {
    const candidate = result ? `${result}\n\n${part}` : part
    if (candidate.length > maxChars) break
    result = candidate
  }
  if (!result && parts.length > 0) {
    result = clip(parts[0], maxChars)
  }
  return result
}

/** Reject obvious non-summary raw content before it reaches the model. */
export function sanitizeForPrompt(text: string): string {
  const raw = codedMarkers(text)
  if (raw) return ""
  const t = text.trim()
  if (t.length > 20000) return ""
  return t
}

const RAW_MARKERS = [
  "authorization",
  "bearer ",
  "x-goog-api-key",
  "apikey",
  "password",
  "token",
  "refresh_token",
  "jwt",
]

function codedMarkers(text: string): boolean {
  const lower = text.toLowerCase()
  return RAW_MARKERS.some((m) => lower.includes(m))
}

/**
 * Build a ChatMessage system prompt using the P1 coach safety anchor plus the
 * bounded domain context. `additional` lets domains add their own purpose line.
 */
export function buildSafeSystemPrompt(contextText: string, additional?: string): ChatMessage {
  const extra = additional ? `${additional}\n` : ""
  const base = buildSystemPrompt(contextText)
  return {
    role: "system",
    content: `${extra}${base.content}`,
  }
}

/** Throws ContextTooLargeError if text exceeds the hard cap (used as a guard). */
export function assertContextSize(text: string, maxChars: number): void {
  if (text.length > maxChars) throw new ContextTooLargeError(maxChars)
}
