import { NextResponse } from "next/server";
import { prisma }       from "@/auth";
import { verifyAudioToken } from "@/lib/audio-token";
import { decrypt }      from "@/lib/encryption";

/**
 * POST /api/internal/audio-token/validate
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates a short-lived signed audio session token and returns decrypted
 * SonicPanel / DirectDjRadio credentials for backend-audio.
 *
 * ⚠️  INTERNAL ENDPOINT — FOR BACKEND-AUDIO USE ONLY ⚠️
 *
 * Credential resolution branches on token.sessionMode:
 *
 *   SCHEDULED (default):
 *     P1. SonicPanelCredential  WHERE presenterId=X AND stationId=Y
 *     P2. StationDefaultCredential WHERE stationId=Y
 *     P3. SonicPanelCredential  WHERE presenterId=X AND stationId IS NULL
 *     P4. null → sonicPanel:null; backend-audio may use .env dev credentials
 *
 *   DIRECT_DJ:
 *     D1. DirectDjRadio WHERE id=directDjRadioId AND presenterId=X AND isActive=true
 *     D2. fail — no fallback to Station or SonicPanelCredential
 *
 * Response shape is identical for both modes so backend-audio is unchanged.
 *
 * TODO (production hardening):
 *   • Restrict to localhost / 127.0.0.1 via reverse-proxy or middleware IP check.
 *   • Add shared INTERNAL_SECRET header.
 *   • Rate-limit: backend-audio calls this once per WebSocket connection.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function POST(req: Request) {

  // ── 1. Parse request body ────────────────────────────────────────────────
  let body: { token?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const token = body?.token;

  if (!token || typeof token !== "string" || token.trim() === "") {
    return NextResponse.json(
      { ok: false, error: "Missing or empty token field." },
      { status: 401 }
    );
  }

  // ── 2. Verify HMAC-signed token ──────────────────────────────────────────
  let payload: Awaited<ReturnType<typeof verifyAudioToken>>;
  try {
    payload = verifyAudioToken(token.trim());
  } catch (err) {
    const message = (err as Error).message ?? "Token validation failed.";

    let safeError = "Token is invalid or expired.";
    if (message.includes("expired"))        safeError = "Token has expired.";
    else if (message.includes("format"))    safeError = "Token format is invalid.";
    else if (message.includes("signature")) safeError = "Token signature is invalid.";
    else if (message.includes("decoded"))   safeError = "Token payload could not be read.";

    return NextResponse.json({ ok: false, error: safeError }, { status: 401 });
  }

  // ── 3. Resolve credentials based on sessionMode ──────────────────────────
  //
  //  SECURITY: passwords stored AES-256-CBC; decrypted only here, returned
  //  over localhost only. NEVER log djPassword / encryptedPassword.
  // ─────────────────────────────────────────────────────────────────────────

  let sonicPanel: {
    host:           string;
    port:           number;
    djUsername:     string;
    djPassword:     string;
    streamPassword: string | null;
    mount:          string | null;
    sid:            string | null;
    bitrate:        number;
  } | null = null;

  let credentialSource:
    | "presenter_station"
    | "station_default"
    | "legacy_presenter"
    | "direct_dj_radio"
    | null = null;

  const { presenterId, stationId, sessionMode, directDjRadioId } = payload;

  // Tokens issued before sessionMode was added default to 'SCHEDULED'
  const resolvedMode = sessionMode ?? 'SCHEDULED';

  try {

    // ════════════════════════════════════════════════════════════════════════
    // DIRECT_DJ branch — single lookup, zero fallback to Station credentials
    // ════════════════════════════════════════════════════════════════════════
    if (resolvedMode === 'DIRECT_DJ') {

      if (!directDjRadioId) {
        console.warn(`[validate] DIRECT_DJ token missing directDjRadioId for presenter ${presenterId}`);
        return NextResponse.json({ ok: false, error: "Invalid DIRECT_DJ token — missing radio target." }, { status: 401 });
      }

      const r = await prisma.directDjRadio.findFirst({
        where: {
          id:          directDjRadioId,
          presenterId,
          isActive:    true,
        },
      });

      if (r) {
        sonicPanel = {
          host:           r.host,
          port:           r.port,
          djUsername:     r.djUsername,
          djPassword:     decrypt(r.encryptedPassword),
          streamPassword: null,
          mount:          r.mount ?? null,
          sid:            r.sid  ?? null,
          bitrate:        r.bitrate,
        };
        credentialSource = "direct_dj_radio";
        console.log(`[validate] DIRECT_DJ D1 → ${r.djUsername}@${r.host}:${r.port} radio="${r.radioName}"`);
      } else {
        console.warn(
          `[validate] DIRECT_DJ: radio ${directDjRadioId} not found / inactive for presenter ${presenterId}`
        );
        // sonicPanel remains null — backend-audio will handle gracefully
      }

    } else {
      // ════════════════════════════════════════════════════════════════════
      // SCHEDULED branch — existing 4-step credential chain (unchanged)
      // ════════════════════════════════════════════════════════════════════

      // P1: per-presenter+station SonicPanelCredential
      if (stationId && !sonicPanel) {
        const c = await prisma.sonicPanelCredential.findFirst({
          where: { presenterId, stationId, isActive: true },
        });
        if (c) {
          sonicPanel = {
            host: c.host, port: c.port, djUsername: c.djUsername,
            djPassword:     decrypt(c.djPasswordEncrypted),
            streamPassword: c.streamPasswordEncrypted ? decrypt(c.streamPasswordEncrypted) : null,
            mount: c.mount ?? null, sid: c.sid ?? null, bitrate: c.bitrate,
          };
          credentialSource = "presenter_station";
          console.log(`[validate] P1 presenter+station → ${c.djUsername}@${c.host}:${c.port}`);
        }
      }

      // P2: StationDefaultCredential (station-wide fallback)
      if (stationId && !sonicPanel) {
        const c = await prisma.stationDefaultCredential.findFirst({
          where: { stationId, isActive: true },
        });
        if (c) {
          sonicPanel = {
            host: c.host, port: c.port, djUsername: c.djUsername,
            djPassword:     decrypt(c.encryptedPassword),
            streamPassword: null,
            mount: c.mount ?? null, sid: c.sid ?? null, bitrate: c.bitrate,
          };
          credentialSource = "station_default";
          console.log(`[validate] P2 station default → ${c.djUsername}@${c.host}:${c.port}`);
        }
      }

      // P3: legacy presenter-wide SonicPanelCredential (stationId IS NULL)
      if (!sonicPanel) {
        const c = await prisma.sonicPanelCredential.findFirst({
          where: { presenterId, stationId: null, isActive: true },
        });
        if (c) {
          sonicPanel = {
            host: c.host, port: c.port, djUsername: c.djUsername,
            djPassword:     decrypt(c.djPasswordEncrypted),
            streamPassword: c.streamPasswordEncrypted ? decrypt(c.streamPasswordEncrypted) : null,
            mount: c.mount ?? null, sid: c.sid ?? null, bitrate: c.bitrate,
          };
          credentialSource = "legacy_presenter";
          console.log(`[validate] P3 legacy presenter → ${c.djUsername}@${c.host}:${c.port}`);
        }
      }

      // P4: nothing found
      if (!sonicPanel) {
        console.warn(
          `[validate] No DJ credential found for presenter ${presenterId}` +
          (stationId ? ` station:${stationId}` : "") +
          " — sonicPanel:null returned."
        );
      }
    }

  } catch (dbErr) {
    console.error("[validate] Credential load/decrypt error:", (dbErr as Error).message);
    return NextResponse.json({ ok: false, error: "Internal error." }, { status: 500 });
  }

  // ── 4. Return success response ───────────────────────────────────────────
  return NextResponse.json({
    ok:               true,
    presenterId:      payload.presenterId,
    sessionMode:      resolvedMode,
    directDjRadioId:  payload.directDjRadioId ?? null,
    stationId:        payload.stationId,
    scheduleId:       payload.scheduleId,
    expiresAt:        payload.expiresAt,
    credentialSource,
    sonicPanel,
  });
}


