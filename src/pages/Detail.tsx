import { useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, Award, Building2, Calendar, Check, GraduationCap, Layers3,
  MapPin, ShieldCheck, Ticket, Trophy, Users,
} from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  categoryLabel, daysLeft, feeLabel, formatDate, formatDeadline, levelLabels, placeLabel,
  primaryCategory, prizeLabel, rewardLabels, sourceLabels, teamLabel, typeLabels,
} from '../data/competitions';
import type { Competition } from '../data/competitions';
import { CoverArt } from '../components/CoverArt';
import { useApi } from '../lib/useApi';
import { themes, thaiTime } from '../data/focus';
import type { Theme } from '../data/focus';
import '../journey.css';

type MentorMatch = {
  id: string; name: string; avatar: string; bio: string; direct: boolean; reasons: string[];
  scores: { theme: Theme; active: boolean }[];
  slots: { id: string; startsAt: string }[];
};

/* เมนเทอร์ที่ขึ้นตรงนี้คือผู้ผ่านอนุมัติที่มีช่องเวลาว่างและตรงกับหมวดของงานนี้เท่านั้น
   ถ้าไม่มีใครตรง จะบอกตามจริง ไม่เติมรายชื่อที่ไม่เกี่ยวข้องให้หน้าดูเต็ม */
function MentorsForEvent({ slug }: { slug: string }) {
  const { data, loading } = useApi<{ items: MentorMatch[] }>(`/journey/competitions/${encodeURIComponent(slug)}/mentors`);
  const items = data?.items ?? [];

  return <section className="related-section" aria-labelledby="event-mentors">
    <div className="section-head">
      <h2 id="event-mentors">เมนเทอร์สำหรับงานนี้</h2>
    </div>
    {loading ? <p className="side-note">กำลังหาเมนเทอร์ที่ว่าง…</p>
      : items.length ? <div className="mentor-match-grid">
        {items.map((mentor) => <article className="panel mentor-match" key={mentor.id}>
          <span className="mentor-avatar" aria-hidden="true">{mentor.avatar}</span>
          <div>
            <h3>{mentor.name}{mentor.direct && <span className="theme-pill">เลือกช่วยงานนี้</span>}</h3>
            <p className="card-summary">{mentor.bio}</p>
            <ul className="reason-list">{mentor.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            <p className="muted">ว่างเร็วที่สุด {thaiTime(mentor.slots[0].startsAt)}</p>
            <p className="pill-row">
              {mentor.scores.filter((score) => score.active).map((score) => <span className="theme-pill" key={score.theme}>{themes[score.theme]}</span>)}
            </p>
            <p className="card-actions">
              <Link className="primary-button" to={`/mentors/${mentor.id}?competition=${slug}`}>ดูโปรไฟล์และขอจอง</Link>
            </p>
          </div>
        </article>)}
      </div> : <p className="side-note">
        ยังไม่มีเมนเทอร์ที่ตรงกับหมวดของงานนี้และมีช่องเวลาว่าง เมื่อมีคนเปิดคิวจะขึ้นที่นี่
      </p>}
  </section>;
}

export function NotFound({ reason }: { reason?: string }) {
  useEffect(() => { document.title = 'ไม่พบหน้า — ChampionWays'; }, []);
  return <main id="main" tabIndex={-1} className="shell page">
    <p className="eyebrow">404</p>
    <h1>ยังไม่พบเวทีนี้</h1>
    <p style={{ margin: '10px 0 22px', color: 'var(--muted)' }}>
      {reason || 'ลิงก์นี้อาจไม่ถูกต้อง ลองกลับไปเลือกเวทีที่สนใจจากหน้าแรก'}
    </p>
    <Link className="primary-button" to="/"><ArrowLeft size={17} aria-hidden="true" />กลับไปสำรวจการแข่งขัน</Link>
  </main>;
}

export function Detail() {
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

  if (loading) return <main id="main" tabIndex={-1} className="shell page"><p className="side-note">กำลังโหลด…</p></main>;
  if (!competition) return <NotFound reason={error} />;

  const main = primaryCategory(competition);
  const related = data?.related ?? [];
  const left = daysLeft(competition);
  // ทั้งห้าส่วนเป็นเนื้อหาที่ทีมงานเขียนเอง รายการที่ยังไม่มีคนเขียนให้ข้ามไป
  const sections: { title: string; body: ReactNode }[] = [];
  if (competition.overview) sections.push({ title: 'เวทีนี้เกี่ยวกับอะไร', body: <p>{competition.overview}</p> });
  if (competition.audience) sections.push({ title: 'เหมาะกับใคร', body: <p>{competition.audience}</p> });
  if (competition.format?.length) sections.push({
    title: 'รูปแบบการแข่งขัน',
    body: <ol className="step-list">{competition.format.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol>,
  });
  if (competition.deliverables?.length) sections.push({
    title: 'สิ่งที่ต้องส่ง',
    body: <ul className="check-list">{competition.deliverables.map((item) => <li key={item}><Check size={16} aria-hidden="true" /><span>{item}</span></li>)}</ul>,
  });
  if (competition.preparation?.length) sections.push({
    title: 'ทักษะและสิ่งที่ควรเตรียม',
    body: <ul className="prep-list">{competition.preparation.map((item) => <li key={item}>{item}</li>)}</ul>,
  });

  return <main id="main" tabIndex={-1} className="shell page detail-page">
    <div className="detail-breadcrumb">
      <Link to={`/${search}`}><ArrowLeft size={16} aria-hidden="true" />กลับไปหน้าแรก</Link>
      <span>สำรวจการแข่งขัน / {categoryLabel(main)}</span>
    </div>

    <section className="detail-hero" aria-labelledby="competition-title">
      <div>
        <p className="pill-row">
          {competition.categories.map((id) => <span className="category-pill" key={id}>{categoryLabel(id)}</span>)}
          <span className="type-pill">{typeLabels[competition.type]}</span>
        </p>
        <h1 id="competition-title">{competition.name}</h1>
        <p>{competition.description}</p>
      </div>
      <div className="detail-cover"><CoverArt category={main} seed={`detail-${competition.slug}`} /></div>
    </section>

    <div className="detail-grid">
      <aside className="detail-side" aria-labelledby="at-a-glance">
        <div className="summary-panel">
          <h2 id="at-a-glance">รู้จักเวทีนี้ในหนึ่งนาที</h2>
          <dl>
            <div>
              <dt><Calendar size={16} aria-hidden="true" />ปิดรับสมัคร</dt>
              <dd>{formatDeadline(competition)}{left >= 0 && ` · อีก ${left} วัน`}</dd>
            </div>
            <div>
              <dt><Trophy size={16} aria-hidden="true" />รางวัล</dt>
              <dd>{prizeLabel(competition)}</dd>
            </div>
            {competition.rewards.length > 0 && <div>
              <dt><Award size={16} aria-hidden="true" />ได้รับนอกจากเงินรางวัล</dt>
              <dd>{competition.rewards.map((reward) => rewardLabels[reward]).join(' · ')}</dd>
            </div>}
            <div>
              <dt><Building2 size={16} aria-hidden="true" />ผู้จัด</dt>
              <dd>{competition.org}</dd>
            </div>
            <div>
              <dt><MapPin size={16} aria-hidden="true" />รูปแบบและสถานที่</dt>
              <dd>{placeLabel(competition)}</dd>
            </div>
            <div>
              <dt><Ticket size={16} aria-hidden="true" />ค่าสมัคร</dt>
              <dd>{feeLabel(competition)}</dd>
            </div>
            <div>
              <dt><Layers3 size={16} aria-hidden="true" />หมวดการแข่งขัน</dt>
              <dd>{competition.categories.map(categoryLabel).join(' · ')}</dd>
            </div>
            <div>
              <dt><GraduationCap size={16} aria-hidden="true" />ระดับผู้สมัคร</dt>
              <dd>{competition.levels.map((level) => levelLabels[level]).join(' / ')}</dd>
            </div>
            <div>
              <dt><Users size={16} aria-hidden="true" />รูปแบบทีม</dt>
              <dd>{teamLabel(competition)}</dd>
            </div>
          </dl>
        </div>

        <div className="source-panel">
          <h2><ShieldCheck size={16} aria-hidden="true" />ที่มาของข้อมูล</h2>
          <p>{sourceLabels[competition.source]} · ตรวจล่าสุด {formatDate(competition.lastVerifiedAt)}</p>
          {competition.sourceUrl
            ? <p><a href={competition.sourceUrl} rel="noreferrer noopener" target="_blank">เปิดประกาศต้นทาง<ArrowRight size={14} aria-hidden="true" /></a></p>
            : <p className="side-note">ยังไม่มีลิงก์ประกาศต้นทาง โปรดตรวจสอบรายละเอียดกับผู้จัดก่อนสมัคร</p>}
        </div>

        <p style={{ marginTop: 14 }}>
          <a className="ghost-button" href="#event-mentors">ดูเมนเทอร์สำหรับเวทีนี้</a>
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
        <h2 id="related-title">อีกเส้นทางในความสนใจเดียวกัน</h2>
        <Link className="detail-link" to={`/?cat=${main}`}>
          ดูหมวด{categoryLabel(main)}ทั้งหมด<ArrowRight size={16} aria-hidden="true" />
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
