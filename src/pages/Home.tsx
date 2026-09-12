import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Calendar, ChevronDown, ChevronLeft, ChevronRight, Info, Search, SlidersHorizontal, Timer, Trophy } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  activeFilterCount, categories, categoryLabel, competitions, daysLeft, filterCompetitions,
  findCompetition, formatDeadline, primaryCategory, prizeLabel, sortCompetitions, sortOptions,
} from '../data/competitions';
import type { Competition, Filters, SortId } from '../data/competitions';
import { clearedFilters, readFilters, toggle, writeFilters } from '../data/filters';
import { podium, trendingSlugs } from '../data/mentors';
import { toggleSaved, useSavedSlugs } from '../data/saved';
import { CoverArt } from '../components/CoverArt';
import { FilterPanel } from '../components/FilterPanel';
import { BookmarkSimple } from '../components/icons';
import wordmark from '../assets/wordmark.jpg';

const PER_PAGE = 6;

function Highlights() {
  const [paused, setPaused] = useState(false);
  const trending = trendingSlugs.map(findCompetition).filter((item): item is Competition => item !== undefined);
  const run = <div className="marquee-run">
    {trending.map((competition, index) => <div className="trend-card" key={competition.slug}>
      <span className="trend-rank" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
      <div>
        <b>{competition.name}</b>
        <small>{categoryLabel(primaryCategory(competition))} · {competition.org}</small>
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
  const left = daysLeft(competition);
  const urgent = left >= 0 && left <= 7;
  const [first, ...rest] = competition.categories;

  return <article className="competition-card">
    {competition.featured && <div className="card-featured-bar" aria-hidden="true" />}
    <div className="card-cover">
      <CoverArt category={first} seed={competition.slug} />
      {urgent && <span className="urgent-chip"><Timer size={13} aria-hidden="true" />ปิดรับอีก {left} วัน</span>}
    </div>
    <div className="card-body">
      <div className="card-meta">
        <span className="category-pill">{categoryLabel(first)}</span>
        {/* ป้าย +N ต้องบอกได้ว่าอีกกี่หมวดคือหมวดอะไร ไม่ใช่ให้ผู้อ่านเดา */}
        {rest.length > 0 && <span className="category-pill is-more" aria-label={`อีก ${rest.length} หมวด: ${rest.map(categoryLabel).join(' ')}`}>
          +{rest.length}
        </span>}
        <span className="card-org">{competition.org}</span>
      </div>
      <h3><Link to={`/competitions/${competition.slug}${search}`}>{competition.name}</Link></h3>
      <p className="card-summary">{competition.description}</p>
      <div className="card-facts">
        <span><Calendar size={15} aria-hidden="true" />ปิดรับ {formatDeadline(competition)}</span>
        <span><Trophy size={15} aria-hidden="true" />{prizeLabel(competition)}</span>
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
  const [panelOpen, setPanelOpen] = useState(false);

  const filters = readFilters(params);
  const rawSort = params.get('sort') ?? 'deadline';
  const sort = (sortOptions.some((item) => item.id === rawSort) ? rawSort : 'deadline') as SortId;
  const savedOnly = params.get('saved') === '1';
  const requestedPage = Number(params.get('page'));

  const [draft, setDraft] = useState(filters.query);
  useEffect(() => { setDraft(filters.query); }, [filters.query]);
  useEffect(() => { document.title = 'ChampionWays — สำรวจการแข่งขัน'; }, []);

  function updateParam(patch: Record<string, string | null>, keepPage = false) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key); else next.set(key, value);
    }
    if (!keepPage) next.delete('page');
    setParams(next, { preventScrollReset: true });
  }

  function applyFilters(next: Filters) {
    setParams(writeFilters(params, next), { preventScrollReset: true });
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    applyFilters({ ...filters, query: draft.trim() });
  }

  const matched = filterCompetitions(filters);
  const scoped = savedOnly ? matched.filter((item) => saved.includes(item.slug)) : matched;
  const results = sortCompetitions(scoped, sort);
  const pageCount = Math.max(1, Math.ceil(results.length / PER_PAGE));
  const page = Math.min(Math.max(1, Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1), pageCount);
  const shown = results.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const panelCount = activeFilterCount(filters);
  const chosenCategories = filters.categories.map(categoryLabel).join(' · ');

  return <main id="main" tabIndex={-1}>
    <section className="hero">
      <div className="shell hero-inner">
        <h1 className="hero-wordmark"><img src={wordmark} alt="ChampionWays" /></h1>
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
          type="button" className="filter-toggle" aria-expanded={panelOpen}
          onClick={() => setPanelOpen(true)}
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
          ตัวกรอง
          {panelCount > 0 && <span className="filter-count">{panelCount}</span>}
        </button>
      </form>
    </div>

    <div className="shell">
      <div className="category-tabs" role="group" aria-label="หมวดการแข่งขัน เลือกได้มากกว่าหนึ่งหมวด">
        {categories.map((item) => {
          const active = item.id === 'all' ? filters.categories.length === 0 : filters.categories.includes(item.id);
          return <button
            key={item.id} type="button"
            className={active ? 'tab-button active' : 'tab-button'}
            aria-pressed={active}
            onClick={() => applyFilters({
              ...filters,
              categories: item.id === 'all' ? [] : toggle(filters.categories, item.id),
            })}
          >{item.label}</button>;
        })}
      </div>
    </div>

    <section className="shell results" aria-labelledby="results-title">
      <div className="results-head">
        <div className="results-title">
          <h2 id="results-title">รายการแข่งขัน</h2>
          <span className="results-count" role="status">
            {results.length} เวที{chosenCategories ? ` · ${chosenCategories}` : ''}{panelCount > 0 ? ` · ตัวกรอง ${panelCount} รายการ` : ''}{savedOnly ? ' · ที่บันทึกไว้' : ''}
          </span>
          <span className="sample-badge"><Info size={12} aria-hidden="true" />ข้อมูลตัวอย่าง</span>
        </div>
        <label className="sort-field">
          เรียงตาม
          <span className="select-wrap">
            <select value={sort} onChange={(event) => updateParam({ sort: event.target.value })}>
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
        <h2>{savedOnly ? 'ยังไม่มีเวทีที่บันทึกไว้' : 'ไม่พบเวทีที่ตรงกับเงื่อนไข'}</h2>
        <p>{savedOnly ? 'กดปุ่มบันทึกบนการ์ดเวทีที่สนใจ แล้วกลับมาดูที่นี่' : 'ลองเปลี่ยนคำค้น เอาบางหมวดออก หรือล้างตัวกรองบางข้อ'}</p>
        <p style={{ marginTop: 16 }}>
          <Link className="ghost-button" to="/">ดูเวทีทั้งหมด {competitions.length} รายการ</Link>
        </p>
      </div>}

      {pageCount > 1 && <nav className="pagination" aria-label="หน้าผลการค้นหา">
        <button type="button" className="page-arrow" aria-label="หน้าก่อนหน้า" disabled={page === 1}
          onClick={() => updateParam({ page: String(page - 1) }, true)}><ChevronLeft size={16} /></button>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button
          key={number} type="button"
          className={number === page ? 'page-button active' : 'page-button'}
          aria-current={number === page ? 'page' : undefined}
          onClick={() => updateParam({ page: String(number) }, true)}
        >{number}</button>)}
        <button type="button" className="page-arrow" aria-label="หน้าถัดไป" disabled={page === pageCount}
          onClick={() => updateParam({ page: String(page + 1) }, true)}><ChevronRight size={16} /></button>
      </nav>}
    </section>

    <FilterPanel
      open={panelOpen} filters={filters} count={results.length}
      onChange={applyFilters}
      onClear={() => applyFilters(clearedFilters(filters))}
      onClose={() => setPanelOpen(false)}
    />
  </main>;
}
