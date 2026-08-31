import type { AIProposalKind, GatherFactsResult } from "./types"

/**
 * AI cost control.
 *
 * - Deterministic-first: `shouldUseAI` returns false when facts already answer
 *   the task, so the model is never called without added value.
 * - Per-kind request budget (`assertCostGate`) limits calls per window — a
 *   second, AI-specific layer on top of the P1 endpoint rate limit.
 * - `makeCacheKey` produces a deterministic fingerprint so identical fact sets
 *   reuse cached proposals instead of paying for another call.
 */

const KIND_BUDGETS: Record<AIProposalKind, number> = {
  goal: 10,
  phase: 10,
  quest: 12,
  habit: 10,
  journal: 10,
  learning: 10,
  business: 10,
  finance: 10,
  market: 10,
  coach: 20,
  generic: 8,
}

const WINDOW_MS = 5 * 60 * 1000

const spends = new Map<string, { count: number; windowStart: number }>()

/** True when the deterministic facts are sufficient — skip the model call. */
export function shouldUseAI(facts: GatherFactsResult, kind: AIProposalKind, minSignals = 0): boolean {
  if (facts.resolved === true) return false
  const signalCount = Object.keys(facts.signals ?? {}).length
  if (signalCount < minSignals) return false
  if (!facts.text.trim()) return false
  // Interpret/reason/generate value heuristics live here; future kinds can
  // refine via an override table.
  return true
}

/** Enforce a per-kind, per-user sliding-window request budget. */
export function assertCostGate(userId: string, kind: AIProposalKind): boolean {
  const key = `${userId}:${kind}`
  const budget = KIND_BUDGETS[kind] ?? KIND_BUDGETS.generic
  const now = Date.now()
  const entry = spends.get(key)
  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    spends.set(key, { count: 1, windowStart: now })
    return false
  }
  if (entry.count >= budget) {
    spends.set(key, entry)
    return true
  }
  entry.count += 1
  spends.set(key, entry)
  return false
}

/**
 * Deterministic cache key from the facts fingerprint + kind + user. Stable for
 * identical inputs; intentionally does NOT include model params (those are
 * fixed per kind via `modelFor`).
 */
export function makeCacheKey(userId: string, kind: AIProposalKind, factsFingerprint: string): string {
  const stable = factsFingerprint.trim().slice(0, 400)
  return `${userId}:${kind}:${stable}`
}

interface CacheEntry {
  value: unknown
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

export function getCache<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.value as T
}

export function setCache<T>(key: string, value: T, ttlMs: number): void {
  if (ttlMs <= 0) return
  if (cache.size >= 500) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs })
}

/** Clear all state (used in tests / hot-reload hygiene). */
export function resetAiState(): void {
  spends.clear()
  cache.clear()
}
