import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { useI18n } from '../i18n';
import type { Lang } from '../i18n';
import type { ListedMentor, RankedMentor, Rating as RatingValue } from '../data/consult';
import { Avatar, OtherRow, RankedRow, Rating, RisingStarPill } from '../components/mentors';

/* หน้าเมนเทอร์ที่จัดอันดับตามคะแนนรีวิวเฉลี่ยของเดือน: Hall of Fame สามเดือน รายชื่อสมาชิก Rising Star
   ที่มีเลขอันดับ แล้วเมนเทอร์คนอื่นที่ไม่มีอันดับ
   ข้อมูลทั้งหมดมาจาก GET /api/rising-star ค่าเฉลี่ยและอันดับคำนวณที่เซิร์ฟเวอร์ ฝั่งนี้แค่แสดงผล */

type Mentor = ListedMentor;
type Ranked = RankedMentor;
type HallMonth = { month: string; closesAt: string | null; top: Ranked[] };
type Viewer = { mentorId: string; active: boolean; activeUntil: string | null; rating: RatingValue; projectedRank: number };
type Payload = { hall: HallMonth[]; ranked: Ranked[]; others: Mentor[]; viewer: Viewer | null; demo: boolean };

const locales: Record<Lang, string> = { en: 'en-US', th: 'th-TH' };
const MINUTE = 60_000;

/** "YYYY-MM" จากเซิร์ฟเวอร์เป็นเดือนตามปฏิทินอยู่แล้ว จึงจัดรูปแบบที่ UTC เพื่อไม่ให้เขตเวลาของเครื่องเลื่อนเดือน */
function monthName(key: string, lang: Lang, withYear = true) {
  return new Intl.DateTimeFormat(locales[lang], {
    month: 'long', year: withYear ? 'numeric' : undefined, timeZone: 'UTC',
  }).format(new Date(`${key}-01T00:00:00Z`));
}

const bangkokDate = (iso: string, lang: Lang) =>
  new Intl.DateTimeFormat(locales[lang], { dateStyle: 'long', timeZone: 'Asia/Bangkok' }).format(new Date(iso));

/* closesAt คือต้นเดือนถัดไปเวลาไทย (ปลายเปิด) ผู้ใช้เข้าใจว่าปิด 23:59 ของวันสุดท้าย
   จึงถอยหนึ่งนาทีเพื่อหาวันที่ แล้วบอกว่า "คืนนี้" ถ้าเป็นวันเดียวกับวันนี้ตามเวลาไทย */
function closingLabel(closesAt: string, lang: Lang, s: { closesTonight: string; closesOn: (date: string) => string }) {
  const lastMinute = new Date(Date.parse(closesAt) - MINUTE);
  const day = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date);
  if (day(lastMinute) === day(new Date())) return s.closesTonight;
  return s.closesOn(new Intl.DateTimeFormat(locales[lang], { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }).format(lastMinute));
}

function Medal({ rank, small = false }: { rank: number; small?: boolean }) {
  const { t } = useI18n();
  const size = small ? ' rs-medal--sm' : '';
  return <span className={`rs-medal rs-medal--${rank}${size}`} role="img" aria-label={t.risingStar.rank(rank)}>{rank}</span>;
}

/* ---------- Hall of Fame ---------- */

type Kind = 'now' | 'last' | 'older';

function MonthPanel({ data, kind }: { data: HallMonth; kind: Kind }) {
  const { t, lang } = useI18n();
  const s = t.risingStar;
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [winner, ...rest] = data.top;
  const isNow = kind === 'now';
  const label = isNow ? s.thisMonth : kind === 'last' ? s.lastMonth : s.twoMonthsAgo;
  const restId = `${uid}-rest`;

  return <section className={`rs-month ${isNow ? 'rs-month--now' : 'rs-month--past'} rs-slot--${kind}`} aria-labelledby={`${uid}-title`}>
    <div className="rs-month__head">
      <div>
        <p className="rs-month__label">{label}</p>
        <h2 className="rs-month__title" id={`${uid}-title`}>{monthName(data.month, lang)}</h2>
        {isNow && data.closesAt && <p className="rs-month__closing">{closingLabel(data.closesAt, lang, s)}</p>}
      </div>
      {!isNow && rest.length > 0 && <button
        type="button" className="rs-fold__toggle" aria-expanded={open} aria-controls={restId}
        onClick={() => setOpen((value) => !value)}
      >{s.moreRanks(data.top.length)}<ChevronDown aria-hidden="true" /></button>}
    </div>

    {!winner ? <p className="rs-month__empty">{isNow ? s.emptyNow : s.emptyPast}</p> : <>
      <div className="rs-winner">
        <span className="rs-avatar-wrap"><Avatar initial={winner.initial} /><Medal rank={1} /></span>
        <div className="rs-winner__who">
          <p className="rs-winner__name"><Link className="rs-namelink" to={`/mentors/${winner.id}`}>{winner.name}</Link></p>
          <p className="rs-winner__spec" title={winner.specialty}>{winner.specialty}</p>
        </div>
        <p className="rs-winner__count"><b>{winner.rating.average?.toFixed(1)}</b><span>{s.averageOf(winner.rating.reviews)}</span></p>
      </div>
      {rest.length > 0 && <ol className={isNow ? 'rs-rank-list' : 'rs-rank-list rs-fold__body'} id={restId} hidden={!isNow && !open}>
        {rest.map((mentor) => <li className="rs-rank-row" key={mentor.id}>
          <Medal rank={mentor.rank} small />
          <Avatar initial={mentor.initial} />
          <span className="rs-rank-row__name"><Link className="rs-namelink" to={`/mentors/${mentor.id}`}>{mentor.name}</Link></span>
          <span className="rs-rank-row__count"><Rating rating={mentor.rating} /></span>
        </li>)}
      </ol>}
    </>}
  </section>;
}

/* ---------- lists ---------- */

/* ---------- upsell ---------- */

function Upsell({ viewer }: { viewer: Viewer | null }) {
  const { t, lang } = useI18n();
  const s = t.risingStar;
  const uid = useId();

  // สมาชิกอยู่แล้วไม่ต้องชวนสมัครซ้ำ บอกแค่ว่าสมาชิกภาพหมดเมื่อไหร่
  if (viewer?.active) {
    return <aside className="rs-note" aria-labelledby={`${uid}-title`}>
      <RisingStarPill />
      <h2 id={`${uid}-title`}>{s.memberTitle}</h2>
      {viewer.activeUntil && <p>{s.memberUntil(bangkokDate(viewer.activeUntil, lang))}</p>}
      <p>{viewer.rating.average !== null
        ? s.memberProgress(viewer.rating.average.toFixed(1), viewer.rating.reviews, viewer.projectedRank)
        : s.memberNoReviews}</p>
    </aside>;
  }

  const isMentor = viewer !== null;
  const text = isMentor
    ? (viewer.rating.average !== null ? s.upsellProgress(viewer.rating.average.toFixed(1), viewer.rating.reviews, viewer.projectedRank) : s.upsellNoReviews)
    : s.upsellGuestText;
  return <aside className="rs-upsell" aria-labelledby={`${uid}-title`}>
    <div className="rs-upsell__head">
      <p className="rs-upsell__for">{s.upsellFor}</p>
      <h2 className="rs-upsell__title" id={`${uid}-title`}>{s.upsellTitle}</h2>
      <p className="rs-upsell__price"><b>{s.price}</b><span>{s.per}</span></p>
    </div>
    <div className="rs-upsell__body">
      <p className="rs-upsell__lead">{text}</p>
      <ul className="rs-perks">{s.perks.map((perk) => <li key={perk}><Check aria-hidden="true" /><span>{perk}</span></li>)}</ul>
      {/* TODO(stripe): เมื่อฝั่ง Stripe พร้อม ให้ปุ่มนี้ไปที่ /rising-star/join แทน /profile
          ตอนนี้ยังไม่มีทางชำระเงิน จึงพาเมนเทอร์ไปโปรไฟล์ และพาคนอื่นไปสมัครเป็นเมนเทอร์ก่อน */}
      <Link className="primary-button rs-upsell__cta" to={isMentor ? '/profile' : '/mentors/apply'}>
        {isMentor ? s.joinCta : s.applyCta}
      </Link>
      <p className="rs-upsell__fine">{s.renewal}</p>
    </div>
  </aside>;
}

/* ---------- states ---------- */

function LoadingBody() {
  const { t } = useI18n();
  return <>
    <p className="sr-only" role="status">{t.risingStar.loading}</p>
    <div className="rs-months" aria-hidden="true">
      <div className="rs-skeleton rs-skeleton--now rs-slot--now" />
      <div className="rs-skeleton rs-skeleton--past rs-slot--last" />
      <div className="rs-skeleton rs-skeleton--past rs-slot--older" />
    </div>
  </>;
}

function LoadingList() {
  return <div className="shell" aria-hidden="true">
    <div className="rs-layout">
      <div className="rs-lists">
        <div className="rs-skeleton rs-skeleton--row" />
        <div className="rs-skeleton rs-skeleton--row" />
        <div className="rs-skeleton rs-skeleton--row" />
      </div>
      <div className="rs-skeleton rs-skeleton--upsell" />
    </div>
  </div>;
}

export function RisingStar() {
  const { t, lang } = useI18n();
  const s = t.risingStar;
  const { data, error, loading, reload } = useApi<Payload>('/rising-star');
  const [now, last, older] = data?.hall ?? [];

  // ไม่ตั้งชื่อแท็บเอง จะค้างเป็นชื่อเริ่มต้นของ index.html ซึ่งเป็นภาษาไทยเสมอ
  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);

  return <main id="main" tabIndex={-1}>
    <section className="rs-hall" aria-labelledby="rs-title">
      <div className="shell">
        <div className="rs-hall__head">
          <div>
            <h1 id="rs-title">{s.pageTitle}</h1>
            <p>{s.lead}</p>
            {data?.demo && <p className="rs-sample">{s.sample}</p>}
          </div>
        </div>
        {loading && <LoadingBody />}
        {!loading && error && <div className="rs-state" role="alert">
          <h2>{s.errorTitle}</h2>
          <p>{error}</p>
          <button type="button" className="ghost-button rs-state__action" onClick={reload}>{s.retry}</button>
        </div>}
        {data && now && last && older && <div className="rs-months">
          <MonthPanel data={now} kind="now" />
          <MonthPanel data={last} kind="last" />
          <MonthPanel data={older} kind="older" />
        </div>}
      </div>
    </section>

    {loading && <LoadingList />}
    {data && <div className="shell">
      <div className="rs-layout">
        <div className="rs-lists">
          <section className="rs-section" aria-labelledby="rs-ranked-title">
            <div className="rs-section-head"><h2 id="rs-ranked-title">{s.rankedTitle}</h2></div>
            {data.ranked.length > 0 && now && <p className="rs-section-sub">{s.rankedSub(data.ranked.length, monthName(now.month, lang, false))}</p>}
            {data.ranked.length === 0
              ? <div className="rs-empty"><h3>{s.rankedEmptyTitle}</h3><p>{s.rankedEmptyText}</p></div>
              : <ol className="rs-list">{data.ranked.map((mentor) => <RankedRow key={mentor.id} mentor={mentor} />)}</ol>}
          </section>
          <section className="rs-section" aria-labelledby="rs-others-title">
            <div className="rs-section-head"><h2 id="rs-others-title">{s.othersTitle}</h2></div>
            <p className="rs-section-sub">{s.othersSub}</p>
            {data.others.length === 0
              ? <div className="rs-empty"><p>{s.othersEmpty}</p></div>
              : <ul className="rs-list rs-list--plain">{data.others.map((mentor) => <OtherRow key={mentor.id} mentor={mentor} />)}</ul>}
          </section>
        </div>
        <Upsell viewer={data.viewer} />
      </div>
    </div>}
  </main>;
}
