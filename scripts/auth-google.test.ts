import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import { users, sessions } from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { safeNext } from '../src/lib/safe-next';

testDatabase(process.env);
const prefix = `oauth-${randomUUID()}`;
const emails = Array.from({ length: 5 }, (_, i) => `${prefix}-${i}@gmail.com`);
const realFetch = globalThis.fetch;
let profile: Record<string, unknown> = {};
let tokenFails = false;
let sentVerifier = '';
let calls = 0;
globalThis.fetch = async (input, init) => {
  calls++;
  const url = String(input);
  if (url === 'https://oauth2.googleapis.com/token') {
    const body = new URLSearchParams(String(init?.body));
    assert.equal(body.get('redirect_uri'), `${process.env.APP_ORIGIN}/api/auth/google/callback`);
    assert.equal(body.get('client_secret'), 'test-only-secret');
    sentVerifier = body.get('code_verifier') ?? '';
    return Response.json(tokenFails ? { error: 'invalid_grant' } : { access_token: 'test-access-token' }, { status: tokenFails ? 400 : 200 });
  }
  if (url === 'https://openidconnect.googleapis.com/v1/userinfo') {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-access-token');
    return Response.json(profile);
  }
  throw new Error('Unexpected external request in OAuth test');
};
async function start(next = '/mentors/apply', remember = false) {
  const response = await app.request(`/api/auth/google?next=${encodeURIComponent(next)}&remember=${remember ? '1' : '0'}`);
  assert.equal(response.status, 302);
  const url = new URL(response.headers.get('location')!);
  const cookies = response.headers.getSetCookie();
  assert.ok(cookies.every(c => c.includes('HttpOnly') && c.includes('SameSite=Lax')));
  return { url, cookie: cookies.map(c => c.split(';')[0]).join('; ') };
}
async function finish(flow: Awaited<ReturnType<typeof start>>, query = '') {
  return app.request(`/api/auth/google/callback?code=sample-code&state=${flow.url.searchParams.get('state')}${query}`, { headers: { cookie: flow.cookie } });
}
function sessionCookie(response: Response) {
  return response.headers.getSetCookie().find(c => c.startsWith('cw_session='))?.split(';')[0];
}

test('Google authorization and callback against isolated test database', async t => {
  try {
    await t.test('provider, PKCE, scopes and safe internal destinations', async () => {
      assert.equal((await (await app.request('/api/auth/providers')).json()).google, true);
      const flow = await start('/\\outside.example');
      assert.equal(flow.url.origin, 'https://accounts.google.com');
      assert.equal(flow.url.searchParams.get('scope'), 'openid email profile');
      assert.equal(flow.url.searchParams.get('code_challenge_method'), 'S256');
      for (const path of ['//outside.example', '/\\outside.example', '/\n/outside.example', 'https://outside.example']) assert.equal(safeNext(path), '/');
      assert.equal(safeNext('/mentors/apply?from=home'), '/mentors/apply?from=home');
    });
    await t.test('new Google account creates member session; refresh and logout work', async () => {
      profile = { sub: `${prefix}-sub`, email: emails[0], email_verified: true, name: 'Google Test' };
      const flow = await start();
      const response = await finish(flow);
      assert.equal(response.headers.getSetCookie().find(c => c.startsWith('cw_session='))!.includes('Expires='), false);
      assert.equal(response.headers.get('location'), `${process.env.APP_ORIGIN}/mentors/apply`);
      assert.equal(createHash('sha256').update(sentVerifier).digest('base64url'), flow.url.searchParams.get('code_challenge'));
      assert.ok(response.headers.getSetCookie().filter(c => c.startsWith('cw_oauth_')).every(c => c.includes('Max-Age=0')));
      const cookie = sessionCookie(response)!;
      assert.ok(cookie);
      const me = await (await app.request('/api/auth/me', { headers: { cookie } })).json();
      assert.equal(me.user.role, 'member');
      assert.equal(me.user.email, emails[0]);
      const again = await finish(await start('/mentors/apply', true));
      assert.equal(again.headers.getSetCookie().find(c => c.startsWith('cw_session='))!.includes('Expires='), true);
      assert.ok(sessionCookie(again));
      assert.equal((await db.select().from(users).where(eq(users.googleId, `${prefix}-sub`))).length, 1);
      assert.equal((await app.request('/api/auth/logout', { method: 'POST', headers: { cookie } })).status, 200);
      assert.equal((await (await app.request('/api/auth/me', { headers: { cookie } })).json()).user, null);
    });
    await t.test('cancel and invalid state return useful errors and keep destination', async () => {
      const before = calls;
      const flow = await start();
      const invalid = await app.request('/api/auth/google/callback?code=x&state=wrong', { headers: { cookie: flow.cookie } });
      assert.ok(new URL(invalid.headers.get('location')!).searchParams.get('error'));
      assert.equal(sessionCookie(invalid), undefined);
      const cancelled = await finish(await start(), '&error=access_denied');
      assert.equal(new URL(cancelled.headers.get('location')!).searchParams.get('next'), '/mentors/apply');
      assert.equal(calls, before);
    });
    await t.test('missing subject, missing verification and unverified email cannot sign in', async () => {
      for (const bad of [{ email: emails[1], email_verified: true }, { sub: 'bad', email: emails[1] }, { sub: 'bad', email: emails[1], email_verified: false }]) {
        profile = bad;
        const response = await finish(await start());
        assert.equal(sessionCookie(response), undefined);
        assert.equal(new URL(response.headers.get('location')!).pathname, '/signin');
      }
      assert.equal((await db.select().from(users).where(eq(users.email, emails[1]))).length, 0);
    });
    await t.test('provider failure returns to sign-in without exposing secrets', async () => {
      tokenFails = true;
      const response = await finish(await start());
      tokenFails = false;
      assert.equal(sessionCookie(response), undefined);
      assert.ok(!response.headers.get('location')!.includes('test-only-secret'));
    });
    await t.test('verified Gmail can link an unlinked email account without changing its role', async () => {
      await db.insert(users).values({ id: `${prefix}-existing`, email: emails[2], name: 'Existing', role: 'member' });
      profile = { sub: `${prefix}-linked`, email: emails[2], email_verified: true };
      assert.ok(sessionCookie(await finish(await start())));
      const [row] = await db.select().from(users).where(eq(users.email, emails[2]));
      assert.equal(row.id, `${prefix}-existing`);
      assert.equal(row.googleId, `${prefix}-linked`);
      assert.equal(row.role, 'member');
    });
    await t.test('cannot overwrite a different Google identity on the same email', async () => {
      profile = { sub: `${prefix}-attacker`, email: emails[2], email_verified: true };
      assert.equal(sessionCookie(await finish(await start())), undefined);
      const [row] = await db.select().from(users).where(eq(users.email, emails[2]));
      assert.equal(row.googleId, `${prefix}-linked`);
    });
    await t.test('external email without Workspace authority cannot auto-link', async () => {
      const email = `${prefix}@example.com`;
      emails.push(email);
      await db.insert(users).values({ id: `${prefix}-external`, email, name: 'External', role: 'member' });
      profile = { sub: `${prefix}-external-sub`, email, email_verified: true };
      assert.equal(sessionCookie(await finish(await start())), undefined);
      const [row] = await db.select().from(users).where(eq(users.email, email));
      assert.equal(row.googleId, null);
    });
  } finally {
    globalThis.fetch = realFetch;
    const rows = await db.select({ id: users.id }).from(users).where(inArray(users.email, emails));
    if (rows.length) {
      await db.delete(sessions).where(inArray(sessions.userId, rows.map(r => r.id)));
      await db.delete(users).where(inArray(users.id, rows.map(r => r.id)));
    }
    await client.end();
  }
});
