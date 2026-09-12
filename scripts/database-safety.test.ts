import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDatabase } from '../server/lib/database-safety';
const settings = { APP_ENV: 'test', DATABASE_URL: 'postgres://dev:secret@ep-dev.neon.tech/neondb', TEST_DATABASE_URL: 'postgres://test:secret@ep-test.neon.tech/neondb', TEST_DATABASE_RESET_ALLOWED: 'true' };
test('accepts a separate disposable database', () => assert.equal(testDatabase(settings), settings.TEST_DATABASE_URL));
test('requires URL and explicit reset permission', () => {
  for (const key of ['DATABASE_URL', 'TEST_DATABASE_URL', 'TEST_DATABASE_RESET_ALLOWED']) assert.throws(() => testDatabase({ ...settings, [key]: undefined }));
});
test('refuses production and deployments', () => {
  for (const overrides of [{ APP_ENV: 'dev' }, { NODE_ENV: 'production' }, { VERCEL: '1' }]) assert.throws(() => testDatabase({ ...settings, ...overrides }));
});
test('normalizes pooled/direct URLs and ignores credentials', () => {
  assert.throws(() => testDatabase({ ...settings, TEST_DATABASE_URL: 'postgresql://another:password@ep-dev-pooler.neon.tech:5432/neondb?sslmode=require' }));
  assert.throws(() => testDatabase({ ...settings, PRODUCTION_DATABASE_URL: settings.TEST_DATABASE_URL }));
});
test('invalid URLs do not leak credentials', () => {
  assert.throws(() => testDatabase({ ...settings, TEST_DATABASE_URL: 'secret-invalid-url' }), /Invalid database URL; credentials are not displayed/);
});
