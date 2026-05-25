import { NextResponse } from "next/server";
import { prisma } from "@/auth";
import path from "path";

/**
 * POST /api/internal/audio-session/ended
 * ──────────────────────────────────────────────────────────────────────────────
 * Called by backend-audio when the WebSocket disconnects or the stale-session
 * watchdog fires.  This endpoint:
 *
 *   1. Marks the active LiveSession as ENDED.
 *   2. Creates a Recording row with local-file metadata (item 3.3).
 *      If the recording path is missing or Recording creation fails, the
 *      session is still closed successfully — Recording creation is non-fatal.
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
 *   presenterId:            string   — required, UUID of the presenter
 *   endedAt?:               string   — optional ISO 8601 timestamp (defaults to now())
 *   reason?:                string   — optional: "disconnect" | "stale_timeout" | other
 *   recordingPath?:         string   — optional full path OR filename of the local WebM file
 *   localPath?:             string   — alias for recordingPath (either is accepted)
 *   bytesReceived?:         number   — optional: bytes received from browser
 *   bytesSentToShoutcast?:  number   — optional: informational only, not stored
 *   stationId?:             string   — forwarded from token validate response (null for DIRECT_DJ)
 *   sessionMode?:           string   — 'SCHEDULED' | 'DIRECT_DJ' (null = legacy fallback)
 *   directDjRadioId?:       string   — forwarded from token validate response (DIRECT_DJ only)
 * }
 *
 * Success (200): { ok: true, sessionId: string | null, presenterId: string,
 *                  recordingId?: string | null, note?: string }
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

  const endedAt = typeof body?.endedAt === "string" ? new Date(body.endedAt) : new Date();
  const reason  = typeof body?.reason  === "string" ? body.reason  : "disconnect";

  // Accept either "recordingPath" (backend-audio field name) or "localPath" (alias).
  // Always extract basename only — never store an absolute path in the DB.
  const rawPath =
    (typeof body?.recordingPath === "string" && body.recordingPath.trim() !== "")
      ? body.recordingPath.trim()
      : (typeof body?.localPath === "string" && body.localPath.trim() !== "")
        ? body.localPath.trim()
        : null;

  // basename() handles both Unix (/a/b/c.webm → c.webm) and Windows separators.
  const recordingFilename: string | null = rawPath ? path.basename(rawPath) : null;

  const bytesReceived        = typeof body?.bytesReceived        === "number" ? body.bytesReceived        : null;
  // bytesSentToShoutcast is informational only — the Recording schema has no column for it.
  const bytesSentToShoutcast = typeof body?.bytesSentToShoutcast === "number" ? body.bytesSentToShoutcast : null;

  // Station context forwarded from backend-audio (extracted from token validate response).
  // stationId  = which internal station was broadcasting (null for DIRECT_DJ or missing token).
  // sessionMode = 'SCHEDULED' | 'DIRECT_DJ' | null (null = legacy pre-mode token).
  // directDjRadioId = the DirectDjRadio target (DIRECT_DJ only).
  const bodyStationId       = typeof body?.stationId       === "string" && (body.stationId as string).trim() !== ""
    ? (body.stationId as string).trim() : null;
  const bodySessionMode     = typeof body?.sessionMode     === "string" ? (body.sessionMode as string) : null;
  const bodyDirectDjRadioId = typeof body?.directDjRadioId === "string" && (body.directDjRadioId as string).trim() !== ""
    ? (body.directDjRadioId as string).trim() : null;

  if (bytesSentToShoutcast !== null) {
    console.log(`[session-ended] bytesSentToShoutcast=${bytesSentToShoutcast} (informational — not stored)`);
  }

  // ── 2. Find the latest LiveSession for this presenter ─────────────────────
  //
  // RACE-CONDITION FIX (2026-05-09):
  //
  // Previously this query required disconnectedAt = null, which caused Recording
  // rows to be silently skipped.  The race:
  //
  //   1. User clicks Disconnect in UI
  //   2. POST /api/studio/disconnect → sets disconnectedAt = NOW  (status = DISCONNECTED)
  //   3. WebSocket closes → backend-audio converts WebM→MP3 (~5 s)
  //   4. backend-audio calls this endpoint
  //   5. Old query: disconnectedAt = null → finds nothing → "no active session"
  //      → Recording row never created.
  //
  // Fix: find the most-recently-connected session for this presenter regardless
  // of disconnectedAt.  Guard against duplicate Recording rows using liveSessionId.

  let closedSession: {
    id: string;
    presenterId: string;
    scheduleId: string | null;
    connectedAt: Date;
    status: string;
    disconnectReason: string | null;
  } | null = null;

  try {
    // Find the latest session — do NOT filter by disconnectedAt.
    const existing = await prisma.liveSession.findFirst({
      where:   { presenterId: presenterId.trim() },
      orderBy: { connectedAt: "desc" },
    });

    if (!existing) {
      console.log(
        `[session-ended] No session found for presenter ${presenterId} — ` +
        `nothing to record (reason: ${reason})`
      );
      return NextResponse.json({
        ok: true,
        sessionId: null,
        presenterId,
        recordingId: null,
        note: "no session found for presenter",
      });
    }

    // If the session is already ENDED, check if a Recording row already exists
    // for this liveSessionId to avoid creating duplicates.
    if (existing.status === "ENDED") {
      const existingRecording = await prisma.recording.findFirst({
        where: { liveSessionId: existing.id },
        select: { id: true },
      });
      if (existingRecording) {
        console.log(
          `[session-ended] Session ${existing.id} already ENDED with Recording ${existingRecording.id} — skipping duplicate`
        );
        return NextResponse.json({
          ok: true,
          sessionId: existing.id,
          presenterId,
          recordingId: existingRecording.id,
          note: "session already ended with existing recording",
        });
      }
      // ENDED but no Recording yet — fall through to create one below.
      console.log(
        `[session-ended] Session ${existing.id} is ENDED but has no Recording row — will create one`
      );
    }

    // Update the session to ENDED.  If already ENDED or DISCONNECTED this is
    // idempotent for status; we still update disconnectedAt / reason if missing.
    closedSession = await prisma.liveSession.update({
      where: { id: existing.id },
      data: {
        status:               "ENDED",
        // Only overwrite disconnectedAt if it wasn't already set (preserve original timestamp).
        disconnectedAt:       existing.disconnectedAt ?? endedAt,
        disconnectReason:     existing.disconnectReason ?? reason,
        currentMicState:      false,
        sonicConnectionStatus: "DISCONNECTED",
      },
      select: {
        id:               true,
        presenterId:      true,
        scheduleId:       true,
        connectedAt:      true,
        status:           true,
        disconnectReason: true,
      },
    });

    console.log(
      `[session-ended] Session ${closedSession.id} → ENDED for presenter ${presenterId} ` +
      `(was: ${existing.status}, reason: ${reason})`
    );

  } catch (err) {
    console.error("[session-ended] DB error closing LiveSession:", (err as Error).message);
    return NextResponse.json({ ok: false, error: "Internal error." }, { status: 500 });
  }

  // ── 3. Create Recording row (non-fatal — session close already succeeded) ──
  if (!recordingFilename) {
    // No recording path provided — skip Recording creation.
    console.log(
      `[session-ended] No recordingPath in payload — Recording row NOT created ` +
      `(session ${closedSession.id} closed successfully)`
    );
    return NextResponse.json({
      ok: true,
      sessionId: closedSession.id,
      presenterId,
      recordingId: null,
      note: "session closed; no recordingPath provided — Recording row skipped",
    });
  }

  // Derive timing from the closed LiveSession.
  const startedAt       = closedSession.connectedAt;
  const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

  // Fetch showDate from the linked schedule if one exists.
  let showDate: Date | null = null;
  if (closedSession.scheduleId) {
    try {
      const schedule = await prisma.broadcastSchedule.findUnique({
        where: { id: closedSession.scheduleId },
        select: { startDatetime: true },
      });
      showDate = schedule?.startDatetime ?? null;
    } catch {
      // showDate is optional — swallow the error.
    }
  }

  // ── Fetch snapshot data before recording.create ─────────────────────────────
  // These are stored alongside the FK so the archive can display names even if
  // the presenter, station, or program is later deleted.
  let presenterNameSnapshot: string | null = null;
  let presenterUsernameSnapshot: string | null = null;
  let stationNameSnapshot: string | null = null;
  let programTitleSnapshot: string | null = null;

  try {
    const presenterUser = await prisma.user.findUnique({
      where:  { id: presenterId.trim() },
      select: { name: true, username: true },
    });
    presenterNameSnapshot     = presenterUser?.name     ?? null;
    presenterUsernameSnapshot = presenterUser?.username ?? null;
  } catch { /* non-fatal */ }

  // ── Station context resolution ─────────────────────────────────────────────
  // Priority:
  //   A. bodyStationId from token validate (authoritative — set for SCHEDULED sessions)
  //   B. PresenterStation fallback (ONLY used for SINGLE_STATION as last resort; NOT for MULTI_STATION)
  //   C. null (DIRECT_DJ or legacy unknown)
  //
  // sourceType:
  //   'SCHEDULED_PROGRAM'  → SINGLE_STATION / MULTI_STATION sessions
  //   'DIRECT_DJ'          → DIRECT_DJ sessions
  //    null                → legacy tokens that pre-date sessionMode field

  const isDirectDj = bodySessionMode === "DIRECT_DJ";
  let resolvedStationId: string | null = null;

  if (isDirectDj) {
    resolvedStationId = null; // DIRECT_DJ never links to an internal station
  } else if (bodyStationId) {
    // Authoritative stationId from token validate — correct for BOTH SINGLE and MULTI_STATION
    resolvedStationId = bodyStationId;
    console.log(`[session-ended] stationId from token payload: ${resolvedStationId} presenter=${presenterId}`);
  } else {
    // Fallback: PresenterStation lookup. Safe for SINGLE_STATION, potentially wrong for MULTI_STATION.
    // If backend-audio correctly forwards stationId from token/validate this branch should never fire.
    try {
      const ps = await prisma.presenterStation.findFirst({
        where:   { presenterId: presenterId.trim(), isActive: true },
        select:  { station: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      });
      if (ps?.station?.id) {
        resolvedStationId = ps.station.id;
        console.warn(
          `[session-ended] FALLBACK stationId from PresenterStation — may be wrong for MULTI_STATION. ` +
          `stationId=${resolvedStationId} presenter=${presenterId}`
        );
      }
    } catch { /* non-fatal */ }
  }

  // Fetch station name snapshot by FK (accurate and consistent with resolved stationId)
  if (resolvedStationId) {
    try {
      const st = await prisma.station.findUnique({
        where:  { id: resolvedStationId },
        select: { name: true },
      });
      stationNameSnapshot = st?.name ?? null;
    } catch { /* non-fatal */ }
  }

  const resolvedSourceType: string | null =
    isDirectDj                        ? "DIRECT_DJ"          :
    bodySessionMode === "SCHEDULED"   ? "SCHEDULED_PROGRAM"  :
    bodyStationId                     ? "SCHEDULED_PROGRAM"  : // stationId present, mode missing (edge)
    null;                                                       // legacy / unknown

  const resolvedDirectDjRadioId: string | null = isDirectDj ? (bodyDirectDjRadioId ?? null) : null;

  // Detect format from filename (MP3 from conversion, WebM from fallback path)
  const recordingFormat = recordingFilename?.toLowerCase().endsWith(".mp3") ? "audio/mpeg" : "audio/webm";

  console.log(
    `[session-ended] Recording context → stationId=${resolvedStationId ?? "null"} ` +
    `sourceType=${resolvedSourceType ?? "null"} sessionMode=${bodySessionMode ?? "null"} ` +
    `directDjRadioId=${resolvedDirectDjRadioId ?? "null"} format=${recordingFormat}`
  );

  let recordingId: string | null = null;
  try {
    const recording = await prisma.recording.create({
      data: {
        presenterId:     presenterId.trim(),
        liveSessionId:   closedSession.id,
        scheduleId:      closedSession.scheduleId ?? null,
        showDate,
        startedAt,
        endedAt,
        durationSeconds: durationSeconds >= 0 ? durationSeconds : null,
        localPath:       recordingFilename,     // relative filename only
        format:          recordingFormat,       // audio/mpeg or audio/webm
        bitrate:         null,                  // not available at session end
        bytesReceived:   bytesReceived,
        cloudUrl:        null,                  // always null in MVP
        // Station context
        stationId:       resolvedStationId,
        sourceType:      resolvedSourceType,
        directDjRadioId: resolvedDirectDjRadioId,
        // Snapshot fields
        presenterNameSnapshot,
        presenterUsernameSnapshot,
        stationNameSnapshot,
        programTitleSnapshot,
      },
      select: { id: true },
    });

    recordingId = recording.id;
    console.log(
      `[session-ended] Recording row created — id: ${recording.id} ` +
      `localPath: ${recordingFilename} ` +
      `stationId: ${resolvedStationId ?? "null"} ` +
      `sourceType: ${resolvedSourceType ?? "null"} ` +
      `duration: ${durationSeconds}s ` +
      `bytesReceived: ${bytesReceived ?? "null"}`
    );

  } catch (err) {
    // Recording creation failure is non-fatal — log and continue.
    console.error(
      "[session-ended] Recording row creation failed (non-fatal):",
      (err as Error).message
    );
    return NextResponse.json({
      ok: true,
      sessionId: closedSession.id,
      presenterId,
      recordingId: null,
      note: "session closed; Recording row creation failed — see server log",
    });
  }


  return NextResponse.json({
    ok: true,
    sessionId:   closedSession.id,
    presenterId,
    recordingId,
  });
}

