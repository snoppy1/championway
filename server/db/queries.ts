import { and, arrayOverlaps, asc, desc, eq, exists, gte, ilike, inArray, lte, ne, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { db } from './client.js';
import {
  competitionCategories, competitionLevels, competitionRewards, competitions,
} from './schema.js';

type Category = (typeof competitionCategories.$inferSelect)['category'];
type Level = (typeof competitionLevels.$inferSelect)['level'];
type Reward = (typeof competitionRewards.$inferSelect)['reward'];
type Row = typeof competitions.$inferSelect;

export type CompetitionRecord = Row & {
  categories: Category[];
  levels: Level[];
  rewards: Reward[];
};

/** ดึงหมวด ระดับ และรางวัลของเวทีทั้งหน้าในสามคิวรี แทนที่จะยิงต่อเวที */
async function attachJoins(rows: Row[]): Promise<CompetitionRecord[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const [cats, levels, rewards] = await Promise.all([
    db.select().from(competitionCategories)
      .where(inArray(competitionCategories.competitionId, ids))
      .orderBy(asc(competitionCategories.position)),
    db.select().from(competitionLevels).where(inArray(competitionLevels.competitionId, ids)),
    db.select().from(competitionRewards).where(inArray(competitionRewards.competitionId, ids)),
  ]);
  function group<T extends { competitionId: string }, V extends string>(list: T[], pick: (item: T) => V) {
    const map = new Map<string, V[]>();
    for (const item of list) {
      const bucket = map.get(item.competitionId) ?? [];
      bucket.push(pick(item));
      map.set(item.competitionId, bucket);
    }
    return map;
  }
  const catMap = group(cats, (item) => item.category);
  const levelMap = group(levels, (item) => item.level);
  const rewardMap = group(rewards, (item) => item.reward);
  return rows.map((row) => ({
    ...row,
    categories: catMap.get(row.id) ?? [],
    levels: levelMap.get(row.id) ?? [],
    rewards: rewardMap.get(row.id) ?? [],
  }));
}

export type ListQuery = {
  kind?: string;
  themes?: string[];
  query: string;
  categories: Category[];
  types: Row['type'][];
  levels: Level[];
  regions: Row['region'][];
  teamSizes: { min: number; max: number }[];
  rewards: Reward[];
  prizeMin: number;
  prizeMax: number | null;
  freeOnly: boolean;
  timing: 'd7' | 'd30' | 'upcoming' | '';
  sort: 'deadline' | 'new' | 'prize' | 'name';
  slugs: string[] | null;
  page: number;
  perPage: number;
};

/* ใช้ exists แทน join เพราะเวทีหนึ่งมีได้หลายหมวด ถ้า join แถวจะซ้ำแล้วนับผิด */

function hasCategory(values: Category[]) {
  return exists(db.select({ one: sql`1` }).from(competitionCategories).where(and(
    eq(competitionCategories.competitionId, competitions.id),
    inArray(competitionCategories.category, values),
  )));
}

function hasLevel(values: Level[]) {
  return exists(db.select({ one: sql`1` }).from(competitionLevels).where(and(
    eq(competitionLevels.competitionId, competitions.id),
    inArray(competitionLevels.level, values),
  )));
}

function hasReward(values: Reward[]) {
  return exists(db.select({ one: sql`1` }).from(competitionRewards).where(and(
    eq(competitionRewards.competitionId, competitions.id),
    inArray(competitionRewards.reward, values),
  )));
}

export async function listCompetitions(input: ListQuery) {
  const filters: SQL[] = [sql`${competitions.kind} is not null`, sql`cardinality(${competitions.themes}) > 0`];
  if (input.kind) filters.push(sql`${competitions.kind} = ${input.kind}`);
  if (input.themes?.length) filters.push(arrayOverlaps(competitions.themes, input.themes));

  for (const term of input.query.trim().toLowerCase().split(/\s+/).filter(Boolean)) {
    const like = `%${term}%`;
    // ภาษาไทยไม่มีการตัดคำที่เชื่อถือได้ จึงค้นแบบมีคำนั้นอยู่ในข้อความ
    // ซึ่งตรงกับพฤติกรรมเดิมของหน้าเว็บ
    filters.push(or(
      ilike(competitions.name, like),
      ilike(competitions.description, like),
      ilike(competitions.org, like),
      sql`exists (select 1 from unnest(${competitions.keywords}) as k where lower(k) like ${like})`,
    )!);
  }

  if (input.categories.length) filters.push(hasCategory(input.categories));
  if (input.levels.length) filters.push(hasLevel(input.levels));
  if (input.rewards.length) filters.push(hasReward(input.rewards));
  if (input.types.length) filters.push(inArray(competitions.type, input.types));
  if (input.regions.length) filters.push(inArray(competitions.region, input.regions));
  if (input.slugs) filters.push(input.slugs.length ? inArray(competitions.slug, input.slugs) : sql`false`);

  if (input.teamSizes.length) {
    // ทีม 2–5 คน ตรงกับทั้งช่วง 2–3 และ 4–6 เพราะขนาดทีมที่รับคาบเกี่ยวกัน
    filters.push(or(...input.teamSizes.map((bucket) => and(
      lte(competitions.teamMin, bucket.max),
      gte(competitions.teamMax, bucket.min),
    )!))!);
  }

  if (input.prizeMin > 0) filters.push(gte(competitions.prizeValue, input.prizeMin));
  if (input.prizeMax !== null) filters.push(lte(competitions.prizeValue, input.prizeMax));
  if (input.freeOnly) filters.push(sql`(${competitions.fee} is null or ${competitions.fee} = 0)`);

  if (input.timing === 'upcoming') {
    filters.push(sql`${competitions.opensAt} is not null and ${competitions.opensAt} > current_date`);
  } else if (input.timing === 'd7' || input.timing === 'd30') {
    const days = input.timing === 'd7' ? 7 : 30;
    filters.push(sql`${competitions.closesAt} >= current_date
      and ${competitions.closesAt} <= current_date + ${days} * interval '1 day'`);
  }

  const where = filters.length ? and(...filters) : undefined;

  const order = {
    deadline: asc(competitions.closesAt),
    prize: desc(competitions.prizeValue),
    name: asc(competitions.name),
    new: desc(competitions.createdAt),
  }[input.sort];

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(competitions).where(where);

  // ขอหน้าที่เกินจำนวนที่มีให้ตกมาหน้าสุดท้าย ดีกว่าโชว์หน้าว่างเปล่า
  const pageCount = Math.max(1, Math.ceil(count / input.perPage));
  const page = Math.min(input.page, pageCount);

  const rows = await db.select().from(competitions)
    .where(where)
    .orderBy(order, asc(competitions.id))
    .limit(input.perPage)
    .offset((page - 1) * input.perPage);

  return { total: count, page, pageCount, items: await attachJoins(rows) };
}

export async function findCompetitionBySlug(slug: string) {
  const rows = await db.select().from(competitions).where(and(eq(competitions.slug, slug), sql`${competitions.kind} is not null`)).limit(1);
  const [record] = await attachJoins(rows);
  return record ?? null;
}

/** เวทีอื่นที่มีหมวดซ้อนกันอย่างน้อยหนึ่งหมวด ใช้กับบล็อกท้ายหน้ารายละเอียด */
export async function relatedCompetitions(record: CompetitionRecord, limit = 2) {
  if (!record.categories.length) return [];
  const rows = await db.select().from(competitions)
    .where(and(
      ne(competitions.id, record.id),
      sql`${competitions.kind} is not null`,
      arrayOverlaps(competitions.themes, record.themes),
    ))
    .orderBy(asc(competitions.closesAt))
    .limit(limit);
  return attachJoins(rows);
}

export async function competitionOptions() {
  return db.select({ id: competitions.id, slug: competitions.slug, name: competitions.name })
    .from(competitions).where(sql`${competitions.kind} is not null`).orderBy(asc(competitions.name));
}
