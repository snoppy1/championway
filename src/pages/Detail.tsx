import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, Award, Building2, Calendar, Check, GraduationCap, Layers3,
  MapPin, ShieldCheck, Ticket, Trophy, Users,
} from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  daysLeft, feeLabel, formatDate, formatDeadline, placeLabel,
  primaryCategory, prizeLabel, teamLabel,
} from '../data/competitions';
import type { Competition } from '../data/competitions';
import { CoverArt } from '../components/CoverArt';
import { useApi } from '../lib/useApi';
import type { ListedMentor, RankedMentor } from '../data/consult';
import { OtherRow, RankedRow } from '../components/mentors';
import { useI18n } from '../i18n';
import { useHiring } from '../data/hiring';
import { locales } from '../i18n/format';
import '../journey.css';
import '../consult.css';

type Tab = 'details' | 'mentors';
type MentorsPayload = { competition: { slug: string; name: string }; risingStar: RankedMentor[]; others: ListedMentor[] };

/* แท็บเมนเทอร์ที่พร้อมให้ปรึกษา: สมาชิก Rising Star ของเวทีนี้เรียงตามคะแนนรีวิวเฉลี่ยของเดือนนี้ (มีเลขอันดับ)
   แล้วเมนเทอร์ที่ไม่ได้เป็นสมาชิกต่อท้ายโดยไม่มีอันดับ ข้อมูลและการเรียงมาจาก GET /api/consult/competitions/:slug/mentors
   ถ้าไม่มีใครเลือกเวทีนี้ จะบอกตามจริง ไม่เติมรายชื่อที่ไม่เกี่ยวข้องให้หน้าดูเต็ม */
function AvailableMentors({ slug }: { slug: string }) {
  const { t, lang } = useI18n();
  // จ้างพักไว้: แถวเมนเทอร์เป็น "ดูโปรไฟล์" ไม่ใช่ "จ้าง"
  const hiring = useHiring();
  const s = t.detail;
  const { data, error, loading, reload } = useApi<MentorsPayload>(`/consult/competitions/${encodeURIComponent(slug)}/mentors`);
  // อันดับนับตามเดือนปฏิทินเวลาไทย
  const month = new Intl.DateTimeFormat(locales[lang], { month: 'long', timeZone: 'Asia/Bangkok' }).format(new Date());

  if (loading && !data) return <>
    <p className="sr-only" role="status">{s.mentorsLoading}</p>
    <div aria-hidden="true"><div className="rs-skeleton rs-skeleton--row" /><div className="rs-skeleton rs-skeleton--row" /></div>
  </>;
  if (error && !data) return <div className="cx-state cx-state--error" role="alert">
    <h3>{s.mentorsError}</h3>
    <p>{error}</p>
    <button type="button" className="ghost-button cx-button" onClick={reload}>{s.mentorsRetry}</button>
  </div>;
  if (!data) return null;
  if (!data.risingStar.length && !data.others.length) return <div className="cx-state">
    <h3>{s.mentorsEmpty}</h3>
    <p>{s.mentorsEmptyText}</p>
    <Link className="ghost-button cx-button" to="/mentors">{s.mentorsEmptyLink}</Link>
  </div>;

  return <>
    <section className="rs-section" aria-labelledby="rising-title">
      <div className="rs-section-head"><h3 id="rising-title">{s.risingTitle}</h3></div>
      <p className="rs-section-sub">{s.risingSub(month)}</p>
      {data.risingStar.length === 0
        ? <div className="rs-empty"><p>{s.risingEmpty}</p></div>
        : <ol className="rs-list">{data.risingStar.map((mentor) => <RankedRow key={mentor.id} mentor={mentor} competition={slug} hire={hiring === true} />)}</ol>}
    </section>
    {data.others.length > 0 && <section className="rs-section" aria-labelledby="others-title">
      <div className="rs-section-head"><h3 id="others-title">{s.othersTitle}</h3></div>
      <p className="rs-section-sub">{s.othersSub}</p>
      <ul className="rs-list rs-list--plain">{data.others.map((mentor) => <OtherRow key={mentor.id} mentor={mentor} competition={slug} hire={hiring === true} />)}</ul>
    </section>}
  </>;
}

export function NotFound({ reason }: { reason?: string }) {
  const { t } = useI18n();
  const s = t.detail;
  useEffect(() => { document.title = `${s.notFoundTitle} — ChampionWays`; }, [s.notFoundTitle]);
  return <main id="main" tabIndex={-1} className="shell page">
    <p className="eyebrow">404</p>
    <h1>{s.notFoundHeading}</h1>
    <p style={{ margin: '10px 0 22px', color: 'var(--muted)' }}>
      {reason || s.notFoundText}
    </p>
    <Link className="primary-button" to="/"><ArrowLeft size={17} aria-hidden="true" />{s.backToExplore}</Link>
  </main>;
}

export function Detail() {
  const { t, lang } = useI18n();
  const s = t.detail;
  const { slug } = useParams();
  const { search, hash, pathname } = useLocation();
  // เวทีที่เกี่ยวข้องคำนวณที่เซิร์ฟเวอร์จากหมวดที่ซ้อนกัน ส่งมาพร้อมกันในคำขอเดียว
  const { data, error, loading } = useApi<{ competition: Competition; related: Competition[] }>(
    slug ? `/competitions/${encodeURIComponent(slug)}` : null,
  );
  const competition = data?.competition;

  /* สองแท็บ: รายละเอียด กับเมนเทอร์ที่พร้อมให้ปรึกษา แชร์ลิงก์ไปที่แท็บเมนเทอร์ได้ด้วย #mentors
     (#event-mentors เป็นลิงก์เก่าที่ยังมีอยู่ในอีเมลและหน้าเมนเทอร์) แท็บเริ่มจาก hash แล้วเก็บเป็น state เอง
     เปลี่ยนแท็บแก้ URL ด้วย replaceState ไม่ผ่าน router เพราะไม่อยากให้หน้าเด้งกลับไปบนสุด */
  const fromHash = (value: string): Tab => (value === '#mentors' || value === '#event-mentors' ? 'mentors' : 'details');
  const [tab, setTab] = useState<Tab>(() => fromHash(hash));
  useEffect(() => { setTab(fromHash(hash)); }, [hash]);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ details: null, mentors: null });

  function selectTab(next: Tab, focus = false) {
    setTab(next);
    window.history.replaceState(window.history.state, '', `${pathname}${search}${next === 'mentors' ? '#mentors' : ''}`);
    if (focus) tabRefs.current[next]?.focus();
  }
  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    // มีสองแท็บ ลูกศรซ้ายและขวาจึงสลับไปอีกแท็บเหมือนกัน
    const other: Tab = tab === 'details' ? 'mentors' : 'details';
    const next = event.key === 'ArrowRight' || event.key === 'ArrowLeft' ? other
      : event.key === 'Home' ? 'details' : event.key === 'End' ? 'mentors' : null;
    if (!next) return;
    event.preventDefault();
    selectTab(next, true);
  }

  useEffect(() => {
    if (competition) document.title = `${competition.name} — ChampionWays`;
  }, [competition]);

  if (loading) return <main id="main" tabIndex={-1} className="shell page"><p className="side-note">{s.loading}</p></main>;
  if (!competition) return <NotFound reason={error} />;

  const main = primaryCategory(competition);
  const related = data?.related ?? [];
  const left = daysLeft(competition);
  // ทั้งห้าส่วนเป็นเนื้อหาที่ทีมงานเขียนเอง รายการที่ยังไม่มีคนเขียนให้ข้ามไป
  const sections: { title: string; body: ReactNode }[] = [];
  if (competition.overview) sections.push({ title: s.overview, body: <p>{competition.overview}</p> });
  if (competition.audience) sections.push({ title: s.audience, body: <p>{competition.audience}</p> });
  if (competition.format?.length) sections.push({
    title: s.format,
    body: <ol className="step-list">{competition.format.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol>,
  });
  if (competition.deliverables?.length) sections.push({
    title: s.deliverables,
    body: <ul className="check-list">{competition.deliverables.map((item) => <li key={item}><Check size={16} aria-hidden="true" /><span>{item}</span></li>)}</ul>,
  });
  if (competition.preparation?.length) sections.push({
    title: s.preparation,
    body: <ul className="prep-list">{competition.preparation.map((item) => <li key={item}>{item}</li>)}</ul>,
  });

  return <main id="main" tabIndex={-1} className="shell page detail-page">
    <div className="detail-breadcrumb">
      <Link to={`/${search}`}><ArrowLeft size={16} aria-hidden="true" />{s.backHome}</Link>
      <span>{s.breadcrumb(t.taxonomy.categories[main])}</span>
    </div>

    <section className="detail-hero" aria-labelledby="competition-title">
      <div>
        <p className="pill-row">
          {competition.categories.map((id) => <span className="category-pill" key={id}>{t.taxonomy.categories[id]}</span>)}
          <span className="type-pill">{t.taxonomy.types[competition.type]}</span>
        </p>
        <h1 id="competition-title">{competition.name}</h1>
        <p>{competition.description}</p>
      </div>
      <div className="detail-cover"><CoverArt category={main} seed={`detail-${competition.slug}`} /></div>
    </section>

    <div className="cx-tabs" id="competition-tabs" role="tablist" aria-label={s.tabsLabel}>
      {(['details', 'mentors'] as Tab[]).map((id) => <button
        key={id} type="button" role="tab" id={`tab-${id}`} aria-controls={`panel-${id}`}
        aria-selected={tab === id} tabIndex={tab === id ? 0 : -1}
        ref={(element) => { tabRefs.current[id] = element; }}
        className={tab === id ? 'tab-button cx-tab active' : 'tab-button cx-tab'}
        onClick={() => selectTab(id)} onKeyDown={onTabKey}
      >{id === 'details' ? s.tabDetails : s.tabMentors}</button>)}
    </div>

    <div role="tabpanel" id="panel-details" aria-labelledby="tab-details" hidden={tab !== 'details'}>
    <div className="detail-grid">
      <aside className="detail-side" aria-labelledby="at-a-glance">
        <div className="summary-panel">
          <h2 id="at-a-glance">{s.glanceTitle}</h2>
          <dl>
            <div>
              <dt><Calendar size={16} aria-hidden="true" />{s.closesLabel}</dt>
              <dd>{formatDeadline(competition, lang)}{left >= 0 && ` · ${t.competition.daysLeft(left)}`}</dd>
            </div>
            <div>
              <dt><Trophy size={16} aria-hidden="true" />{s.prize}</dt>
              <dd>{prizeLabel(competition, t, lang)}</dd>
            </div>
            {competition.rewards.length > 0 && <div>
              <dt><Award size={16} aria-hidden="true" />{s.otherRewards}</dt>
              <dd>{competition.rewards.map((reward) => t.taxonomy.rewards[reward]).join(' · ')}</dd>
            </div>}
            <div>
              <dt><Building2 size={16} aria-hidden="true" />{s.organizer}</dt>
              <dd>{competition.org}</dd>
            </div>
            <div>
              <dt><MapPin size={16} aria-hidden="true" />{s.placeFormat}</dt>
              <dd>{placeLabel(competition, t)}</dd>
            </div>
            <div>
              <dt><Ticket size={16} aria-hidden="true" />{s.fee}</dt>
              <dd>{feeLabel(competition, t, lang)}</dd>
            </div>
            <div>
              <dt><Layers3 size={16} aria-hidden="true" />{s.categories}</dt>
              <dd>{competition.categories.map((id) => t.taxonomy.categories[id]).join(' · ')}</dd>
            </div>
            <div>
              <dt><GraduationCap size={16} aria-hidden="true" />{s.levels}</dt>
              <dd>{competition.levels.map((level) => t.taxonomy.levels[level]).join(' / ')}</dd>
            </div>
            <div>
              <dt><Users size={16} aria-hidden="true" />{s.team}</dt>
              <dd>{teamLabel(competition, t)}</dd>
            </div>
          </dl>
        </div>

        <div className="source-panel">
          <h2><ShieldCheck size={16} aria-hidden="true" />{s.sourceTitle}</h2>
          <p>{s.sourceLine(t.taxonomy.sources[competition.source], formatDate(competition.lastVerifiedAt, lang))}</p>
          {competition.sourceUrl
            ? <p><a href={competition.sourceUrl} rel="noreferrer noopener" target="_blank">{s.openSource}<ArrowRight size={14} aria-hidden="true" /></a></p>
            : <p className="side-note">{s.noSourceLink}</p>}
        </div>

      </aside>

      <div className="detail-article">
        {sections.map((section, index) => <section className="article-section" key={section.title}>
          <span className="section-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <div><h2>{section.title}</h2>{section.body}</div>
        </section>)}
      </div>
    </div>

    </div>

    <div role="tabpanel" id="panel-mentors" aria-labelledby="tab-mentors" hidden={tab !== 'mentors'} className="cx-mentors-panel">
      <div className="section-head">
        <h2>{s.mentorsTitle}</h2>
      </div>
      <p className="cx-lead">{s.mentorsLead}</p>
      <AvailableMentors slug={competition.slug} />
    </div>

    {related.length > 0 && <section className="related-section" aria-labelledby="related-title">
      <div className="section-head">
        <h2 id="related-title">{s.relatedTitle}</h2>
        <Link className="detail-link" to={`/?cat=${main}`}>
          {s.viewCategory(t.taxonomy.categories[main])}<ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <div className="related-grid">
        {related.map((item) => <Link className="related-item" key={item.slug} to={`/competitions/${item.slug}${search}`}>
          <span className="related-thumb"><CoverArt category={primaryCategory(item)} seed={`related-${item.slug}`} /></span>
          <div>
            <span className="card-org">{item.org}</span>
            <h3>{item.name}</h3>
          </div>
        </Link>)}
      </div>
    </section>}
  </main>;
}
