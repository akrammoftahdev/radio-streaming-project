import crypto from 'crypto';

/**
 * audio-token.ts
 * --------------------------------------------------------
 * Lightweight HMAC-SHA256 signed token utility for the
 * backend-audio WebSocket auth handshake.
 *
 * The token payload is base64url-encoded JSON signed with
 * AUDIO_TOKEN_SECRET. No external JWT library is required.
 *
 * Token format (after base64url decode):
 *   header.payload.signature
 * where:
 *   header    = base64url({ alg: "HS256", typ: "EGONAIR-AUDIO" })
 *   payload   = base64url({ presenterId, scheduleId, issuedAt, expiresAt })
 *   signature = HMAC-SHA256(header + "." + payload, secret)
 * --------------------------------------------------------
 */

const ALGORITHM = 'sha256';
const TOKEN_TTL_SECONDS = 300; // 5 minutes

export interface AudioTokenPayload {
  presenterId:     string;
  scheduleId:      string | null;
  stationId:       string | null;  // Step 4B — which station this session is broadcasting on
  // Session mode: determines credential resolution path in validate route.
  //   SCHEDULED  — use SonicPanelCredential / StationDefaultCredential chain
  //   DIRECT_DJ  — use DirectDjRadio by directDjRadioId
  sessionMode:     'SCHEDULED' | 'DIRECT_DJ';
  directDjRadioId: string | null;  // only set when sessionMode='DIRECT_DJ'
  issuedAt:        string; // ISO 8601
  expiresAt:       string; // ISO 8601
}

function b64url(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function getSecret(): string {
  const secret = process.env.AUDIO_TOKEN_SECRET;
  if (!secret) {
    throw new Error('AUDIO_TOKEN_SECRET is not set in environment variables.');
  }
  return secret;
}

export function createAudioToken(
  presenterId:     string,
  scheduleId:      string | null = null,
  stationId:       string | null = null,   // Step 4B — optional; null = legacy/any station
  sessionMode:     'SCHEDULED' | 'DIRECT_DJ' = 'SCHEDULED',
  directDjRadioId: string | null = null    // only used when sessionMode='DIRECT_DJ'
): { token: string; payload: AudioTokenPayload } {
  const secret = getSecret();

  const now      = new Date();
  const expires  = new Date(now.getTime() + TOKEN_TTL_SECONDS * 1000);

  const payload: AudioTokenPayload = {
    presenterId,
    scheduleId,
    stationId,
    sessionMode,
    directDjRadioId,
    issuedAt:  now.toISOString(),
    expiresAt: expires.toISOString(),
  };

  const header     = b64url(JSON.stringify({ alg: 'HS256', typ: 'EGONAIR-AUDIO' }));
  const body       = b64url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;

  const signature = crypto
    .createHmac(ALGORITHM, secret)
    .update(signingInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return {
    token: `${signingInput}.${signature}`,
    payload,
  };
}

export function verifyAudioToken(token: string): AudioTokenPayload {
  const secret = getSecret();

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token format.');
  }

  const [header, body, signature] = parts;
  const signingInput = `${header}.${body}`;

  const expectedSig = crypto
    .createHmac(ALGORITHM, secret)
    .update(signingInput)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    throw new Error('Token signature is invalid.');
  }

  let payload: AudioTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64').toString('utf8'));
  } catch {
    throw new Error('Token payload could not be decoded.');
  }

  if (new Date(payload.expiresAt) < new Date()) {
    throw new Error('Token has expired.');
  }

  return payload;
}
