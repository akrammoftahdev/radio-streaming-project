import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

// ── Key resolution ─────────────────────────────────────────────────────────
// ENCRYPTION_KEY is a runtime secret injected by Cloud Run from Secret Manager.
// It is NOT available at `next build` time (and must never be baked into the
// Docker image).
//
// We intentionally defer the key validation to the moment encrypt/decrypt are
// actually called, so that `next build` can complete without a real key being
// present.  Any call to encrypt/decrypt at request time will immediately throw
// if the key is missing or wrong-length — ensuring no silent degradation in
// production.
//
// DO NOT restore the module-level throw: it causes `next build` to fail when
// Next.js statically collects page data for API routes that import this module.
// ─────────────────────────────────────────────────────────────────────────────

function getKey(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 32) {
    throw new Error(
      "ENCRYPTION_KEY must be a 32-character string in environment variables."
    );
  }
  return key;
}

export function encrypt(text: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(text: string): string {
  const key = getKey();
  const textParts = text.split(':');
  const ivHex = textParts.shift();
  if (!ivHex) throw new Error("Invalid encrypted text format");
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
