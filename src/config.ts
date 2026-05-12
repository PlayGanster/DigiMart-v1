interface Config {
  botToken: string;
  databaseUrl: string;
  adminIds: number[];
}

function parseAdminIds(idsString?: string): number[] {
  if (!idsString) return [];
  return idsString
    .split(',')
    .map((id) => parseInt(id.trim(), 10))
    .filter((id) => !Number.isNaN(id));
}

function validateConfig(): Config {
  const botToken = process.env.BOT_TOKEN;
  const databaseUrl = process.env.DATABASE_URL;
  const adminIdsRaw = process.env.ADMIN_IDS;

  if (!botToken) {
    throw new Error('Missing required environment variable: BOT_TOKEN');
  }

  if (!databaseUrl) {
    throw new Error('Missing required environment variable: DATABASE_URL');
  }

  return {
    botToken,
    databaseUrl,
    adminIds: parseAdminIds(adminIdsRaw),
  };
}

export const config: Config = validateConfig();
