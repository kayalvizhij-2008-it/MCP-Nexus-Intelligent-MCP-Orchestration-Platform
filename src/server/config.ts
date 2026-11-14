import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const ROOT = process.cwd();
export const DATA_DIR = path.resolve(process.env.MCPNEXUS_DATA_DIR ?? path.join(ROOT, 'data'));
export const WORKSPACE_DIR = path.resolve(
  process.env.MCPNEXUS_WORKSPACE ?? path.join(DATA_DIR, 'workspace'),
);
export const DB_PATH = path.join(DATA_DIR, 'nexus.db');

const KEY_FILE = path.join(DATA_DIR, 'master.key');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(WORKSPACE_DIR, { recursive: true });

function loadMasterKey(): Buffer {
  const fromEnv = process.env.MCPNEXUS_MASTER_KEY;
  if (fromEnv && /^[0-9a-f]{64}$/i.test(fromEnv.trim())) {
    return Buffer.from(fromEnv.trim(), 'hex');
  }
  if (fs.existsSync(KEY_FILE)) {
    return Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'hex');
  }
  const key = randomBytes(32);
  fs.writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 });
  return key;
}

/** 32-byte key used for AES-256-GCM encryption of stored integration secrets. */
export const MASTER_KEY = loadMasterKey();

function resolvePort(): number {
  for (const candidate of [process.env.MCPNEXUS_PORT, process.env.PORT]) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) return parsed;
  }
  return 4317;
}

export const PORT = resolvePort();
export const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const IS_PROD = NODE_ENV === 'production';

export const COOKIE_SECURE = process.env.MCPNEXUS_COOKIE_SECURE === 'true' || IS_PROD;
export const SESSION_TTL_MS = Number(process.env.MCPNEXUS_SESSION_TTL_HOURS ?? 24 * 7) * 3600_000;
export const TOOL_TIMEOUT_MS = Number(process.env.MCPNEXUS_TOOL_TIMEOUT_MS ?? 60_000);
export const CONNECT_TIMEOUT_MS = Number(process.env.MCPNEXUS_CONNECT_TIMEOUT_MS ?? 20_000);
export const RATE_LIMIT_PER_MINUTE = Number(process.env.MCPNEXUS_RATE_LIMIT_PER_MINUTE ?? 240);

export const ADMIN_EMAIL = process.env.MCPNEXUS_ADMIN_EMAIL?.trim() || 'admin@mcpnexus.local';
export const ADMIN_NAME = process.env.MCPNEXUS_ADMIN_NAME ?? 'Nexus Administrator';
/**
 * Optional bootstrap password. There is deliberately no default: when this is
 * unset the first run generates a random password and writes it to
 * data/initial-admin.txt (mode 0600). Never ship a guessable production login.
 */
export const ADMIN_PASSWORD = process.env.MCPNEXUS_ADMIN_PASSWORD?.trim() || undefined;

/** Where a generated bootstrap password is written when none was supplied. */
export const BOOTSTRAP_PASSWORD_FILE = path.join(DATA_DIR, 'initial-admin.txt');

/** MCPNEXUS platform version surfaced by /api/meta. */
export const PLATFORM_VERSION = '1.0.0';
