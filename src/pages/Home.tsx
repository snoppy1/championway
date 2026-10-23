import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Pause, Play, Plus } from 'lucide-react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useApi } from '../lib/useApi';
import { useI18n } from '../i18n';
import type { HelpsWith } from '../data/matching';
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
import '../landing.css';

/* หน้าแรกแบบใหม่ (Claude Design "ChampionWays", 23 ต.ค. 2569)
   hero โปสเตอร์งานแข่ง → เมนเทอร์จริง (เลื่อนเอง หยุดได้) → วิธีใช้งาน 4 ขั้น → รีวิวจริงและชวนเป็นเมนเทอร์ → คำถามที่พบบ่อย
   ไม่มีอันดับ Rising Star (เจ้าของตัดสิน 23 ต.ค. 2569) ปุ่มหาเมนเทอร์พาไปหน้า /match
   ส่วนที่ยังไม่มีข้อมูลจริงซ่อนไว้ ไม่ใส่ข้อความตัวอย่าง */

type LandingMentor = {
  id: string; name: string; initial: string; photoUrl: string | null; headline: string; bio: string; helpsWith: HelpsWith[];
  rating: { average: number | null; reviews: number }; events: number;
};
type Story = { comment: string; stars: number; name: string; initial: string; mentor: string };
type Landing = { mentors: LandingMentor[]; stories: Story[] };

const POSTERS = [posterIecu, posterCaase, posterUhack, posterIecu];
const STEPS = [stepNotebook, stepHandshake, stepBubble, stepStars];
const BADGES = ['#c2410c', '#c2410c', '#1d4ed8', '#7e22ce'];
const MATCH = '/match';

const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** คำท้ายหัวข้อเป็นลายมือสีม่วง */
function Accent({ children }: { children: string }) {
  return <span className="lp-accent">{children}</span>;
}

function Hero() {
  const { t, lang } = useI18n();
  const s = t.landing;
  return <section className="lp-hero" aria-labelledby="lp-hero-title">
    <div className="lp-hero__posters" aria-hidden="true">
      {POSTERS.map((src, i) => <div key={i} className={`lp-poster is-${i}`}><img src={src} alt="" /></div>)}
    </div>
    <div className="lp-hero__copy">
      <h1 id="lp-hero-title" className={lang === 'th' ? 'is-th' : ''}>
        <span>{s.h1a}</span>{' '}
        <span>{s.h1b} <span className="lp-hero__accent">{s.h1accent}</span></span>
      </h1>
      <p>{s.heroLead}</p>
      <div className="lp-hero__cta">
        <Link className="lp-btn" to={MATCH}>{s.findMentor}</Link>
        <a className="lp-btn is-light" href="#how">{s.howToUse}</a>
      </div>
    </div>
  </section>;
}

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

/* แถบเมนเทอร์เลื่อนเองทุก 3.6 วินาที (ตามดีไซน์) หยุดเมื่อชี้หรือโฟกัส มีปุ่มหยุด/เล่น และปุ่มก่อนหน้า/ถัดไป
   ผู้ใช้ที่ตั้งลดการเคลื่อนไหวไม่เลื่อนเอง */
function Mentors({ mentors }: { mentors: LandingMentor[] }) {
  const { t } = useI18n();
  const s = t.landing;
  const track = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(() => !reduceMotion());
  const [hovered, setHovered] = useState(false);
  const step = (dir: 1 | -1) => {
    const el = track.current;
    const card = el?.querySelector<HTMLElement>('.lp-mentor');
    if (!el || !card) return;
    const width = card.getBoundingClientRect().width + 16;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    if (dir === 1 && atEnd) el.scrollTo({ left: 0, behavior: 'smooth' });
    else el.scrollBy({ left: dir * width, behavior: 'smooth' });
  };
  useEffect(() => {
    if (!playing || hovered || mentors.length < 2) return;
    const timer = setInterval(() => step(1), 3600);
    return () => clearInterval(timer);
  }, [playing, hovered, mentors.length]);

  return <section className="lp-mentors" id="mentors" aria-labelledby="lp-mentors-title">
    <div className="lp-shell">
      <div className="lp-mentors__head">
        <h2 id="lp-mentors-title">{s.mentorsA}<br />{s.mentorsB} <Accent>{s.mentorsAccent}</Accent></h2>
        {mentors.length > 1 && <div className="lp-carousel-controls">
          <button type="button" aria-label={s.prev} onClick={() => step(-1)}><ArrowLeft size={18} aria-hidden="true" /></button>
          <button type="button" aria-label={playing ? s.pause : s.play} onClick={() => setPlaying((p) => !p)}>
            {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          </button>
          <button type="button" aria-label={s.next} onClick={() => step(1)}><ArrowRight size={18} aria-hidden="true" /></button>
        </div>}
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

function How() {
  const { t } = useI18n();
  const s = t.landing;
  return <section className="lp-how" id="how" aria-labelledby="lp-how-title">
    <div className="lp-shell">
      <div className="lp-how__head">
        <h2 id="lp-how-title">{s.howA} <Accent>{s.howAccent}</Accent></h2>
        <p>{s.howLead}</p>
      </div>
      <ol className="lp-steps">
        {s.steps.map((item, i) => <li key={item.title} className={`lp-step is-${i}`}>
          <div className="lp-step__art" aria-hidden="true">
            <img src={STEPS[i]} alt="" />
            <span style={{ background: BADGES[i] }}>{String(i + 1).padStart(2, '0')}</span>
          </div>
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

function Stories({ stories }: { stories: Story[] }) {
  const { t } = useI18n();
  const s = t.landing;
  return <section className="lp-stories" id="stories" aria-labelledby="lp-stories-title">
    <div className="lp-shell">
      <div className="lp-stories__head">
        <h2 id="lp-stories-title">{s.storiesA}<br />{s.storiesB} <Accent>{s.storiesAccent}</Accent></h2>
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
      <div className="lp-become">
        <p>{s.becomeA}<br />{s.becomeB}</p>
        <Link className="lp-btn is-gold" to="/mentors/apply">{s.becomeCta}</Link>
      </div>
    </div>
  </section>;
}

function Faq() {
  const { t } = useI18n();
  const s = t.landing;
  const [open, setOpen] = useState<boolean[]>(() => s.faqs.map((_, i) => i === 0));
  return <section className="lp-faq" id="faq" aria-labelledby="lp-faq-title">
    <div className="lp-shell lp-faq__grid">
      <div>
        <h2 id="lp-faq-title">{s.faqA}<br /><Accent>{s.faqAccent}</Accent></h2>
        <p>{s.faqLead}</p>
      </div>
      <div className="lp-faq__list">
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
  </section>;
}

export function Home() {
  const { t } = useI18n();
  const { search, hash } = useLocation();
  const { data } = useApi<Landing>('/landing');

  useEffect(() => { document.title = `ChampionWays — ${t.landing.pageTitle}`; }, [t.landing.pageTitle]);
  // ลิงก์ที่มี #how #faq หรือ #stories จากหน้าอื่น เลื่อนไปส่วนนั้นหลังหน้าวาดเสร็จ
  useEffect(() => {
    if (!hash) return;
    const timer = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth' }), 350);
    return () => clearTimeout(timer);
  }, [hash, data]);

  // ลิงก์ค้นหางานแข่งแบบเดิม (/?q=…) ย้ายไปหน้ารวมงานแข่ง
  if (search) return <Navigate to={`/explore${search}`} replace />;

  return <main id="main" tabIndex={-1} className="lp">
    <Hero />
    {data && data.mentors.length > 0 && <Mentors mentors={data.mentors} />}
    <How />
    <Stories stories={data?.stories ?? []} />
    <Faq />
  </main>;
}
