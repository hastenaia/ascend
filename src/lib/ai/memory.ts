import { deleteAiMemory, markAiMemoryApproved, revokeAiMemory, saveAiMemory, type RpcClient } from "./rpc"
import type { MemoryNote, RpcResult } from "./types"

/**
 * Long-term AI memory store.
 *
 * Stores ONLY concise, user-approved summaries — never raw journal entries,
 * transactions, passwords, keys, or tokens (see sanitize functions). Reads are
 * owner-only via RLS; writes go through SECURITY DEFINER RPCs. `revoked`
 * notes are excluded from reads. No user-facing UI ships in P2.0 — the list /
 * revoke / delete primitives here back the future management page (P2.9).
 */

export interface MemoryRow {
  id: string
  user_id: string
  kind: string
  summary: string
  importance: number
  approved: boolean
  revoked: boolean
  created_at: string
  source_ref?: Record<string, unknown> | null
}

/** Structural read+write client (keeps deps decoupled and unit-testable). */
export interface MemoryDb {
  rpc: RpcClient["rpc"]
  from: (table: "ai_memory") => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        order: (col: string, opts: { ascending: boolean }) => Promise<{ data: MemoryRow[] | null; error: { message: string } | null }>
      }
    }
  }
}

/** List the user's visible (non-revoked) memory notes, newest first. */
export async function listMemory(db: MemoryDb, userId: string): Promise<MemoryNote[]> {
  const { data, error } = await db
    .from("ai_memory")
    .select("id, kind, summary, importance, approved, source_ref, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).filter((r) => !r.revoked).map(toNote)
}

/** Load approved memory notes, capped (used to seed AI context). */
export async function loadMemoryFor(db: MemoryDb, userId: string, kind?: string, limit = 10): Promise<string[]> {
  const { data, error } = await db
    .from("ai_memory")
    .select("id, kind, summary, importance, approved, source_ref, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? [])
    .filter((r) => r.approved && !r.revoked && (!kind || r.kind === kind))
    .slice(0, limit)
    .map((r) => r.summary)
}

/** Persist a concise, safe memory summary (idempotent via id override). */
export function saveMemory(
  db: MemoryDb,
  args: { kind: string; summary: string; importance?: number; sourceRef?: Record<string, unknown>; id?: string },
): Promise<RpcResult> {
  return saveAiMemory(db, args)
}

/** Soft-revoke a note (stops being served to the model). */
export function revokeMemory(db: MemoryDb, memoryId: string): Promise<RpcResult> {
  return revokeAiMemory(db, memoryId)
}

/** Mark a note as user-approved for model use. */
export function approveMemory(db: MemoryDb, memoryId: string): Promise<RpcResult> {
  return markAiMemoryApproved(db, memoryId)
}

/** Hard-delete a note (full erasure). */
export function deleteMemory(db: MemoryDb, memoryId: string): Promise<RpcResult> {
  return deleteAiMemory(db, memoryId)
}

function toNote(r: MemoryRow): MemoryNote {
  return {
    id: r.id,
    kind: r.kind,
    summary: r.summary,
    importance: r.importance,
    createdAt: r.created_at,
    sourceRef: r.source_ref ?? undefined,
  }
}
