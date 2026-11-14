import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';
import { MASTER_KEY } from './config.js';

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, n, r, p, salt, digest] = stored.split('$');
    if (algo !== 'scrypt' || !salt || !digest) return false;
    const expected = Buffer.from(digest, 'hex');
    const actual = scryptSync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function newId(): string {
  return randomUUID();
}

/**
 * Encrypt a JSON-serialisable value for storage at rest.
 * Format: v1.<iv-b64>.<tag-b64>.<ciphertext-b64>
 */
export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  const plaintext = Buffer.from(JSON.stringify(value ?? {}), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptJson<T = Record<string, string>>(blob: string | null | undefined): T {
  if (!blob) return {} as T;
  if (!blob.startsWith('v1.')) {
    // Legacy/plain JSON column (never written by this server, tolerated on read).
    try {
      return JSON.parse(blob) as T;
    } catch {
      return {} as T;
    }
  }
  try {
    const [, ivB64, tagB64, dataB64] = blob.split('.');
    const decipher = createDecipheriv('aes-256-gcm', MASTER_KEY, Buffer.from(ivB64!, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataB64!, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8')) as T;
  } catch {
    return {} as T;
  }
}

/** Returns a redacted view of a secret map: names and masked values only. */
export function maskSecretMap(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(map)) {
    out[key] = maskValue(value);
  }
  return out;
}

export function maskValue(value: string): string {
  if (!value) return '';
  if (value.length <= 4) return '••••';
  if (value.length <= 8) return `${value.slice(0, 1)}••••${value.slice(-1)}`;
  return `${value.slice(0, 3)}••••••••${value.slice(-3)}`;
}

/** Placeholder written by the UI when the user leaves a secret field untouched. */
export const SECRET_PLACEHOLDER = '********';
