import 'dotenv/config';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function parseAdminIds(raw: string): number[] {
  return raw.split(',').map(Number);
}

export const BOT_TOKEN = requireEnv('BOT_TOKEN');
export const DATABASE_URL = requireEnv('DATABASE_URL');
export const ADMIN_IDS = parseAdminIds(requireEnv('ADMIN_IDS'));
export const NEKORAY_PORT = process.env.NEKORAY_PORT || '2080';
export const NODE_ENV = process.env.NODE_ENV || 'production';
export const IS_DEV = NODE_ENV === 'development';

if (ADMIN_IDS.some(isNaN)) {
  throw new Error('ADMIN_IDS must be comma-separated numeric Telegram IDs');
}
