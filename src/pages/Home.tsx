import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Calendar, ChevronDown, ChevronLeft, ChevronRight, Info, Search, SlidersHorizontal, Timer, Trophy } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  categories, categoryLabel, competitions, filterCompetitions, findCompetition,
  formatDeadline, sortCompetitions, sortOptions,
} from '../data/competitions';
import type { Competition, SortId } from '../data/competitions';
import { podium, trendingSlugs } from '../data/mentors';
import { toggleSaved, useSavedSlugs } from '../data/saved';
import { CoverArt } from '../components/CoverArt';
import { BookmarkSimple } from '../components/icons';

const PER_PAGE = 6;

function Highlights() {
  const [paused, setPaused] = useState(false);
  const trending = trendingSlugs.map(findCompetition).filter((item): item is Competition => item !== undefined);
  const run = <div className="marquee-run">
    {trending.map((competition, index) => <div className="trend-card" key={competition.slug}>
      <span className="trend-rank" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <div>
        <b>{competition.name}</b>
        <small>{categoryLabel(competition.category)} · {competition.org}</small>
      </div>
    </div>)}
  </div>;

  return <section className="shell highlights" aria-labelledby="trending-title">
    <div className="section-head">
      <div>
        <h2 id="trending-title">รายการแข่งขันที่คนสนใจมากที่สุด</h2>
        <p>อันดับตัวอย่างสำหรับการออกแบบ ยังไม่ได้วัดจากการใช้งานจริง</p>
      </div>
      <button type="button" className="ghost-button" aria-pressed={paused} onClick={() => setPaused(!paused)}>
        {paused ? 'เลื่อนต่อ' : 'หยุดการเลื่อน'}
      </button>
    </div>
    <div className="marquee-viewport">
      <div className={paused ? 'marquee-track paused' : 'marquee-track'}>
        {run}
        <div aria-hidden="true">{run}</div>
      </div>
    </div>

    <div className="podium-head">
      <h2>เมนเทอร์ประจำสัปดาห์</h2>
      <p>เมนเทอร์และอันดับเป็นข้อมูลสมมติ</p>
    </div>
    <div className="podium">
      {podium.map((mentor) => <div className={mentor.weeklyRank === 1 ? 'podium-card is-first' : 'podium-card'} key={mentor.id}>
        <span className="podium-medal">อันดับ {mentor.weeklyRank}</span>
        <div className="podium-avatar" aria-hidden="true">{mentor.avatar}</div>
        <h3>{mentor.name}</h3>
        <p>{mentor.weeklyFocus}</p>
        <small>โปรไฟล์ตัวอย่าง</small>
      </div>)}
    </div>
  </section>;
}

function CompetitionCard({ competition }: { competition: Competition }) {
  const { search } = useLocation();
  const saved = useSavedSlugs();
  const isSaved = saved.includes(competition.slug);
  const urgent = competition.dueInDays <= 7;

  return <article className="competition-card">
    {competition.featured && <div className="card-featured-bar" aria-hidden="true" />}
    <div className="card-cover">
      <CoverArt category={competition.category} seed={competition.slug} />
      {urgent && <span className="urgent-chip"><Timer size={13} aria-hidden="true" />ปิดรับอีก {competition.dueInDays} วัน</span>}
    </div>
    <div className="card-body">
      <div className="card-meta">
        <span className="category-pill">{categoryLabel(competition.category)}</span>
        <span className="card-org">{competition.org}</span>
      </div>
      <h3><Link to={`/competitions/${competition.slug}${search}`}>{competition.name}</Link></h3>
      <p className="card-summary">{competition.description}</p>
      <div className="card-facts">
        <span><Calendar size={15} aria-hidden="true" />ปิดรับ {formatDeadline(competition)}</span>
        <span><Trophy size={15} aria-hidden="true" />{competition.prize}</span>
      </div>
      <div className="card-actions">
        <Link className="detail-link" to={`/competitions/${competition.slug}${search}`} aria-label={`ดูรายละเอียด ${competition.name}`}>
          ดูรายละเอียด<ArrowRight size={14} aria-hidden="true" />
        </Link>
        <button
          type="button"
          className={isSaved ? 'save-button is-saved' : 'save-button'}
          aria-pressed={isSaved}
          onClick={() => toggleSaved(competition.slug)}
        >
          <BookmarkSimple size={15} filled={isSaved} />{isSaved ? 'บันทึกแล้ว' : 'บันทึก'}
        </button>
      </div>
    </div>
  </article>;
}

export function Home() {
  const [params, setParams] = useSearchParams();
  const saved = useSavedSlugs();

  const query = params.get('q') ?? '';
  const rawCategory = params.get('category') ?? 'all';
  const category = categories.some((item) => item.id === rawCategory) ? rawCategory : 'all';
  const rawSort = params.get('sort') ?? 'deadline';
  const sort = (sortOptions.some((item) => item.id === rawSort) ? rawSort : 'deadline') as SortId;
  const closingSoon = params.get('soon') === '1';
  const savedOnly = params.get('saved') === '1';
  const requestedPage = Number(params.get('page'));

  const [draft, setDraft] = useState(query);
  useEffect(() => { setDraft(query); }, [query]);
  useEffect(() => { document.title = 'ChampionWays — สำรวจการแข่งขัน'; }, []);

  function update(patch: Record<string, string | null>, keepPage = false) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key); else next.set(key, value);
    }
    if (!keepPage) next.delete('page');
    setParams(next, { preventScrollReset: true });
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    update({ q: draft.trim() });
  }

  const matched = filterCompetitions(query, category, closingSoon);
  const scoped = savedOnly ? matched.filter((item) => saved.includes(item.slug)) : matched;
  const results = sortCompetitions(scoped, sort);
  const pageCount = Math.max(1, Math.ceil(results.length / PER_PAGE));
  const page = Math.min(Math.max(1, Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1), pageCount);
  const shown = results.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return <main id="main" tabIndex={-1}>
    <section className="hero">
      <div className="shell hero-inner">
        <div className="hero-row">
          <span className="hero-mark" aria-hidden="true"><span /><span /><span /></span>
          <h1>Champion<span className="brand-accent">Ways</span></h1>
        </div>
        <p className="hero-tagline">ทุกเวทีคือโอกาส ทุกก้าวคือการเติบโต</p>
        <p className="hero-lead">ค้นพบการแข่งขันที่ใช่ พร้อมเรียนรู้จากคนที่เคยผ่านเวทีจริง</p>
      </div>
    </section>

    <Highlights />

    <div className="shell search-panel">
      <form className="search-bar" role="search" onSubmit={submitSearch}>
        <div className="search-field">
          <Search size={18} aria-hidden="true" />
          <label className="sr-only" htmlFor="competition-search">ค้นหาการแข่งขัน</label>
          <input
            id="competition-search" type="search" autoComplete="off"
            placeholder="ค้นหาชื่อเวทีหรือสิ่งที่สนใจ"
            value={draft} onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <button className="primary-button" type="submit">ค้นหา</button>
        <button
          type="button" className="filter-toggle" aria-pressed={closingSoon}
          onClick={() => update({ soon: closingSoon ? null : '1' })}
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
          {closingSoon ? 'ใกล้ปิดรับ' : 'ตัวกรอง'}
          {closingSoon && <span className="filter-dot" aria-hidden="true" />}
        </button>
      </form>
    </div>

    <div className="shell">
      <div className="category-tabs" role="group" aria-label="หมวดการแข่งขัน">
        {categories.map((item) => <button
          key={item.id} type="button"
          className={category === item.id ? 'tab-button active' : 'tab-button'}
          aria-pressed={category === item.id}
          onClick={() => update({ category: item.id === 'all' ? null : item.id })}
        >{item.label}</button>)}
      </div>
    </div>

    <section className="shell results" aria-labelledby="results-title">
      <div className="results-head">
        <div className="results-title">
          <h2 id="results-title">รายการแข่งขัน</h2>
          <span className="results-count" role="status">
            {results.length} เวที{category !== 'all' ? ` · หมวด${categoryLabel(category as never)}` : ''}{savedOnly ? ' · ที่บันทึกไว้' : ''}
          </span>
          <span className="sample-badge"><Info size={12} aria-hidden="true" />ข้อมูลตัวอย่าง</span>
        </div>
        <label className="sort-field">
          เรียงตาม
          <span className="select-wrap">
            <select value={sort} onChange={(event) => update({ sort: event.target.value })}>
              {sortOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <ChevronDown size={13} aria-hidden="true" />
          </span>
        </label>
      </div>

      {results.length > 0 ? <div className="card-grid">
        {shown.map((competition) => <CompetitionCard key={competition.slug} competition={competition} />)}
      </div> : <div className="empty-state">
        <Search size={34} aria-hidden="true" />
        <h2>{savedOnly ? 'ยังไม่มีเวทีที่บันทึกไว้' : 'ไม่พบเวทีที่ตรงกับที่ค้นหา'}</h2>
        <p>{savedOnly ? 'กดปุ่มบันทึกบนการ์ดเวทีที่สนใจ แล้วกลับมาดูที่นี่' : 'ลองเปลี่ยนคำค้น หรือเลือกหมวด “ทั้งหมด”'}</p>
        <p style={{ marginTop: 16 }}>
          <Link className="ghost-button" to="/">ดูเวทีทั้งหมด {competitions.length} รายการ</Link>
        </p>
      </div>}

      {pageCount > 1 && <nav className="pagination" aria-label="หน้าผลการค้นหา">
        <button type="button" className="page-arrow" aria-label="หน้าก่อนหน้า" disabled={page === 1}
          onClick={() => update({ page: String(page - 1) }, true)}><ChevronLeft size={16} /></button>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button
          key={number} type="button"
          className={number === page ? 'page-button active' : 'page-button'}
          aria-current={number === page ? 'page' : undefined}
          onClick={() => update({ page: String(number) }, true)}
        >{number}</button>)}
        <button type="button" className="page-arrow" aria-label="หน้าถัดไป" disabled={page === pageCount}
          onClick={() => update({ page: String(page + 1) }, true)}><ChevronRight size={16} /></button>
      </nav>}
    </section>
  </main>;
}
