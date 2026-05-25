import { NextResponse } from "next/server";
import { prisma } from "@/auth";

/**
 * POST /api/internal/audio-session/started
 * ──────────────────────────────────────────────────────────────────────────────
 * Called by backend-audio when the SHOUTcast v2 handshake is accepted and the
 * FFmpeg → SHOUTcast pipeline becomes active (i.e. the session is truly LIVE).
 *
 * This endpoint finds or creates the active LiveSession row for the presenter
 * and updates it to reflect the live streaming state.
 *
 * ⚠️  INTERNAL ENDPOINT — FOR BACKEND-AUDIO USE ONLY ⚠️
 *
 * TODO (production hardening):
 *   • Restrict access to localhost / 127.0.0.1 via a reverse-proxy rule or
 *     a middleware IP check so this cannot be called from the public internet.
 *   • Optionally add a shared INTERNAL_SECRET header verified here and sent by
 *     backend-audio, for defence-in-depth on the local machine.
 *
 * Request body (all fields from backend-audio):
 * {
 *   presenterId:    string   — required, UUID of the presenter
 *   scheduleId?:   string   — optional, UUID of the broadcast schedule slot
 *   startedAt?:    string   — optional ISO 8601 timestamp (defaults to now())
 *   localPath?:    string   — optional path to the local WebM recording file
 *                            TODO: store in schema once Recording model is added (Group 3)
 *   bytesReceived?:          number  — TODO: no column in LiveSession yet
 *   bytesSentToShoutcast?:   number  — TODO: no column in LiveSession yet
 * }
 *
 * Success (200): { ok: true, sessionId: string, presenterId: string }
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

  const scheduleId  = typeof body?.scheduleId  === "string" ? body.scheduleId  : null;
  const startedAt   = typeof body?.startedAt   === "string" ? new Date(body.startedAt) : new Date();

  // TODO: localPath, bytesReceived, bytesSentToShoutcast — no columns exist in
  // LiveSession for these yet.  They will be stored in the Recording model once
  // Group 3 (Recording Archive) is implemented.  Log them only for now.
  const localPath              = typeof body?.localPath             === "string" ? body.localPath             : null;
  const bytesReceived          = typeof body?.bytesReceived         === "number" ? body.bytesReceived         : null;
  const bytesSentToShoutcast   = typeof body?.bytesSentToShoutcast  === "number" ? body.bytesSentToShoutcast  : null;

  if (localPath !== null || bytesReceived !== null || bytesSentToShoutcast !== null) {
    // Safe to log path and byte counts — no credentials or PII
    console.log(
      `[session-started] Received metadata not yet persisted to DB — ` +
      `localPath=${localPath ?? "null"} ` +
      `bytesReceived=${bytesReceived ?? "null"} ` +
      `bytesSentToShoutcast=${bytesSentToShoutcast ?? "null"}`
    );
  }

  // ── 2. Upsert the LiveSession row ──────────────────────────────────────────
  //
  // Strategy:
  //   a. Find an open session (disconnectedAt IS NULL) for this presenter.
  //      The heartbeat / browser mic-on flow typically creates the session first;
  //      backend-audio calls this endpoint once the SHOUTcast handshake succeeds.
  //   b. If found: update status → LIVE and sonicConnectionStatus → ACCEPTED.
  //   c. If not found: create a new LiveSession row (backend-audio may connect
  //      before the heartbeat in edge cases, so we must handle this gracefully).

  try {
    const existing = await prisma.liveSession.findFirst({
      where: { presenterId: presenterId.trim(), disconnectedAt: null },
      orderBy: { connectedAt: "desc" },
    });

    let session;
    if (existing) {
      session = await prisma.liveSession.update({
        where: { id: existing.id },
        data: {
          status:               "LIVE",
          sonicConnectionStatus: "ACCEPTED",
          currentMicState:      true,
          ...(scheduleId && !existing.scheduleId ? { scheduleId } : {}),
        },
        select: { id: true, presenterId: true, status: true, sonicConnectionStatus: true },
      });
      console.log(`[session-started] Updated existing session ${session.id} → LIVE for presenter ${presenterId}`);
    } else {
      session = await prisma.liveSession.create({
        data: {
          presenterId:          presenterId.trim(),
          scheduleId:           scheduleId ?? undefined,
          status:               "LIVE",
          sonicConnectionStatus: "ACCEPTED",
          currentMicState:      true,
          connectedAt:          startedAt,
        },
        select: { id: true, presenterId: true, status: true, sonicConnectionStatus: true },
      });
      console.log(`[session-started] Created new session ${session.id} → LIVE for presenter ${presenterId}`);
    }

    return NextResponse.json({ ok: true, sessionId: session.id, presenterId });

  } catch (err) {
    console.error("[session-started] DB error:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "Internal error." }, { status: 500 });
  }
}
