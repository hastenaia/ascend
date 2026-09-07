import { NextResponse } from "next/server"
import { coachConfigured, geminiKey } from "@/lib/coach/provider"

export const runtime = "nodejs"

/**
 * GET /api/coach/health
 * Returns minimal diagnostics for ops without leaking secrets.
 * { configured: boolean, model: string, hasKey: boolean }
 */
export async function GET() {
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash"
  return NextResponse.json({
    configured: coachConfigured(),
    hasKey: Boolean(geminiKey()),
    model,
  })
}
