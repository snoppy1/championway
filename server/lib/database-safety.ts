type Settings = Record<string, string | undefined>;
function identity(value: string) {
  try {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error();
    return `${url.hostname.replace(/-pooler(?=\.)/, '')}:${url.port || '5432'}${url.pathname}`;
  } catch { throw new Error('Invalid database URL; credentials are not displayed.'); }
}
export function testDatabase(settings: Settings) {
  if (settings.VERCEL || settings.NODE_ENV === 'production' || settings.APP_ENV !== 'test') throw new Error('Database reset is allowed only in a local/CI test environment.');
  const test = settings.TEST_DATABASE_URL;
  const dev = settings.DATABASE_URL;
  if (!test || !dev || settings.TEST_DATABASE_RESET_ALLOWED !== 'true') throw new Error('Tests require DATABASE_URL, a separate TEST_DATABASE_URL, and TEST_DATABASE_RESET_ALLOWED=true for a disposable test database.');
  if (identity(test) === identity(dev) || (settings.PRODUCTION_DATABASE_URL && identity(test) === identity(settings.PRODUCTION_DATABASE_URL))) throw new Error('Test database must differ from development and production databases.');
  return test;
}
