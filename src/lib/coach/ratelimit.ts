/**
 * Tiny in-memory sliding-window rate limiter for coach endpoints.
 * Per server instance — sufficient to stop accidental hammering; a real
 * distributed limit would live in Redis/Supabase later.
 */
const WINDOW_MS = 5 * 60 * 1000
const MAX_REQUESTS = 20

const hits = new Map<string, number[]>()

export function rateLimited(key: string): boolean {
  const now = Date.now()
  const arr = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (arr.length >= MAX_REQUESTS) {
    hits.set(key, arr)
    return true
  }
  arr.push(now)
  hits.set(key, arr)
  return false
}
