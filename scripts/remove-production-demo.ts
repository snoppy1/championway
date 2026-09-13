// One-off cleanup: uses an explicit production connection, never .env.local.
// Dry run: node --import tsx scripts/remove-production-demo.ts
// Apply:   node --import tsx scripts/remove-production-demo.ts --apply
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import postgres from 'postgres';
import { competitions } from '../src/data/competitions.js';
import { mentors } from '../src/data/mentors.js';

const path = '.env.production.local';
if (!existsSync(path)) {
  console.log('Blocked: create ignored .env.production.local with PRODUCTION_DATABASE_URL from Neon production. No database was accessed.');
  process.exit(2);
}
const url = parseEnv(readFileSync(path, 'utf8')).PRODUCTION_DATABASE_URL;
if (!url) throw new Error('Missing PRODUCTION_DATABASE_URL');
const local = existsSync('.env.local') ? parseEnv(readFileSync('.env.local', 'utf8')) : {};
const endpoint = (s: string) => new URL(s).hostname.replace('-pooler.', '.');
if ([local.DATABASE_URL, local.TEST_DATABASE_URL].filter(Boolean).some(s => endpoint(s) === endpoint(url))) {
  throw new Error('Refusing a connection with the same endpoint as dev/test');
}
const sql = postgres(url, { max: 1, onnotice: () => {} });
const apply = process.argv.includes('--apply');
try {
  await sql.begin(async tx => {
    await tx`SET LOCAL lock_timeout = '5s'`;
    await tx`LOCK TABLE competitions, mentors, competition_submissions, mentor_submissions, mentor_awards IN SHARE ROW EXCLUSIVE MODE`;
    const cs = await tx`SELECT * FROM competitions WHERE slug IN ${tx(competitions.map(c => c.slug))}`;
    const ms = await tx`SELECT * FROM mentors WHERE id IN ${tx(mentors.map(m => m.id))}`;
    // Match content as well as identity; never delete a real record reusing a demo slug.
    for (const c of cs) {
      const f = competitions.find(f => f.slug === c.slug)!;
      if (c.name !== f.name || c.description !== f.description || c.org !== f.org || c.source_url !== f.sourceUrl || c.prize_value !== f.prizeValue) {
        throw new Error('A competition was edited; manual review required');
      }
    }
    for (const m of ms) {
      const f = mentors.find(f => f.id === m.id)!;
      if (m.name !== f.name || m.bio !== f.bio || m.price !== f.price || m.best !== f.best || m.cannot !== f.cannot) {
        throw new Error('A mentor was edited; manual review required');
      }
    }
    if (!cs.length && !ms.length) { console.log('No matching public demo records remain.'); return; }
    if (cs.length !== 14 || ms.length !== 6) throw new Error('Expected the reviewed set of 14 competitions and 6 mentors; stopping for review');
    const cids = cs.map(c => c.id), mids = ms.map(m => m.id), slugs = cs.map(c => c.slug);
    const linked = await tx`
      SELECT id FROM competition_submissions WHERE published_competition_id IN ${tx(cids)}
      UNION ALL SELECT id FROM mentor_submissions WHERE published_mentor_id IN ${tx(mids)}
      UNION ALL SELECT a.id FROM mentor_awards a JOIN mentor_submissions s ON s.id = a.submission_id
        WHERE a.competition_slug IN ${tx(slugs)} AND s.user_id IS NOT NULL`;
    if (linked.length) throw new Error('Linked submissions found; stopping to preserve them');
    const [chatTable] = await tx`SELECT to_regclass('public.chat_rooms') AS name`;
    if (chatTable.name) {
      await tx`LOCK TABLE chat_rooms IN SHARE ROW EXCLUSIVE MODE`;
      const chats = await tx`SELECT id FROM chat_rooms WHERE mentor_id IN ${tx(mids)}`;
      if (chats.length) throw new Error('Linked conversations found; refusing cascade deletion');
    }
    const categories = await tx`SELECT * FROM competition_categories WHERE competition_id IN ${tx(cids)}`;
    const levels = await tx`SELECT * FROM competition_levels WHERE competition_id IN ${tx(cids)}`;
    const rewards = await tx`SELECT * FROM competition_rewards WHERE competition_id IN ${tx(cids)}`;
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', competitions: cs.length, mentors: ms.length, linkedRecords: 0 }));
    if (!apply) return;
    // This directory is ignored by git. Abort before deletion if the backup fails.
    mkdirSync('.production-backups', { recursive: true });
    const backup = `.production-backups/demo-${Date.now()}.json`;
    writeFileSync(backup, JSON.stringify({ competitions: cs, mentors: ms, competition_categories: categories, competition_levels: levels, competition_rewards: rewards }, null, 2), { flag: 'wx' });
    await tx`DELETE FROM competitions WHERE id IN ${tx(cids)}`;
    await tx`DELETE FROM mentors WHERE id IN ${tx(mids)}`;
    console.log(`Backup saved to ${backup}; removed the reviewed public demo records. Accounts and submissions were preserved.`);
  });
} catch {
  // Do not print postgres errors: some drivers include credentials or row data.
  console.error('Cleanup stopped and transaction rolled back. Check connection, expected counts and linked/edited records before retrying.');
  process.exitCode = 1;
} finally { await sql.end(); }
