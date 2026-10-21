import { useEffect, useState } from 'react';
import { ArrowRight, Clock3, FileText, Flag, MessageCircle, ReceiptText, ShieldCheck, Star, Trophy, Users } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useApi } from '../lib/useApi';
import { useI18n } from '../i18n';
import { Avatar, RisingStarPill } from '../components/mentors';
import type { HelpsWith } from '../data/matching';
import trophy from '../assets/trophy.png';
import heroImage from '../assets/landing/hero-columns.webp';
import ctaImage from '../assets/landing/cta-summit.webp';
import '../landing.css';

/* หน้าแรกแบบใหม่ (Claude Design: ChampionWays Mentor Landing v4, 21 ต.ค. 2569)
   hero → เมนเทอร์ใหม่ → วิธีใช้งาน 4 ขั้น → อันดับ Rising Star → ชวนเริ่ม
   ระบบจับคู่ยังไม่เปิด ปุ่ม "Ready to win the competition?" จึงพาไปหน้ารวมเมนเทอร์ก่อน (spec ข้อ 12, 13) */
const START = '/mentors';

type Credit = { result: 'winner' | 'finalist' | 'participant' | 'other'; name: string } | null;
type NewMentor = {
  id: string; name: string; initial: string; specialty: string; photoUrl: string | null; headline: string;
  helpsWith: HelpsWith[]; price: number | null; minutes: number | null; unit: string; joinedAt: string; credit: Credit;
};
type Field = 'business' | 'technology' | 'design';
type BoardMentor = {
  rank: number; id: string; name: string; initial: string; photoUrl: string | null; headline: string; field: Field | null;
  credit: Credit; rating: { average: number | null; reviews: number }; sessions: number;
};
type Board = { month: string; closesAt: string | null; items: BoardMentor[]; viewer: { member: boolean } | null; demo: boolean };

function CreditLine({ credit, className }: { credit: Credit; className: string }) {
  const { t } = useI18n();
  if (!credit) return null;
  const award = credit.result === 'winner' || credit.result === 'finalist';
  const Icon = award ? Trophy : Flag;
  return <p className={`${className}${award ? ' is-award' : ''}`}><Icon size={14} aria-hidden="true" />{t.landing.credit[credit.result](credit.name)}</p>;
}

function Price({ mentor }: { mentor: NewMentor }) {
  const { t } = useI18n();
  if (mentor.price === null) return <span />;
  if (mentor.price === 0) return <span className="lp-price"><b>{t.landing.free}</b></span>;
  const unit = mentor.unit ? ` / ${mentor.unit}` : mentor.minutes ? t.landing.perMinutes(mentor.minutes) : '';
  return <span className="lp-price"><b>{t.landing.baht(mentor.price)}</b>{unit}</span>;
}

function NewMentors() {
  const { t } = useI18n();
  const s = t.landing;
  const { data } = useApi<{ items: NewMentor[] }>('/rising-star/newest');
  const items = (data?.items ?? []).slice(0, 4);
  if (!items.length) return null;
  const now = Date.now();
  return <section className="lp-shell lp-new" id="new" aria-labelledby="lp-new-title">
    <div className="lp-head">
      <div>
        <p className="lp-eyebrow">{s.newEyebrow}</p>
        <h2 id="lp-new-title">{s.newTitle}</h2>
        <p className="lp-lead">{s.newLead}</p>
      </div>
      <Link className="lp-more" to="/mentors">{s.browseAll}<ArrowRight size={14} aria-hidden="true" /></Link>
    </div>
    <div className="lp-new__grid">
      {items.map((mentor) => <article className="lp-card" key={mentor.id}>
        <div className="lp-card__top">
          <Avatar initial={mentor.initial} photoUrl={mentor.photoUrl} />
          <span className="lp-joined">{s.joined(Math.max(0, Math.floor((now - Date.parse(mentor.joinedAt)) / 86_400_000)))}</span>
        </div>
        <h3>{mentor.name}</h3>
        <p className="lp-card__sub">{mentor.headline || mentor.specialty}</p>
        <CreditLine credit={mentor.credit} className="lp-credit" />
        {mentor.helpsWith.length > 0 && <ul className="lp-tags">
          {mentor.helpsWith.map((topic) => <li key={topic}>{t.mentorProfileV2.helpsWithNames[topic]}</li>)}
        </ul>}
        <div className="lp-card__foot">
          <Price mentor={mentor} />
          <Link className="lp-btn-outline" to={`/mentors/${mentor.id}`} aria-label={s.viewProfileOf(mentor.name)}>{s.viewProfile}</Link>
        </div>
      </article>)}
    </div>
  </section>;
}

const stepIcons = [FileText, Users, MessageCircle, Star];

function HowItWorks() {
  const { t } = useI18n();
  const s = t.landing;
  return <section className="lp-shell lp-how" id="how" aria-labelledby="lp-how-title">
    <div className="lp-how__head">
      <p className="lp-eyebrow">{s.howEyebrow}</p>
      <h2 id="lp-how-title">{s.howTitle}</h2>
    </div>
    <div className="lp-steps">
      <span className="lp-steps__line" aria-hidden="true" />
      <ol>
        {s.steps.map((step, index) => {
          const Icon = stepIcons[index];
          return <li key={step.title}>
            <span className={`lp-step__icon lp-step__icon--${index}`}><Icon size={24} aria-hidden="true" /></span>
            <p className="lp-step__n">{s.step(index + 1)}</p>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </li>;
        })}
      </ol>
    </div>
    <p className="lp-center"><Link className="lp-btn-primary" to={START}>{s.cta}<ArrowRight size={16} aria-hidden="true" /></Link></p>
  </section>;
}

const fieldIds = ['all', 'business', 'technology', 'design'] as const;

function Ranking() {
  const { t, lang } = useI18n();
  const s = t.landing;
  const [last, setLast] = useState(false);
  const [field, setField] = useState<(typeof fieldIds)[number]>('all');
  const { data } = useApi<Board>(`/rising-star/board${last ? '?period=last' : ''}`);
  const items = (data?.items ?? []).filter((mentor) => field === 'all' || mentor.field === field);
  // ตัวเลขอันดับนับใหม่หลังกรองสาย คนแรกของสายนั้นจะเป็น #1
  const ranked = items.map((mentor, index) => ({ ...mentor, rank: index + 1 }));
  const top = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const closes = data?.closesAt
    ? new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(Date.parse(data.closesAt) - 1))
    : null;
  const empty = field !== 'all' ? s.noField : last ? s.emptyLast : s.emptyMonth;
  const reviewsLabel = last ? s.reviewsLast : s.reviewsThis;

  return <section className="lp-rank" id="ranking" aria-labelledby="lp-rank-title">
    <div className="lp-shell">
      <div className="lp-head">
        <div>
          <p className="lp-eyebrow">{s.rankEyebrow}</p>
          <h2 id="lp-rank-title">{s.rankTitle}</h2>
          <p className="lp-lead">{last ? s.rankLeadLast : s.rankLead}</p>
          {closes && <p className="lp-closes"><Clock3 size={13} aria-hidden="true" />{s.closes(closes)}</p>}
        </div>
        <div className="lp-periods" role="group" aria-label={s.period}>
          <button type="button" aria-pressed={!last} onClick={() => setLast(false)}>{s.thisMonth}</button>
          <button type="button" aria-pressed={last} onClick={() => setLast(true)}>{s.lastMonth}</button>
        </div>
      </div>
      <div className="lp-fields" role="group" aria-label={s.field}>
        {fieldIds.map((id) => <button type="button" key={id} aria-pressed={field === id} onClick={() => setField(id)}>{s.fields[id]}</button>)}
      </div>
      {data?.demo && ranked.length > 0 && <p className="lp-demo">{s.demo}</p>}

      {data && ranked.length === 0 && <div className="lp-empty">
        <span className="lp-empty__icon"><Star size={22} aria-hidden="true" /></span>
        <p>{empty}</p>
        <Link className="lp-more" to="/mentors">{s.browseAll}<ArrowRight size={14} aria-hidden="true" /></Link>
      </div>}

      {top.length > 0 && <div className={top.length === 3 ? 'lp-podium is-full' : 'lp-podium'}>
        {top.map((mentor) => <article className={mentor.rank === 1 ? 'lp-podium__card is-first' : 'lp-podium__card'} key={mentor.id}>
          <span className="lp-podium__rank">#{mentor.rank}</span>
          <span className="lp-podium__pill"><RisingStarPill /></span>
          <Avatar initial={mentor.initial} photoUrl={mentor.photoUrl} />
          <h3>{mentor.name}</h3>
          <p className="lp-card__sub">{mentor.headline}</p>
          <CreditLine credit={mentor.credit} className="lp-podium__credit" />
          <div className="lp-podium__stats">
            <span><b>{mentor.rating.average === null ? '–' : <>★ {mentor.rating.average.toFixed(1)}</>}</b><small>{mentor.rating.average === null ? s.noRating : s.avgRating}</small></span>
            <span><b>{mentor.rating.reviews}</b><small>{reviewsLabel}</small></span>
          </div>
          <p className="lp-podium__sessions">{s.sessionsLine(mentor.sessions, last)}</p>
          <Link className="lp-podium__btn" to={`/mentors/${mentor.id}`} aria-label={s.viewProfileOf(mentor.name)}>{s.viewProfile}</Link>
        </article>)}
      </div>}

      {rest.length > 0 && <ol className="lp-list" start={4}>
        {rest.map((mentor) => <li key={mentor.id}>
          <span className="lp-list__rank">{mentor.rank}</span>
          <Avatar initial={mentor.initial} photoUrl={mentor.photoUrl} />
          <div className="lp-list__body">
            <p className="lp-list__name"><b>{mentor.name}</b><RisingStarPill /><span>{mentor.headline}</span></p>
            <p className="lp-list__meta">
              {mentor.credit && <span className={mentor.credit.result === 'winner' || mentor.credit.result === 'finalist' ? 'is-award' : ''}>{s.credit[mentor.credit.result](mentor.credit.name)}</span>}
              <b>{mentor.rating.average === null ? s.noRating : <>★ {mentor.rating.average.toFixed(1)} · {s.reviewsLine(mentor.rating.reviews, last)}</>}</b>
              <span className="lp-list__muted">{s.sessionsLine(mentor.sessions, last)}</span>
            </p>
          </div>
          <Link className="lp-btn-outline" to={`/mentors/${mentor.id}`} aria-label={s.viewProfileOf(mentor.name)}>{s.view}</Link>
        </li>)}
      </ol>}

      {data?.viewer && !data.viewer.member && <div className="lp-become">
        <div>
          <span className="lp-become__icon"><Star size={18} aria-hidden="true" /></span>
          <div><b>{s.becomeTitle}</b><span>{s.becomeLead}</span></div>
        </div>
        <Link className="lp-btn-outline" to="/mentors">{s.becomeBtn}</Link>
      </div>}
    </div>
  </section>;
}

export function Home() {
  const { t } = useI18n();
  const s = t.landing;
  const { search, hash } = useLocation();
  useEffect(() => { document.title = `ChampionWays — ${s.pageTitle}`; }, [s.pageTitle]);
  /* ลิงก์ "/#ranking" และ "/#how" จากหน้าอื่น: เลื่อนไปส่วนนั้นหลังการ์ดโหลดเสร็จ ตำแหน่งจะได้ไม่เลื่อนหนีอีก */
  useEffect(() => {
    if (!hash) return;
    const timer = window.setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView(), 350);
    return () => window.clearTimeout(timer);
  }, [hash]);
  // ลิงก์ค้นหางานแข่งเดิม (/?q=…, /?cat=…, /?saved=1) ไปหน้ารวมงานแข่งที่ย้ายไป /explore
  if (search) return <Navigate to={`/explore${search}`} replace />;

  return <main id="main" tabIndex={-1} className="lp">
    <section className="lp-hero">
      <div className="lp-hero__art" aria-hidden="true">
        <img src={heroImage} alt="" width={1916} height={821} />
      </div>
      <div className="lp-hero__inner">
        <p className="lp-badge"><img src={trophy} alt="" width={18} height={18} />{s.heroBadge}</p>
        <h1>{s.h1a} <span>{s.h1b}</span></h1>
        <p className="lp-hero__lead">{s.heroLead}</p>
        <div className="lp-hero__actions">
          <Link className="lp-btn-dark" to={START}>{s.cta}<ArrowRight size={16} aria-hidden="true" /></Link>
          <a className="lp-link" href="#how">{s.seeHow}</a>
        </div>
        <ul className="lp-bullets">
          <li><ShieldCheck size={15} aria-hidden="true" />{s.b1}</li>
          <li><Clock3 size={15} aria-hidden="true" />{s.b2}</li>
          <li><ReceiptText size={15} aria-hidden="true" />{s.b3}</li>
        </ul>
      </div>
    </section>

    <NewMentors />
    <HowItWorks />
    <Ranking />

    <section className="lp-cta" aria-labelledby="lp-cta-title">
      <img className="lp-cta__art" src={ctaImage} alt="" width={1584} height={672} loading="lazy" />
      <div className="lp-cta__inner">
        <h2 id="lp-cta-title">{s.ctaTitle}</h2>
        <p>{s.ctaLead}</p>
        <Link className="lp-btn-gold" to={START}>{s.cta}<ArrowRight size={16} aria-hidden="true" /></Link>
        <small>{s.ctaNote}</small>
      </div>
    </section>
  </main>;
}
