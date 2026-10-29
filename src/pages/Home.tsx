import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';
import { Plus } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useApi } from '../lib/useApi';
import { useI18n } from '../i18n';
import type { HelpsWith } from '../data/matching';
import posterCis from '../assets/landing2/poster-cis.webp';
import posterIecu from '../assets/landing2/poster-iecu.webp';
import posterCaase from '../assets/landing2/poster-caase.webp';
import posterUhack from '../assets/landing2/poster-uhack.webp';
import stepNotebook from '../assets/landing2/step-notebook.webp';
import stepHandshake from '../assets/landing2/step-handshake.webp';
import stepBubble from '../assets/landing2/step-bubble.webp';
import stepStars from '../assets/landing2/step-stars.webp';
import '@fontsource/caveat/latin-600.css';
import '@fontsource/mali/thai-600.css';
import '@fontsource/mali/latin-600.css';
import '@fontsource/caveat/latin-700.css';
import '@fontsource/mali/thai-700.css';
import '@fontsource/mali/latin-700.css';
import '../landing.css';

/* หน้าแรก (Claude Design "ChampionWays", ฉบับแก้ 24 ต.ค. 2569) ทำตามสคริปต์ของไฟล์ดีไซน์
   1. ฉากเปิด: โลโก้กลางจอ การ์ดกองรวมกันแล้วแจกออกเป็นภาพปะติด แล้วเลื่อนลงเองช้า ๆ (ผู้ใช้แตะ/เลื่อนเมื่อไหร่ก็หยุด)
   2. เลื่อนผ่านฉากเปิด: โปสเตอร์สี่ใบบินเข้าที่รอบหัวข้อ การ์ดอื่นลอยออก หัวข้อค่อย ๆ ขึ้น
   3. เมนเทอร์จริง → วิธีใช้งานเป็นแผ่นที่ยกออก เผยส่วนรีวิวที่ตรึงไว้ → แผ่นคำถามที่พบบ่อยเลื่อนมาทับ
   ข้อมูลเมนเทอร์และรีวิวเป็นของจริง (/api/landing) ส่วนที่ไม่มีข้อมูลไม่แสดง ไม่มีอันดับ Rising Star
   ผู้ใช้ที่ตั้งลดการเคลื่อนไหวเห็นภาพสุดท้ายทันที ไม่มีการเลื่อนเอง */

type LandingMentor = {
  id: string; name: string; initial: string; photoUrl: string | null; headline: string; bio: string; helpsWith: HelpsWith[];
  rating: { average: number | null; reviews: number }; events: number;
};
type Story = { comment: string; stars: number; name: string; initial: string; mentor: string };
type Landing = { mentors: LandingMentor[]; stories: Story[] };

const STEPS = [stepNotebook, stepHandshake, stepBubble, stepStars];
const BADGES = ['#c2410c', '#c2410c', '#1d4ed8', '#7e22ce'];
const MATCH = '/match';

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => x * x * (3 - 2 * x);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function Accent({ children }: { children: string }) {
  return <span className="lp-accent">{children}</span>;
}

/* ---------- ฉากเปิด ---------- */

type CardPos = { left: string; top: string; rotate: number; depth: number; target?: number };
const POSTER_CARDS: (CardPos & { src: string })[] = [
  { src: posterCis, left: '7%', top: '14%', rotate: -8, depth: 0.8, target: 0 },
  { src: posterIecu, left: '52%', top: '11%', rotate: 7, depth: 0.75, target: 1 },
  { src: posterCaase, left: '36%', top: '63%', rotate: -6, depth: 0.7, target: 2 },
  { src: posterUhack, left: '79%', top: '55%', rotate: 6, depth: 0.75, target: 3 },
];
const MENTOR_SPOTS: CardPos[] = [
  { left: '33%', top: '18%', rotate: 5, depth: 1.4 },
  { left: '77%', top: '12%', rotate: -4, depth: 1.5 },
  { left: '57%', top: '50%', rotate: 3, depth: 1.35 },
];

const place = (p: CardPos): CSSProperties => ({ left: p.left, top: p.top, rotate: `${p.rotate}deg` });

function StepTile({ step }: { step: number }) {
  return <>
    <img src={STEPS[step]} alt="" />
    <span className="lp-badge" style={{ background: BADGES[step] }}>{String(step + 1).padStart(2, '0')}</span>
  </>;
}

type IntroRefs = {
  intro: RefObject<HTMLElement | null>; stage: RefObject<HTMLDivElement | null>; far: RefObject<HTMLDivElement | null>;
  near: RefObject<HTMLDivElement | null>; hero: RefObject<HTMLDivElement | null>;
};

function Intro({ refs, mentors }: { refs: IntroRefs; mentors: LandingMentor[] }) {
  const { t, lang } = useI18n();
  const s = t.landing;
  return <section ref={refs.intro} id="intro" className="lp-intro" aria-labelledby="lp-hero-title">
    <div ref={refs.stage} className="lp-intro__stage">
      <div className="lp-intro__cards" aria-hidden="true">
        <div ref={refs.far} className="lp-layer">
          {POSTER_CARDS.map((card) => <div key={card.src} data-card="" data-target={card.target} data-depth={card.depth} className="lp-c lp-c--poster" style={place(card)}>
            <img src={card.src} alt="" />
          </div>)}
        </div>
        <div ref={refs.near} className="lp-layer">
          {mentors.slice(0, 3).map((mentor, i) => <div key={mentor.id} data-card="" data-depth={MENTOR_SPOTS[i].depth} className="lp-c lp-c--mentor" style={place(MENTOR_SPOTS[i])}>
            <div className="lp-c__photo">{mentor.photoUrl ? <img src={mentor.photoUrl} alt="" /> : <span>{mentor.initial}</span>}</div>
            <div className="lp-c__meta">
              <div><b>{mentor.name}</b><span>{mentor.headline}</span></div>
              {mentor.rating.average !== null && <em><i>★</i> {mentor.rating.average.toFixed(1)}</em>}
            </div>
          </div>)}
        </div>
      </div>
      <div ref={refs.hero} className="lp-hero">
        <div aria-hidden="true">
          {[0, 1, 2, 3].map((slot) => <div key={slot} data-slot={slot} className={`lp-slot is-${slot}`}><div /></div>)}
        </div>
        <div className="lp-hero__copy">
          <h1 id="lp-hero-title" className={lang === 'th' ? 'is-th' : ''}>
            <span>{s.h1a}</span>{' '}
            <span><span className="lp-hero__soft">{s.h1b}</span> <span className="lp-hero__accent">{s.h1accent}</span></span>
          </h1>
          <p>{s.heroLead}</p>
          <div className="lp-hero__cta">
            <Link className="lp-btn" to={MATCH}>{s.findMentor}</Link>
            <a className="lp-btn is-light" href="#how" onClick={(event) => {
              event.preventDefault();
              document.getElementById('how')?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
            }}>{s.howToUse}</a>
          </div>
        </div>
      </div>
    </div>
  </section>;
}

/* ---------- เมนเทอร์ ---------- */

function MentorCard({ mentor }: { mentor: LandingMentor }) {
  const { t } = useI18n();
  const s = t.landing;
  return <article className="lp-mentor">
    <div className="lp-mentor__photo">
      {mentor.photoUrl ? <img src={mentor.photoUrl} alt="" loading="lazy" /> : <span aria-hidden="true">{mentor.initial}</span>}
    </div>
    <div className="lp-mentor__head">
      <div>
        <h3><Link to={`/mentors/${mentor.id}`} aria-label={s.viewProfileOf(mentor.name)}>{mentor.name}</Link></h3>
        {mentor.headline && <p className="lp-mentor__sub">{mentor.headline}</p>}
      </div>
      <p className="lp-mentor__rating">{mentor.rating.average === null ? s.newMentor : <><span aria-hidden="true">★</span> {mentor.rating.average.toFixed(1)}</>}</p>
    </div>
    <p className="lp-mentor__bio">{mentor.bio}</p>
    {mentor.helpsWith.length > 0 && <ul className="lp-mentor__tags">
      {mentor.helpsWith.map((id) => <li key={id}>{t.mentorProfileV2.helpsWithNames[id]}</li>)}
    </ul>}
    <div className="lp-mentor__foot">
      <span>{mentor.events > 0 ? s.events(mentor.events) : s.verifiedMentor}</span>
      <b aria-hidden="true">{s.viewProfile}</b>
    </div>
  </article>;
}

/* เลื่อนเองทุก 3.6 วินาทีตามดีไซน์ หยุดเมื่อชี้หรือโฟกัส ไม่มีปุ่มควบคุม (เจ้าของสั่งเอาออก 27 ต.ค. 2569)
   ผู้ใช้ที่ตั้งลดการเคลื่อนไหวไม่เลื่อนเอง เลื่อนด้วยมือหรือแป้นพิมพ์ได้ */
function Mentors({ mentors }: { mentors: LandingMentor[] }) {
  const { t } = useI18n();
  const s = t.landing;
  const track = useRef<HTMLDivElement>(null);
  const playing = !reduceMotion();
  const [hovered, setHovered] = useState(false);
  const step = (dir: 1) => {
    const el = track.current;
    const card = el?.querySelector<HTMLElement>('.lp-mentor');
    if (!el || !card) return;
    const width = card.getBoundingClientRect().width + 16;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    if (atEnd) el.scrollTo({ left: 0, behavior: 'smooth' });
    else el.scrollBy({ left: dir * width, behavior: 'smooth' });
  };
  useEffect(() => {
    if (!playing || hovered || mentors.length < 2) return;
    const timer = setInterval(() => step(1), 3600);
    return () => clearInterval(timer);
  }, [playing, hovered, mentors.length]);

  return <section className="lp-mentors" id="mentors" aria-labelledby="lp-mentors-title">
    <div className="lp-shell">
      <div className="lp-mentors__head" data-rv="1">
        <h2 id="lp-mentors-title">{s.mentorsA}<br />{s.mentorsB}<Accent>{s.mentorsAccent}</Accent></h2>
      </div>
      <div ref={track} className="lp-mentors__track" role="region" aria-label={s.mentorsLabel} tabIndex={0}
        onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)} onBlur={() => setHovered(false)}>
        {mentors.map((mentor) => <MentorCard key={mentor.id} mentor={mentor} />)}
      </div>
      <div className="lp-center"><Link className="lp-btn is-light" to={MATCH}>{s.exploreMatch}</Link></div>
    </div>
  </section>;
}

/* ---------- วิธีใช้งาน รีวิว คำถาม ---------- */

function How({ liftRef }: { liftRef: RefObject<HTMLElement | null> }) {
  const { t } = useI18n();
  const s = t.landing;
  return <section ref={liftRef} className="lp-how" id="how" aria-labelledby="lp-how-title">
    <div className="lp-shell">
      <div className="lp-how__head" data-rv="1">
        <h2 id="lp-how-title">{s.howA}<Accent>{s.howAccent}</Accent></h2>
        <p>{s.howLead}</p>
      </div>
      <ol className="lp-steps">
        {s.steps.map((item, i) => <li key={item.title} className={`lp-step is-${i}`} data-rv="1" data-delay={i * 140}>
          <div className="lp-step__art" aria-hidden="true"><StepTile step={i} /></div>
          <div>
            <span className="lp-step__word">{s.stepWords[i]}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </div>
        </li>)}
      </ol>
    </div>
  </section>;
}

function Stories({ stories, dimRef }: { stories: Story[]; dimRef: RefObject<HTMLDivElement | null> }) {
  const { t } = useI18n();
  const s = t.landing;
  return <section className="lp-stories" id="stories" aria-labelledby="lp-stories-title">
    <div className="lp-shell">
      <div className="lp-stories__head" data-rv="1">
        <h2 id="lp-stories-title">{s.storiesA}<br />{s.storiesB}<Accent>{s.storiesAccent}</Accent></h2>
        <p>{s.storiesLead}</p>
      </div>
      {stories.length > 0 && <ul className="lp-quotes">
        {stories.map((story, i) => <li key={i} className={i === 0 ? 'is-solid' : ''}>
          <span className="lp-quotes__mark" aria-hidden="true">“</span>
          <blockquote>{story.comment}</blockquote>
          <p className="lp-quotes__who">
            <span className="lp-quotes__avatar" aria-hidden="true">{story.initial}</span>
            <span><b>{story.name}</b><span>{s.reviewOf(story.mentor)} · <span className="sr-only">{t.rating.outOf(story.stars)}</span><span aria-hidden="true">{'★'.repeat(story.stars)}</span></span></span>
          </p>
        </li>)}
      </ul>}
      {/* ยังไม่มีรีวิวที่เข้าเกณฑ์ บอกตรง ๆ แทนการปล่อยช่องว่าง ไม่แต่งรีวิวตัวอย่าง (28 ต.ค. 2569) */}
      {stories.length === 0 && <div className="lp-quotes-empty" data-rv="1">
        <span className="lp-quotes__mark" aria-hidden="true">“</span>
        <p>{s.storiesEmpty}</p>
        <Link className="lp-btn is-light" to="/match">{s.storiesEmptyCta}</Link>
      </div>}
      <div className="lp-become" data-rv="1">
        <p>{s.becomeA}<br />{s.becomeB}</p>
        <Link className="lp-btn is-gold" to="/mentors/apply">{s.becomeCta}</Link>
      </div>
    </div>
    <div ref={dimRef} className="lp-stories__dim" aria-hidden="true" />
  </section>;
}

function Faq({ coverRef }: { coverRef: RefObject<HTMLDivElement | null> }) {
  const { t } = useI18n();
  const s = t.landing;
  const [open, setOpen] = useState<boolean[]>(() => s.faqs.map((_, i) => i === 0));
  return <div ref={coverRef} className="lp-cover">
    <section className="lp-faq" id="faq" aria-labelledby="lp-faq-title">
      <div className="lp-shell lp-faq__grid">
        <div data-rv="1">
          <h2 id="lp-faq-title">{s.faqA}<br /><Accent>{s.faqAccent}</Accent></h2>
          <p>{s.faqLead}</p>
        </div>
        <div className="lp-faq__list" data-rv="1">
          {s.faqs.map((item, i) => <div key={i} className="lp-faq__item">
            <h3>
              <button type="button" aria-expanded={open[i]} aria-controls={`lp-faq-${i}`} onClick={() => setOpen((o) => o.map((v, j) => (j === i ? !v : v)))}>
                <span>{item.q}</span><span className="lp-faq__icon" aria-hidden="true"><Plus size={16} /></span>
              </button>
            </h3>
            <div id={`lp-faq-${i}`} hidden={!open[i]}><p>{item.a}</p></div>
          </div>)}
        </div>
      </div>
    </section>
  </div>;
}

/* ---------- ตัวควบคุมการเคลื่อนไหว (ยกมาจากสคริปต์ของไฟล์ดีไซน์) ---------- */

type Vec = { vx: number; vy: number; depth: number; spin: number; fin: number; dx: number; dy: number; target?: boolean; tx?: number; ty?: number; ts?: number; tr?: number };

function useLandingMotion(ready: boolean, refs: IntroRefs & {
  root: RefObject<HTMLElement | null>; glow: RefObject<HTMLDivElement | null>; lift: RefObject<HTMLElement | null>;
  cover: RefObject<HTMLDivElement | null>; dim: RefObject<HTMLDivElement | null>;
}) {
  const replayRef = useRef<() => void>(() => {});
  useEffect(() => {
    const root = refs.root.current, intro = refs.intro.current, stage = refs.stage.current;
    if (!ready || !root || !intro || !stage) return;
    const reduce = reduceMotion();
    const anims: Animation[] = [];
    let dealAnims: Animation[] = [];
    const timers: number[] = [];
    let vec: Vec[] = [];
    let fin: number[] | null = null;
    let dealt = false;
    let mx = 0, my = 0;
    let stopAuto: (() => void) | null = null;
    const q = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
    const rot = (el: HTMLElement) => { const v = parseFloat(getComputedStyle(el).rotate); return Number.isNaN(v) ? 0 : v; };
    const run = (el: Element, kf: Keyframe[], opt: KeyframeAnimationOptions & { duration: number }, list: Animation[] = anims) => {
      const a = el.animate(kf, { fill: 'both', ...opt });
      list.push(a);
      return a;
    };
    // ลดการเคลื่อนไหว: ฉากเปิดสูงแค่หนึ่งจอและเป็นภาพสุดท้าย (hero) ทันที
    intro.classList.toggle('is-static', reduce);
    let finished = reduce;
    const progress = () => (finished ? 1 : clamp(window.scrollY / Math.max(1, intro.offsetHeight - window.innerHeight)));
    /* ถึง hero แล้วยุบฉากเปิดเหลือหนึ่งจอ ตำแหน่งที่เห็นไม่ขยับ แต่เลื่อนขึ้นกลับไปภาพปะติดไม่ได้อีก (เจ้าของสั่ง 27 ต.ค. 2569) */
    const finish = () => {
      if (finished) return;
      finished = true;
      stopAuto?.();
      const before = intro.offsetHeight;
      intro.classList.add('is-static');
      window.scrollTo({ top: Math.max(0, window.scrollY - (before - intro.offsetHeight)), behavior: 'instant' });
      applyScroll(1);
    };
    const layerT = (layer: HTMLElement | null) => { const t = (layer?.style.translate || '0 0').split(' ').map(parseFloat); return [t[0] || 0, t[1] || 0]; };

    // จุดตั้งต้นของการ์ดแต่ละใบ และสำหรับโปสเตอร์ ระยะไปยังช่องของมันใน hero
    const measure = () => {
      const S = stage.getBoundingClientRect();
      q('[data-card]').forEach((el, i) => {
        const v = vec[i];
        if (!v) return;
        const prev = el.style.translate;
        el.style.translate = '';
        const r = el.getBoundingClientRect();
        el.style.translate = prev;
        const [lx, ly] = layerT(el.parentElement === refs.far.current ? refs.far.current : refs.near.current);
        const bx = r.left + r.width / 2 - S.left - lx, by = r.top + r.height / 2 - S.top - ly;
        const slot = el.dataset.target != null ? stage.querySelector<HTMLElement>(`[data-slot="${el.dataset.target}"]`) : null;
        if (slot) {
          const sr = slot.getBoundingClientRect();
          Object.assign(v, { target: true, tx: sr.left + sr.width / 2 - S.left - bx, ty: sr.top + sr.height / 2 - S.top - by, ts: slot.offsetWidth / el.offsetWidth, tr: rot(slot) });
        }
      });
    };
    // หนึ่งเฟรม: โปสเตอร์เข้าช่อง การ์ดอื่นลอยออก hero ค่อย ๆ ขึ้น
    const applyScroll = (p: number) => {
      const inP = clamp((p - 0.45) / 0.4);
      const hero = refs.hero.current;
      if (hero) {
        hero.style.opacity = String(inP);
        hero.style.translate = `0 ${28 * (1 - smooth(inP))}px`;
        hero.style.pointerEvents = inP > 0.5 ? 'auto' : 'none';
      }
      const damp = 1 - clamp(p / 0.6);
      if (refs.far.current) refs.far.current.style.translate = `${mx * -10 * damp}px ${my * -10 * damp}px`;
      if (refs.near.current) refs.near.current.style.translate = `${mx * -24 * damp}px ${my * -24 * damp}px`;
      if (!dealt) return;
      const m = smooth(clamp((p - 0.04) / 0.82)), e = Math.pow(clamp(p / 0.8), 1.3), H = window.innerHeight, W = window.innerWidth;
      q('[data-card]').forEach((el, i) => {
        const v = vec[i];
        if (!v) return;
        if (v.target) {
          el.style.translate = `${v.tx! * m}px ${v.ty! * m}px`;
          el.style.rotate = `${v.fin + (v.tr! - v.fin) * m}deg`;
          el.style.scale = String(1 + (v.ts! - 1) * m);
          el.style.opacity = '1';
        } else {
          el.style.translate = `${v.vx * W * 0.5 * v.depth * e}px ${(v.vy * H * 0.35 - H * 0.9) * v.depth * e}px`;
          el.style.rotate = `${v.fin + v.spin * e}deg`;
          el.style.scale = String(1 + 0.16 * (v.depth - 0.7) * e);
          el.style.opacity = String(1 - clamp((p - 0.2) / 0.45));
        }
      });
    };
    // แผ่นวิธีใช้งานยกออกจากส่วนรีวิวที่ตรึงไว้ แล้วแผ่นคำถามเลื่อนมาทับ
    const applyStack = () => {
      const lift = refs.lift.current, cover = refs.cover.current;
      if (!lift || !cover || reduce) return;
      const H = window.innerHeight;
      const p = clamp((H - lift.getBoundingClientRect().bottom) / (H * 0.9));
      lift.style.transform = p > 0 ? `translateY(${-p * 30}px) scale(${1 - 0.1 * p})` : '';
      lift.style.borderRadius = `${36 * clamp(p * 3)}px`;
      lift.style.boxShadow = `0 30px 80px rgba(20,12,40,${0.4 * clamp(p * 3)})`;
      lift.style.opacity = String(1 - clamp((p - 0.55) / 0.45));
      const c = clamp((H - cover.getBoundingClientRect().top) / (H * 0.8));
      if (refs.dim.current) refs.dim.current.style.opacity = String(0.6 * c);
      cover.style.transform = c < 1 ? `scale(${0.94 + 0.06 * c})` : '';
    };
    const onScroll = () => {
      applyStack();
      if (!finished && dealt && progress() >= 1) finish();
      applyScroll(progress());
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const g = refs.glow.current;
      if (g) { g.style.left = `${e.clientX}px`; g.style.top = `${e.clientY}px`; }
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
      applyScroll(progress());
    };
    const onResize = () => { if (dealt) measure(); onScroll(); };

    // เลื่อนลงเองช้า ๆ จากภาพปะติดไปที่ hero ผู้ใช้เลื่อน แตะ หรือกดปุ่มเมื่อไหร่ก็หยุด
    const autoScroll = () => {
      if (window.scrollY > 40) return;
      const to = intro.offsetHeight - window.innerHeight, from = window.scrollY, dur = 1100;
      let t0: number | null = null, raf = 0;
      const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
      const stop = () => { cancelAnimationFrame(raf); events.forEach((ev) => window.removeEventListener(ev, stop)); };
      events.forEach((ev) => window.addEventListener(ev, stop, { passive: true }));
      stopAuto = stop;
      const tick = (now: number) => {
        if (t0 === null) t0 = now;
        const t = Math.min(1, (now - t0) / dur);
        window.scrollTo({ top: from + (to - from) * ease(t), behavior: 'instant' });
        if (t < 1) raf = requestAnimationFrame(tick); else { stop(); finish(); }
      };
      raf = requestAnimationFrame(tick);
    };

    const clear = () => {
      anims.forEach((a) => a.cancel()); anims.length = 0;
      dealAnims.forEach((a) => a.cancel()); dealAnims = [];
      timers.forEach(clearTimeout); timers.length = 0;
    };
    const header = () => document.querySelector<HTMLElement>('.site-header');

    const play = () => {
      stopAuto?.();
      clear();
      dealt = false;
      const cards = q('[data-card]');
      if (!fin) fin = cards.map(rot);
      cards.forEach((el, i) => { el.style.translate = ''; el.style.scale = ''; el.style.opacity = ''; el.style.rotate = `${fin![i]}deg`; });
      [refs.far.current, refs.near.current].forEach((layer) => { if (layer) layer.style.translate = '0 0'; });
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
      vec = cards.map((el, i) => {
        const r = el.getBoundingClientRect(), ex = r.left + r.width / 2, ey = r.top + r.height / 2;
        const vx = ex - cx, vy = ey - cy, len = Math.hypot(vx, vy) || 1;
        return { vx: vx / len, vy: vy / len, depth: Number(el.dataset.depth || 1), spin: (Math.random() - 0.5) * 60, fin: fin![i], dx: cx - ex, dy: cy - ey };
      });
      if (reduce || window.scrollY > window.innerHeight * 0.5) { dealt = true; measure(); applyScroll(progress()); return; }

      const bar = header();
      if (bar) run(bar, [{ opacity: 0, translate: '0 -10px' }, { opacity: 1, translate: '0 0' }], { duration: 400, delay: 200, easing: 'cubic-bezier(.2,.7,.2,1)' });

      // การ์ดกองรวมกลางจอ แล้วแจกออกไปที่ของตัวเอง
      const order = cards.map((_, i) => i).sort(() => Math.random() - 0.5);
      let longest = 0;
      cards.forEach((el, i) => {
        const v = vec[i], jit = (Math.random() - 0.5) * 26;
        // ลำดับเฟรมต้องไม่ย้อนกลับ: แจกออกหลังเข้ากองเสร็จเสมอ
        const inStart = 60 + i * 38, inEnd = inStart + 390, dealStart = Math.max(inEnd + 60, 540 + order[i] * 52), total = dealStart + 780;
        longest = Math.max(longest, total);
        const stack = { translate: `${v.dx}px ${v.dy}px`, rotate: `${jit}deg`, scale: 0.62, opacity: 1 };
        run(el, [
          { translate: `${v.dx}px ${v.dy + 60}px`, rotate: `${jit * 1.6}deg`, scale: 0.4, opacity: 0, offset: 0 },
          { translate: `${v.dx}px ${v.dy + 60}px`, rotate: `${jit * 1.6}deg`, scale: 0.4, opacity: 0, offset: inStart / total, easing: 'cubic-bezier(.2,.8,.2,1)' },
          { ...stack, offset: inEnd / total },
          { ...stack, offset: dealStart / total, easing: 'cubic-bezier(.2,1.22,.36,1)' },
          { translate: '0 0', rotate: `${v.fin}deg`, scale: 1, opacity: 1, offset: 1 },
        ], { duration: total }, dealAnims);
        run(el, [{ transform: 'translateY(0)' }, { transform: `translateY(${-6 - Math.random() * 6}px)` }],
          { duration: 2600 + Math.random() * 2200, delay: total, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
      });
      timers.push(window.setTimeout(() => {
        dealAnims.forEach((a) => a.cancel()); dealAnims = [];
        dealt = true; measure(); applyScroll(progress());
        timers.push(window.setTimeout(autoScroll, 400));
      }, longest + 60));
    };
    replayRef.current = () => {
      finished = reduce;
      intro.classList.toggle('is-static', reduce);
      window.scrollTo({ top: 0, behavior: 'auto' });
      timers.push(window.setTimeout(play, 30));
    };

    // ส่วนอื่นค่อย ๆ ขึ้นเมื่อเลื่อนมาถึง
    let io: IntersectionObserver | null = null;
    const reveals = new Map<Element, Animation>();
    if (!reduce && 'IntersectionObserver' in window) {
      io = new IntersectionObserver((entries) => entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveals.get(entry.target)?.play();
        io?.unobserve(entry.target);
      }), { threshold: 0.12 });
      q('[data-rv="1"]').forEach((el) => {
        const a = el.animate([{ opacity: 0, translate: '0 30px', scale: 0.985 }, { opacity: 1, translate: '0 0', scale: 1 }],
          { duration: 850, delay: Number(el.dataset.delay || 0), easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
        a.pause();
        reveals.set(el, a);
        io!.observe(el);
      });
    }

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    play();
    onScroll();
    return () => {
      stopAuto?.();
      clear();
      io?.disconnect();
      reveals.forEach((a) => a.cancel());
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
    // refs คงที่ เล่นใหม่เมื่อข้อมูลพร้อมเท่านั้น
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return replayRef;
}

export function Home() {
  const { t } = useI18n();
  const s = t.landing;
  const { search, hash } = useLocation();
  const { data, error } = useApi<Landing>('/landing');
  const refs = {
    root: useRef<HTMLElement>(null), intro: useRef<HTMLElement>(null), stage: useRef<HTMLDivElement>(null), far: useRef<HTMLDivElement>(null),
    near: useRef<HTMLDivElement>(null), hero: useRef<HTMLDivElement>(null), glow: useRef<HTMLDivElement>(null),
    lift: useRef<HTMLElement>(null), cover: useRef<HTMLDivElement>(null), dim: useRef<HTMLDivElement>(null),
  };
  /* ฉากเปิดรอข้อมูลเมนเทอร์ไม่เกิน 1.2 วินาที (เซิร์ฟเวอร์ที่เพิ่งตื่นอาจช้า) ถ้าไม่ทันก็เล่นโดยไม่มีการ์ดเมนเทอร์
     ชุดการ์ดถูกตรึงตอนเริ่มเล่น ข้อมูลที่มาทีหลังไม่เพิ่มการ์ดกลางคัน (การ์ดใหม่จะไม่มีตำแหน่งให้ลอยออก) */
  const [introData, setIntroData] = useState<Landing | null>(null);
  useEffect(() => {
    if (introData) return;
    if (data || error) { setIntroData(data ?? { mentors: [], stories: [] }); return; }
    const timer = setTimeout(() => setIntroData({ mentors: [], stories: [] }), 500);
    return () => clearTimeout(timer);
  }, [data, error, introData]);
  const ready = introData !== null;
  useLandingMotion(ready && !search, refs);

  useEffect(() => { document.title = `ChampionWays — ${s.pageTitle}`; }, [s.pageTitle]);
  // ลิงก์ #how #faq #stories จากหน้าอื่น เลื่อนไปส่วนนั้นหลังหน้าวาดเสร็จ
  useEffect(() => {
    if (!hash || !ready) return;
    const timer = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'auto' }), 350);
    return () => clearTimeout(timer);
  }, [hash, ready]);

  // ลิงก์ค้นหางานแข่งแบบเดิม (/?q=…) ย้ายไปหน้ารวมงานแข่ง
  if (search) return <Navigate to={`/explore${search}`} replace />;

  const mentors = data?.mentors ?? [];
  const stories = data?.stories ?? [];
  return <main ref={refs.root} id="main" tabIndex={-1} className="lp">
    <div ref={refs.glow} className="lp-glow" aria-hidden="true" />
    {introData && <Intro refs={refs} mentors={introData.mentors} />}
    {!ready && <div className="lp-intro" aria-busy="true" />}
    <div className="lp-after">
      {mentors.length > 0 && <Mentors mentors={mentors} />}
      <div className="lp-stack">
        <How liftRef={refs.lift} />
        <Stories stories={stories} dimRef={refs.dim} />
        <Faq coverRef={refs.cover} />
      </div>
    </div>
  </main>;
}
