import { auth, prisma } from "@/auth";
import { NextResponse } from "next/server";
import { createAudioToken } from "@/lib/audio-token";

/**
 * POST /api/internal/audio-token/create
 * --------------------------------------------------------
 * Creates a short-lived signed audio session token for the
 * authenticated presenter.
 *
 * Session modes:
 *   SINGLE_STATION / MULTI_STATION — stationId resolved from active LiveSession / Program / legacy Schedule.
 *                Credential chain: SonicPanelCredential → StationDefaultCredential → legacy.
 *   DIRECT_DJ  — directDjRadioId passed in request body (presenter's personal radio target).
 *                Credential chain: DirectDjRadio only. No station resolution needed.
 *
 * Requirements:
 *  - Caller must have an active PRESENTER session.
 *  - SonicPanel / DirectDjRadio credentials are NEVER included in the token.
 *  - Token TTL: 5 minutes (enforced in audio-token.ts).
 * --------------------------------------------------------
 */
export async function POST(req: Request) {
  // ── Auth guard ──────────────────────────────────────────────────────────
  const session = await auth();

  if (!session || session.user?.role !== 'PRESENTER') {
    return NextResponse.json(
      { error: 'Unauthorized — presenter session required.' },
      { status: 401 }
    );
  }

  const presenterId = session.user.id;
  if (!presenterId) {
    return NextResponse.json(
      { error: 'Presenter ID missing from session.' },
      { status: 400 }
    );
  }

  // ── Parse optional body ─────────────────────────────────────────────────
  let bodyDirectDjRadioId:    string | null = null;
  let bodyScheduledStationId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.directDjRadioId && typeof body.directDjRadioId === 'string') {
      bodyDirectDjRadioId = body.directDjRadioId;
    }
    if (body?.scheduledStationId && typeof body.scheduledStationId === 'string') {
      bodyScheduledStationId = body.scheduledStationId;
    }
  } catch {
    // Non-fatal — body is optional for SCHEDULED presenters
  }

  // ── Look up presenter mode ───────────────────────────────────────────────
  const presenter = await prisma.user.findUnique({
    where:  { id: presenterId },
    select: { presenterMode: true },
  });

  const presenterMode = presenter?.presenterMode ?? 'SINGLE_STATION';

  // DIRECT_DJ path — skip schedule resolver entirely.
  // SINGLE_STATION and MULTI_STATION use the SCHEDULED path below.
  if (presenterMode === 'DIRECT_DJ') {

    if (!bodyDirectDjRadioId) {
      return NextResponse.json(
        { error: 'directDjRadioId is required for DIRECT_DJ session.' },
        { status: 400 }
      );
    }

    // Validate that this radio target belongs to THIS presenter and is active
    const radio = await prisma.directDjRadio.findFirst({
      where: {
        id:          bodyDirectDjRadioId,
        presenterId,
        isActive:    true,
      },
      select: { id: true, radioName: true },
    });

    if (!radio) {
      return NextResponse.json(
        { error: 'Radio target not found, not active, or does not belong to this presenter.' },
        { status: 403 }
      );
    }

    console.log(
      `[audio-token/create] DIRECT_DJ presenter=${presenterId}` +
      ` radioId=${radio.id} radioName="${radio.radioName}"`
    );

    let token: string;
    let payload: ReturnType<typeof createAudioToken>['payload'];
    try {
      const result = createAudioToken(
        presenterId,
        null,                // scheduleId — not applicable
        null,                // stationId  — not applicable
        'DIRECT_DJ',
        radio.id
      );
      token   = result.token;
      payload = result.payload;
    } catch (err) {
      console.error('[audio-token/create] Token creation failed:', (err as Error).message);
      return NextResponse.json(
        { error: 'Token creation failed — AUDIO_TOKEN_SECRET may not be configured.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      token,
      presenterId:      payload.presenterId,
      sessionMode:      payload.sessionMode,
      directDjRadioId:  payload.directDjRadioId,
      scheduleId:       null,
      stationId:        null,
      stationIdSource:  'direct_dj',
      issuedAt:         payload.issuedAt,
      expiresAt:        payload.expiresAt,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SINGLE_STATION / MULTI_STATION path — existing stationId resolution logic (unchanged)
  // ══════════════════════════════════════════════════════════════════════════

  let scheduleId:      string | null = null;
  let stationId:       string | null = null;
  let stationIdSource = 'null';

  // P0: client-provided scheduledStationId (resolved server-side by studio/page.tsx time-window resolver)
  // Validated here by confirming the stationId belongs to an active Program for this presenter.
  // This prevents MULTI_STATION from falling through to the creation-date-ordered P2 query.
  if (bodyScheduledStationId) {
    try {
      const validProgram = await prisma.program.findFirst({
        where: { presenterId, stationId: bodyScheduledStationId, isActive: true },
        select: { id: true },
      });
      if (validProgram) {
        stationId       = bodyScheduledStationId;
        stationIdSource = 'client_scheduled_station_p0';
        console.log(`[audio-token/create] P0 validated scheduledStationId=${stationId} for presenter=${presenterId}`);
      } else {
        console.warn(`[audio-token/create] P0 rejected: stationId=${bodyScheduledStationId} not linked to an active Program for presenter=${presenterId}. Falling through to P1.`);
      }
    } catch {
      // Non-fatal — fall through to P1
    }
  }

  // P1: active LiveSession → linked BroadcastSchedule
  try {
    const liveSession = await prisma.liveSession.findFirst({
      where: {
        presenterId,
        disconnectedAt: null,
      },
      orderBy: { connectedAt: 'desc' },
      include: {
        schedule: { select: { stationId: true } },
      },
    });

    scheduleId = liveSession?.scheduleId ?? null;

    if (liveSession?.schedule?.stationId) {
      stationId       = liveSession.schedule.stationId;
      stationIdSource = 'live_session_broadcast_schedule';
    }
  } catch {
    scheduleId = null;
  }

  // P2: active Program in the new schedule system
  if (!stationId) {
    try {
      const program = await prisma.program.findFirst({
        where:   { presenterId, isActive: true },
        orderBy: { createdAt: 'desc' },
        select:  { stationId: true },
      });
      if (program?.stationId) {
        stationId       = program.stationId;
        stationIdSource = 'program_schedule';
      }
    } catch {
      // Non-fatal
    }
  }

  // P3: most recent BroadcastSchedule (legacy fallback)
  if (!stationId) {
    try {
      const recentSchedule = await prisma.broadcastSchedule.findFirst({
        where:   { presenterId },
        orderBy: { startDatetime: 'desc' },
        select:  { stationId: true },
      });
      if (recentSchedule?.stationId) {
        stationId       = recentSchedule.stationId;
        stationIdSource = 'legacy_broadcast_schedule';
      }
    } catch {
      // Non-fatal
    }
  }

  console.log(
    `[audio-token/create] SCHEDULED presenter=${presenterId} scheduleId=${scheduleId ?? 'none'}` +
    ` stationId=${stationId ?? 'null'} source=${stationIdSource}`
  );

  let token: string;
  let payload: ReturnType<typeof createAudioToken>['payload'];

  try {
    const result = createAudioToken(presenterId, scheduleId, stationId, 'SCHEDULED', null);
    token   = result.token;
    payload = result.payload;
  } catch (err) {
    console.error('[audio-token/create] Token creation failed:', (err as Error).message);
    return NextResponse.json(
      { error: 'Token creation failed — AUDIO_TOKEN_SECRET may not be configured.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    token,
    presenterId:      payload.presenterId,
    sessionMode:      payload.sessionMode,
    directDjRadioId:  null,
    scheduleId:       payload.scheduleId,
    stationId:        payload.stationId,
    stationIdSource,
    issuedAt:         payload.issuedAt,
    expiresAt:        payload.expiresAt,
  });
}

