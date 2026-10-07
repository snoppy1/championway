import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { eq, inArray, like } from 'drizzle-orm';
import { app } from '../server/app';
import { db, client } from '../server/db/client';
import { competitionImportSources, competitionImports, competitions, sessions, users } from '../server/db/schema';
import { testDatabase } from '../server/lib/database-safety';
import { createSession } from '../server/lib/session';
import { aiError, cleanDraft, setExtractor } from '../server/lib/import/extract';
import { htmlToText, normalizeUrl, parseRss } from '../server/lib/import/parse';
import { FetchRefused, checkUrl, isBlockedAddress, safeFetch } from '../server/lib/import/safe-fetch';
import type { ImportDraft } from '../src/data/imports';

/* ระบบดึงงานแข่งอัตโนมัติ (5 ต.ค. 2569): เทสไม่ออกอินเทอร์เน็ต AI ถูกแทนด้วยตัวปลอม */

testDatabase(process.env);
process.env.ANTHROPIC_API_KEY = 'test-offline';
const prefix = `imp-${randomUUID().slice(0, 8)}`;
const userIds: string[] = [];

async function account(role: 'admin' | 'reviewer') {
  const id = `${prefix}-${role}-${userIds.length}`;
  await db.insert(users).values({ id, email: `${id}@championways.test`, name: role, role, emailVerifiedAt: new Date() });
  userIds.push(id);
  return `cw_session=${(await createSession(id)).id}`;
}
const call = (method: string, path: string, cookie: string, body?: unknown) => app.request(`/api/admin${path}`, {
  method, headers: { cookie, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
});

const emptyDraft: ImportDraft = {
  name: null, org: null, description: null, type: null, kind: null, themes: [], categories: [], levels: [], rewards: [],
  teamMin: null, teamMax: null, opensAt: null, closesAt: null, eventDate: null, region: null, venue: null,
  prizeValue: null, prizeNote: null, fee: null, registerUrl: null, keywords: [],
};

test('links that point inside the network are refused before any request', async () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.1.1', '172.20.0.1', '::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0']) {
    assert.equal(isBlockedAddress(address), true, address);
  }
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isBlockedAddress(address), false, address);
  for (const url of ['ftp://example.com/x', 'file:///etc/passwd', 'http://127.0.0.1/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://2130706433/', 'http://user:pw@example.com/', 'http://example.com:8080/', 'http://169.254.169.254/latest/meta-data']) {
    assert.throws(() => checkUrl(url), FetchRefused, url);
  }
  // ชื่อโดเมนที่ชี้ไป IP ภายใน ถูกกันตอนเชื่อมต่อ
  await assert.rejects(safeFetch('http://localhost/'), FetchRefused);
});

test('feeds and pages become plain text, and the AI answer is cleaned', async () => {
  const items = parseRss(`<rss><channel><item><title><![CDATA[ประกวด A &amp; B]]></title><link>https://x.test/a/</link>
    <pubDate>Mon, 05 Oct 2026 14:59:30 +0000</pubDate><category><![CDATA[ประกวด]]></category></item>
    <item><title>no link</title><link>javascript:alert(1)</link></item></channel></rss>`);
  assert.deepEqual(items.map((item) => [item.title, item.link, item.categories]), [['ประกวด A & B', 'https://x.test/a/', ['ประกวด']]]);
  const page = htmlToText('<html><head><title>T &#3585;</title><script>evil()</script></head><body><nav>menu</nav><p>สมัครที่ <a href="https://reg.test/f">ลิงก์</a></p></body></html>');
  assert.equal(page.title, 'T ก');
  assert.match(page.text, /สมัครที่ ลิงก์ \(https:\/\/reg\.test\/f\)/);
  assert.doesNotMatch(page.text, /evil|menu/);
  assert.equal(normalizeUrl('https://X.test/a/?utm_source=fb#top'), 'https://x.test/a');
  const cleaned = cleanDraft({ name: 'งาน', type: 'party', kind: 'hackathon', categories: ['technology', 'nope', 'technology'], closesAt: '2026-13-40', prizeValue: -5, registerUrl: 'javascript:x', teamMin: 2 });
  assert.deepEqual([cleaned.type, cleaned.kind, cleaned.categories, cleaned.closesAt, cleaned.prizeValue, cleaned.registerUrl, cleaned.teamMin],
    [null, 'hackathon', ['technology'], null, null, null, 2]);
  // แอดมินต้องเห็นว่า AI ปฏิเสธเพราะอะไร ไม่ใช่แค่ HTTP 400 (7 ต.ค. 2569)
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  assert.match(await aiError(reply(400, { error: { message: 'Your credit balance is too low to access the Anthropic API.' } })), /เครดิต/);
  assert.match(await aiError(reply(401, { error: { message: 'invalid x-api-key' } })), /ไม่ถูกต้อง/);
  assert.equal(await aiError(reply(400, { error: { message: 'tools.0: bad schema' } })), 'AI ตอบ HTTP 400: tools.0: bad schema');
  assert.equal(await aiError(new Response('oops', { status: 500 })), 'AI ตอบ HTTP 500');
});

test('drafts are queued, reviewed, accepted once into a listing, or rejected', async (t) => {
  const admin = await account('admin');
  const reviewer = await account('reviewer');
  const existingId = `${prefix}-cmp`;
  await db.insert(competitions).values({
    id: existingId, slug: existingId, name: `${prefix} Existing Cup`, description: 'x', type: 'contest', kind: 'hackathon', org: 'o',
    closesAt: '2099-01-01', region: 'online', prizeValue: 0, prizeNote: 'ใบประกาศ', teamMin: 1, teamMax: 3, keywords: [],
    sourceUrl: 'https://example.test/existing', source: 'editorial', lastVerifiedAt: '2026-10-05',
  });
  let calls = 0;
  setExtractor(async ({ text }) => {
    calls += 1;
    const name = text.includes('DUPLICATE') ? `${prefix} existing cup` : `${prefix} New Hack ${calls}`;
    return {
      itemKind: text.includes('RESULT') ? 'result' : 'call',
      draft: { ...emptyDraft, name, org: 'NSTDA', kind: 'hackathon', themes: ['innovation'], categories: ['technology'], levels: ['university'], closesAt: '2099-02-01', prizeValue: 30000 },
      uncertain: ['teamMax'], note: 'ตรวจขนาดทีม',
    };
  });
  const announcement = (extra: string) => `${extra} ประกาศรับสมัครแข่งขันแฮกกาธอนสำหรับนักศึกษา ปิดรับ 1 กุมภาพันธ์ 2642 รางวัลรวม 30,000 บาท`;
  try {
    await t.test('every source starts switched off, and only admins can switch one on', async () => {
      await db.delete(competitionImportSources);
      const list = await (await call('GET', '/imports', reviewer)).json();
      assert.ok(list.sources.every((source: { enabled: boolean }) => source.enabled === false));
      assert.equal((await call('PUT', '/imports/sources/ysc', reviewer, { enabled: true })).status, 403);
      assert.equal((await call('POST', '/imports/run', reviewer, {})).status, 403);
      const on = await (await call('PUT', '/imports/sources/ysc', admin, { enabled: true })).json();
      assert.equal(on.sources.find((s: { id: string }) => s.id === 'ysc').enabled, true);
      assert.equal((await call('PUT', '/imports/sources/contester', admin, { enabled: true })).status, 404);
      await call('PUT', '/imports/sources/ysc', admin, { enabled: false });
    });

    let draftId = '';
    await t.test('a pasted announcement becomes a draft waiting for review; news goes to the side', async () => {
      const response = await call('POST', '/imports/manual', reviewer, { text: announcement('A') });
      assert.equal(response.status, 201, await response.clone().text());
      draftId = (await response.json()).id;
      const pending = await (await call('GET', '/imports?status=pending', reviewer)).json();
      const row = pending.items.find((item: { id: string }) => item.id === draftId);
      assert.equal(row.draft.org, 'NSTDA');
      assert.deepEqual(row.uncertain, ['teamMax']);
      const news = await (await call('POST', '/imports/manual', reviewer, { text: announcement('RESULT') })).json();
      const [skipped] = await db.select().from(competitionImports).where(eq(competitionImports.id, news.id));
      assert.equal(skipped.status, 'skipped');
      const dup = await (await call('POST', '/imports/manual', reviewer, { text: announcement('DUPLICATE') })).json();
      const [dupRow] = await db.select().from(competitionImports).where(eq(competitionImports.id, dup.id));
      assert.equal(dupRow.duplicateOf, existingId);
    });

    await t.test('internal links and empty pastes are refused', async () => {
      assert.equal((await call('POST', '/imports/manual', reviewer, { url: 'http://169.254.169.254/latest' })).status, 400);
      assert.equal((await call('POST', '/imports/manual', reviewer, { url: 'file:///etc/passwd' })).status, 400);
      assert.equal((await call('POST', '/imports/manual', reviewer, {})).status, 400);
      assert.equal((await call('POST', '/imports/manual', reviewer, { text: 'สั้น' })).status, 400);
    });

    await t.test('accepting creates exactly one listing and closes the draft', async () => {
      const listing = {
        kind: 'hackathon', themes: ['innovation'], name: `${prefix} New Hack accepted`, description: 'สรุป', type: 'contest', org: 'NSTDA',
        categories: ['technology'], levels: ['university'], teamMin: 1, teamMax: 3, closesAt: '2099-02-01', region: 'online',
        prizeValue: 30000, sourceUrl: 'https://example.test/new', importId: draftId,
      };
      const created = await call('POST', '/listings', reviewer, listing);
      assert.equal(created.status, 201, await created.clone().text());
      const { id } = await created.json();
      const [row] = await db.select().from(competitionImports).where(eq(competitionImports.id, draftId));
      assert.deepEqual([row.status, row.competitionId], ['accepted', id]);
      const again = await call('POST', '/listings', reviewer, { ...listing, name: `${prefix} New Hack twice` });
      assert.equal(again.status, 409);
      const twice = await db.select().from(competitions).where(eq(competitions.name, `${prefix} New Hack twice`));
      assert.equal(twice.length, 0);
      assert.equal((await call('POST', `/imports/${draftId}/reject`, reviewer, { reason: 'x' })).status, 409);
    });

    await t.test('rejecting needs a reason and happens once', async () => {
      const { id } = await (await call('POST', '/imports/manual', reviewer, { text: announcement('B') })).json();
      assert.equal((await call('POST', `/imports/${id}/reject`, reviewer, { reason: '' })).status, 400);
      assert.equal((await call('POST', `/imports/${id}/reject`, reviewer, { reason: 'ปิดรับแล้ว' })).status, 200);
      assert.equal((await call('POST', `/imports/${id}/reject`, reviewer, { reason: 'ซ้ำ' })).status, 409);
    });

    await t.test('without an AI key nothing is read', async () => {
      delete process.env.ANTHROPIC_API_KEY;
      assert.equal((await call('POST', '/imports/manual', reviewer, { text: announcement('C') })).status, 503);
      process.env.ANTHROPIC_API_KEY = 'test-offline';
    });
  } finally {
    setExtractor(null);
    await db.delete(competitionImports).where(like(competitionImports.title, `${prefix}%`));
    await db.delete(competitionImports).where(inArray(competitionImports.createdBy, userIds));
    await db.delete(competitions).where(like(competitions.name, `${prefix}%`));
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await client.end();
  }
});
