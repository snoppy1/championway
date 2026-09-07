import { useEffect } from 'react';
import { ArrowLeft, ArrowUpRight, Check, GraduationCap, Layers3, Users } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { categoryInfo, competitions, levelLabels } from '../data/competitions';
import { Poster } from '../components/Poster';
import { SampleNote } from '../components/Layout';

export function NotFound() {
  useEffect(() => { document.title = 'ไม่พบหน้า — ChampionWays'; }, []);
  return <main id="main" tabIndex={-1} className="container not-found"><span className="eyebrow">404 / A NEW DIRECTION</span><h1>ยังไม่พบเวทีนี้</h1><p>ลิงก์นี้อาจไม่ถูกต้อง ลองกลับไปเลือกเวทีที่สนใจจากหน้าสำรวจ</p><Link className="primary-button" to="/competitions"><ArrowLeft size={18} aria-hidden="true" />กลับไปสำรวจการแข่งขัน</Link><SampleNote /></main>;
}

export function Detail() {
  const { slug } = useParams();
  const { search } = useLocation();
  const competition = competitions.find((item) => item.slug === slug);
  useEffect(() => { if (competition) document.title = `${competition.name} — ChampionWays`; }, [competition]);
  if (!competition) return <NotFound />;
  const category = categoryInfo(competition.category);
  const related = competitions.filter((item) => item.category === competition.category && item.id !== competition.id).slice(0, 2);

  return <main id="main" tabIndex={-1} className="container detail-page">
    <div className="detail-breadcrumb"><Link to={`/competitions${search}`}><ArrowLeft size={17} aria-hidden="true" />กลับไปหน้าสำรวจ</Link><span className="detail-breadcrumb-category">สำรวจการแข่งขัน <span>/</span> {category.label}</span></div>
    <section className="detail-hero" aria-labelledby="competition-title">
      <div className="detail-hero-copy"><div className="eyebrow"><span className="eyebrow-line" />{category.english} / {competition.id.slice(-2)}</div><h1 id="competition-title">{competition.name}</h1><p>{competition.description}</p><SampleNote /></div>
      <div className="detail-hero-poster"><Poster competition={competition} /></div>
    </section>
    <div className="detail-content">
      <aside className="detail-sidebar" aria-labelledby="at-a-glance"><div className="summary-panel"><span className="eyebrow">AT A GLANCE</span><h2 id="at-a-glance">รู้จักเวทีนี้ในหนึ่งนาที</h2><dl><div><dt><Layers3 size={17} aria-hidden="true" />หมวดการแข่งขัน</dt><dd>{category.label}</dd></div><div><dt><GraduationCap size={18} aria-hidden="true" />ระดับผู้สมัคร</dt><dd>{competition.levels.map((level) => levelLabels[level]).join(' / ')}</dd></div><div><dt><Users size={17} aria-hidden="true" />รูปแบบทีม</dt><dd>{competition.team}</dd></div></dl><div className="summary-footnote">เริ่มจากทำความเข้าใจโจทย์<br />แล้วค่อยค้นหาทางที่เป็นของคุณ<ArrowUpRight size={23} aria-hidden="true" /></div></div><p className="detail-data-note">รายละเอียดและเงื่อนไขในหน้านี้เป็นข้อมูลสมมติ เพื่อทดลองใช้งานเว็บต้นแบบ</p></aside>
      <div className="detail-article">
        <section className="article-section"><span className="section-number">01</span><div><h2>เวทีนี้เกี่ยวกับอะไร</h2><p>{competition.overview}</p></div></section>
        <section className="article-section"><span className="section-number">02</span><div><h2>เหมาะกับใคร</h2><p>{competition.audience}</p></div></section>
        <section className="article-section"><span className="section-number">03</span><div><h2>รูปแบบการแข่งขัน</h2><ol className="step-list">{competition.format.map((step, index) => <li key={step}><span>{index + 1}</span><p>{step}</p></li>)}</ol></div></section>
        <section className="article-section"><span className="section-number">04</span><div><h2>สิ่งที่ต้องส่ง</h2><ul className="check-list">{competition.deliverables.map((item) => <li key={item}><Check size={17} aria-hidden="true" /><span>{item}</span></li>)}</ul></div></section>
        <section className="article-section preparation-section"><span className="section-number">05</span><div><h2>ทักษะและสิ่งที่ควรเตรียม</h2><ul className="preparation-list">{competition.preparation.map((item) => <li key={item}>{item}</li>)}</ul></div></section>
      </div>
    </div>
    <section className="related-section" aria-labelledby="related-title"><div className="related-header"><div><span className="eyebrow">KEEP EXPLORING</span><h2 id="related-title">อีกเส้นทางในความสนใจเดียวกัน</h2></div><Link className="text-link" to={`/competitions?category=${competition.category}`}>ดูหมวด{category.label}ทั้งหมด<ArrowUpRight size={17} aria-hidden="true" /></Link></div><div className="related-list">{related.map((item) => <Link className="related-item" key={item.id} to={`/competitions/${item.slug}${search}`}><Poster competition={item} /><div><span className="category-label">{category.label}</span><h3>{item.name}</h3><span className="related-action">ดูรายละเอียด<ArrowUpRight size={17} aria-hidden="true" /></span></div></Link>)}</div></section>
  </main>;
}
