import { all, get, run } from './db.js';

export function getSetting(key: string): string | undefined {
  return get('SELECT value FROM settings WHERE key = ?', key)?.value;
}

export function setSetting(key: string, value: string) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

export function getSettings(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const row of all<{ key: string; value: string }>('SELECT key, value FROM settings')) {
    result[row.key] = row.value;
  }
  return result;
}
