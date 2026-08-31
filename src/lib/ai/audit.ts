import { recordAiEvent, type RpcClient } from "./rpc"
import type { RpcResult } from "./types"

/**
 * Thin, domain-safe audit helper. Only ever writes sanitized summaries to
 * `ai_events` via the security-definer RPC — never prompt content, raw private
 * data, or secrets. Any `proposal` passed here is expected to already be a
 * bounded, non-sensitive summary.
 */

export type AuditAction = "proposed" | "approved" | "applied" | "rejected"

export async function auditEvent(
  client: RpcClient,
  args: { kind: string; action: AuditAction; proposal?: Record<string, unknown>; sourceRef?: Record<string, unknown> },
): Promise<RpcResult> {
  try {
    return await recordAiEvent(client, {
      kind: args.kind,
      action: args.action,
      proposal: sanitizeProposal(args.proposal),
      sourceRef: args.sourceRef ?? {},
    })
  } catch {
    // Auditing must never break the primary flow — fail soft.
    return { ok: false, error: "audit_failed" }
  }
}

function sanitizeProposal(p?: Record<string, unknown>): Record<string, unknown> {
  if (!p) return {}
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === "string") out[k] = v.slice(0, 500)
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v
    else if (Array.isArray(v)) out[k] = v.map((x) => (typeof x === "string" ? x.slice(0, 200) : x)).slice(0, 50)
    // Objects are dropped (no nested raw content escapes to the ledger).
  }
  return out
}
