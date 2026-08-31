/**
 * Thin re-export of the P1 coach rate limiter so the AI plumbing shares a
 * single sliding-window implementation instead of duplicating it.
 */
export { rateLimited } from "@/lib/coach/ratelimit"
