import { useEffect } from 'react';
import { ArrowLeft, ArrowRight, Building2, Calendar, Check, GraduationCap, Layers3, Trophy, Users } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  categoryLabel, competitions, findCompetition, formatDeadline, levelLabels,
} from '../data/competitions';
import { CoverArt } from '../components/CoverArt';

export function NotFound() {
  useEffect(() => { document.title = 'ไม่พบหน้า — ChampionWays'; }, []);
  return <main id="main" tabIndex={-1} className="shell page">
    <p className="eyebrow">404</p>
    <h1>ยังไม่พบเวทีนี้</h1>
    <p style={{ margin: '10px 0 22px', color: 'var(--muted)' }}>ลิงก์นี้อาจไม่ถูกต้อง ลองกลับไปเลือกเวทีที่สนใจจากหน้าแรก</p>
    <Link className="primary-button" to="/"><ArrowLeft size={17} aria-hidden="true" />กลับไปสำรวจการแข่งขัน</Link>
  </main>;
}

export function Detail() {
  const { slug } = useParams();
  const { search } = useLocation();
  const competition = findCompetition(slug);

  useEffect(() => {
    if (competition) document.title = `${competition.name} — ChampionWays`;
  }, [competition]);

  if (!competition) return <NotFound />;

  const related = competitions
    .filter((item) => item.category === competition.category && item.slug !== competition.slug)
    .slice(0, 2);

  return <main id="main" tabIndex={-1} className="shell page detail-page">
    <div className="detail-breadcrumb">
      <Link to={`/${search}`}><ArrowLeft size={16} aria-hidden="true" />กลับไปหน้าแรก</Link>
      <span>สำรวจการแข่งขัน / {categoryLabel(competition.category)}</span>
    </div>

    <section className="detail-hero" aria-labelledby="competition-title">
      <div>
        <span className="category-pill">{categoryLabel(competition.category)}</span>
        <h1 id="competition-title">{competition.name}</h1>
        <p>{competition.description}</p>
      </div>
      <div className="detail-cover"><CoverArt category={competition.category} seed={`detail-${competition.slug}`} /></div>
    </section>

    <div className="detail-grid">
      <aside className="detail-side" aria-labelledby="at-a-glance">
        <div className="summary-panel">
          <h2 id="at-a-glance">รู้จักเวทีนี้ในหนึ่งนาที</h2>
          <dl>
            <div>
              <dt><Calendar size={16} aria-hidden="true" />ปิดรับสมัคร</dt>
              <dd>{formatDeadline(competition)} · อีก {competition.dueInDays} วัน</dd>
            </div>
            <div>
              <dt><Trophy size={16} aria-hidden="true" />รางวัล</dt>
              <dd>{competition.prize}</dd>
            </div>
            <div>
              <dt><Building2 size={16} aria-hidden="true" />ผู้จัด</dt>
              <dd>{competition.org}</dd>
            </div>
            <div>
              <dt><Layers3 size={16} aria-hidden="true" />หมวดการแข่งขัน</dt>
              <dd>{categoryLabel(competition.category)}</dd>
            </div>
            <div>
              <dt><GraduationCap size={16} aria-hidden="true" />ระดับผู้สมัคร</dt>
              <dd>{competition.levels.map((level) => levelLabels[level]).join(' / ')}</dd>
            </div>
            <div>
              <dt><Users size={16} aria-hidden="true" />รูปแบบทีม</dt>
              <dd>{competition.team}</dd>
            </div>
          </dl>
        </div>
        <p className="side-note">รายละเอียดและเงื่อนไขในหน้านี้เป็นข้อมูลสมมติ เพื่อทดลองใช้งานเว็บต้นแบบ</p>
        <p style={{ marginTop: 14 }}>
          <Link className="ghost-button" to={`/mentors?competition=${competition.slug}`}>หาเมนเทอร์สำหรับเวทีนี้</Link>
        </p>
      </aside>

      <div className="detail-article">
        <section className="article-section">
          <span className="section-number" aria-hidden="true">01</span>
          <div><h2>เวทีนี้เกี่ยวกับอะไร</h2><p>{competition.overview}</p></div>
        </section>
        <section className="article-section">
          <span className="section-number" aria-hidden="true">02</span>
          <div><h2>เหมาะกับใคร</h2><p>{competition.audience}</p></div>
        </section>
        <section className="article-section">
          <span className="section-number" aria-hidden="true">03</span>
          <div>
            <h2>รูปแบบการแข่งขัน</h2>
            <ol className="step-list">
              {competition.format.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}
            </ol>
          </div>
        </section>
        <section className="article-section">
          <span className="section-number" aria-hidden="true">04</span>
          <div>
            <h2>สิ่งที่ต้องส่ง</h2>
            <ul className="check-list">
              {competition.deliverables.map((item) => <li key={item}><Check size={16} aria-hidden="true" /><span>{item}</span></li>)}
            </ul>
          </div>
        </section>
        <section className="article-section">
          <span className="section-number" aria-hidden="true">05</span>
          <div>
            <h2>ทักษะและสิ่งที่ควรเตรียม</h2>
            <ul className="prep-list">
              {competition.preparation.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </section>
      </div>
    </div>

    {related.length > 0 && <section className="related-section" aria-labelledby="related-title">
      <div className="section-head">
        <h2 id="related-title">อีกเส้นทางในความสนใจเดียวกัน</h2>
        <Link className="detail-link" to={`/?category=${competition.category}`}>
          ดูหมวด{categoryLabel(competition.category)}ทั้งหมด<ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
      <div className="related-grid">
        {related.map((item) => <Link className="related-item" key={item.slug} to={`/competitions/${item.slug}${search}`}>
          <span className="related-thumb"><CoverArt category={item.category} seed={`related-${item.slug}`} /></span>
          <div>
            <span className="card-org">{item.org}</span>
            <h3>{item.name}</h3>
          </div>
        </Link>)}
      </div>
    </section>}
  </main>;
}
