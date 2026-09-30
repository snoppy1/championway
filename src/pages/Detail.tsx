import { useEffect } from 'react';
import type { ReactNode } from 'react';
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
import type { MatchReason, Theme } from '../data/focus';
import { useI18n } from '../i18n';
import { formatDateTime } from '../i18n/format';
import '../journey.css';

type MentorMatch = {
  id: string; name: string; avatar: string; bio: string; direct: boolean; reasons: MatchReason[];
  scores: { theme: Theme; active: boolean }[];
  slots: { id: string; startsAt: string }[];
};

/* เมนเทอร์ที่ขึ้นตรงนี้คือผู้ผ่านอนุมัติที่มีช่องเวลาว่างและตรงกับหมวดของงานนี้เท่านั้น
   ถ้าไม่มีใครตรง จะบอกตามจริง ไม่เติมรายชื่อที่ไม่เกี่ยวข้องให้หน้าดูเต็ม */
function MentorsForEvent({ slug }: { slug: string }) {
  const { t, lang } = useI18n();
  const s = t.detail;
  const { data, loading } = useApi<{ items: MentorMatch[] }>(`/journey/competitions/${encodeURIComponent(slug)}/mentors`);
  const items = data?.items ?? [];

  return <section className="related-section" aria-labelledby="event-mentors">
    <div className="section-head">
      <h2 id="event-mentors">{s.mentorsTitle}</h2>
    </div>
    {loading ? <p className="side-note">{s.mentorsLoading}</p>
      : items.length ? <div className="mentor-match-grid">
        {items.map((mentor) => <article className="panel mentor-match" key={mentor.id}>
          <span className="mentor-avatar" aria-hidden="true">{mentor.avatar}</span>
          <div>
            <h3>{mentor.name}{mentor.direct && <span className="theme-pill">{t.journey.chosePill}</span>}</h3>
            <p className="card-summary">{mentor.bio}</p>
            <ul className="reason-list">{mentor.reasons.map((reason) => {
              const text = t.journey.matchReason(reason.code, reason.code === 'chose' ? '' : t.taxonomy.themes[reason.theme]);
              return <li key={text}>{text}</li>;
            })}</ul>
            <p className="muted">{s.earliest(formatDateTime(mentor.slots[0].startsAt, lang))}</p>
            <p className="pill-row">
              {mentor.scores.filter((score) => score.active).map((score) => <span className="theme-pill" key={score.theme}>{t.taxonomy.themes[score.theme]}</span>)}
            </p>
            <p className="card-actions">
              <Link className="primary-button" to={`/mentors/${mentor.id}?competition=${slug}`}>{s.viewAndBook}</Link>
            </p>
          </div>
        </article>)}
      </div> : <p className="side-note">{s.mentorsEmpty}</p>}
  </section>;
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
  const { search } = useLocation();
  // เวทีที่เกี่ยวข้องคำนวณที่เซิร์ฟเวอร์จากหมวดที่ซ้อนกัน ส่งมาพร้อมกันในคำขอเดียว
  const { data, error, loading } = useApi<{ competition: Competition; related: Competition[] }>(
    slug ? `/competitions/${encodeURIComponent(slug)}` : null,
  );
  const competition = data?.competition;

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

        <p style={{ marginTop: 14 }}>
          <a className="ghost-button" href="#event-mentors">{s.seeMentors}</a>
        </p>
      </aside>

      <div className="detail-article">
        {sections.map((section, index) => <section className="article-section" key={section.title}>
          <span className="section-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <div><h2>{section.title}</h2>{section.body}</div>
        </section>)}
      </div>
    </div>

    <MentorsForEvent slug={competition.slug} />

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
