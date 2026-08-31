import { z } from "zod"

/**
 * Reusable Zod building blocks for AI proposals. Domains compose these into
 * their own schemas in P2.1+; P2.0 ships no domain schemas, only the helpers.
 */

/** A bounded, trimmed, non-empty string. */
export function boundedString(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(1, "must not be empty")
    .max(max, `must be at most ${max} characters`)
    .refine((s) => s.length >= min, `must be at least ${min} characters`)
}

/** Coerce unknown → trimmed string (missing → ""), safe for lenient parsing. */
export function cleanString(max: number) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" ? v.trim().slice(0, max) : ""))
}

/** An int bounded by [min, max]; anything else (incl. out-of-range) → null. */
export function boundedInt(min: number, max: number) {
  return z
    .union([z.number().int().min(min).max(max), z.null(), z.undefined()])
    .catch(null)
    .transform((v) => (typeof v === "number" ? v : null))
}

/** Coerce an enum-ish string into a validated union, dropping invalid. */
export function safeEnum<T extends [string, ...string[]]>(values: T) {
  return z.enum(values)
}

/**
 * Wrap a domain payload into a stable proposal object. Makes downstream
 * (audit, caching) treat every domain uniformly.
 */
export function proposalWrapper<T extends z.ZodTypeAny>(payloadSchema: T) {
  return z.object({
    proposal: payloadSchema,
  })
}

/** Helper: drop array items that fail a predicate, cap length. */
export function cleanArray<T>(arr: T[] | unknown, guard: (x: T) => boolean, max: number): T[] {
  if (!Array.isArray(arr)) return []
  return arr.filter(guard).slice(0, max)
}
