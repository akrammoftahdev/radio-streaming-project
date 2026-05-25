import { NextResponse } from "next/server";
import { prisma } from "@/auth";

/**
 * POST /api/internal/audio-session/error
 * ──────────────────────────────────────────────────────────────────────────────
 * Called by backend-audio when a fatal pipeline error occurs — for example:
 *   - SHOUTcast handshake rejected (non-200 response)
 *   - FFmpeg spawn failure
 *   - SHOUTcast TCP socket error during streaming
 *
 * Marks the active LiveSession as ERROR and stores the error reason.
 *
 * ⚠️  INTERNAL ENDPOINT — FOR BACKEND-AUDIO USE ONLY ⚠️
 *
 * TODO (production hardening):
 *   • Restrict access to localhost / 127.0.0.1 via a reverse-proxy rule or
 *     a middleware IP check so this cannot be called from the public internet.
 *   • Optionally add a shared INTERNAL_SECRET header verified here and sent by
 *     backend-audio, for defence-in-depth on the local machine.
 *
 * Request body:
 * {
 *   presenterId:   string   — required, UUID of the presenter
 *   errorMessage?: string   — optional human-readable error detail (safe, no credentials)
 *   occurredAt?:   string   — optional ISO 8601 timestamp (defaults to now())
 * }
 *
 * IMPORTANT: The errorMessage must never contain passwords or other credentials.
 * backend-audio must sanitize any message before sending it here.
 *
 * Success (200): { ok: true, sessionId: string | null, presenterId: string, note?: string }
 * Error   (400): { ok: false, error: string }
 * Error   (500): { ok: false, error: "Internal error." }
 */
export async function POST(req: Request) {

  // ── 1. Parse body ──────────────────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const presenterId = body?.presenterId;
  if (!presenterId || typeof presenterId !== "string" || presenterId.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid presenterId." },
      { status: 400 }
    );
  }

  const occurredAt    = typeof body?.occurredAt    === "string" ? new Date(body.occurredAt) : new Date();
  const errorMessage  = typeof body?.errorMessage  === "string"
    ? body.errorMessage.slice(0, 500)   // cap length — no unbounded content in DB
    : "Unknown pipeline error";

  // ── 2. Find and update the session to ERROR ────────────────────────────────
  try {
    const existing = await prisma.liveSession.findFirst({
      where: { presenterId: presenterId.trim(), disconnectedAt: null },
      orderBy: { connectedAt: "desc" },
    });

    if (!existing) {
      console.log(`[session-error] No active session for presenter ${presenterId} — nothing to update`);
      return NextResponse.json({ ok: true, sessionId: null, presenterId, note: "no active session" });
    }

    // Use disconnectReason to store the error detail (no dedicated error column in schema).
    // TODO: Once a `lastError` or `errorMessage` column is added to LiveSession (or a
    //       separate SessionEvent log model is created), store it there instead.
    const session = await prisma.liveSession.update({
      where: { id: existing.id },
      data: {
        status:               "ERROR",
        disconnectedAt:       occurredAt,
        disconnectReason:     `ERROR: ${errorMessage}`,
        currentMicState:      false,
        sonicConnectionStatus: "ERROR",
      },
      select: { id: true, presenterId: true, status: true, disconnectReason: true },
    });

    // Log the error category (not the full error message, which may contain internal paths)
    console.error(`[session-error] Session ${session.id} marked ERROR for presenter ${presenterId}`);
    return NextResponse.json({ ok: true, sessionId: session.id, presenterId });

  } catch (err) {
    console.error("[session-error] DB error:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "Internal error." }, { status: 500 });
  }
}
