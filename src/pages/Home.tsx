import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Calendar, ChevronDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal, Timer, Trophy } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { activeFilterCount, daysLeft, formatDeadline, prizeLabel, sortOptions } from '../data/competitions';
import type { Competition, Filters, SortId } from '../data/competitions';
import { clearedFilters, readFilters, writeFilters } from '../data/filters';
import { toggleSaved, useSavedSlugs } from '../data/saved';
import { useApi } from '../lib/useApi';
import { CoverArt } from '../components/CoverArt';
import { Avatar } from '../components/mentors';
import { FilterPanel } from '../components/FilterPanel';
import { BookmarkSimple } from '../components/icons';
import wordmark from '../assets/wordmark-lg.webp';

import { CompetitionTypeFilter } from '../components/CompetitionTypeFilter';
import { useI18n } from '../i18n';
import '../journey.css';

const PER_PAGE = 6;

type NewMentor = { id: string; name: string; initial: string; specialty: string };

/* แถบ "Mentor หน้าใหม่" แทนการแข่งขันล่าสุด (ผู้ใช้ขอ 5 ต.ค. 2569) เรียงจากคนที่ทีมงานอนุมัติล่าสุด
   เลื่อนเองด้วยปุ่มลูกศรหรือแถบข้างล่าง ไม่เลื่อนอัตโนมัติ จึงไม่ต้องมีปุ่มหยุด */
function NewMentors({ onReady }: { onReady: (ready: boolean) => void }) {
  const { t } = useI18n();
  const s = t.home;
  const { data, loading } = useApi<{ items: NewMentor[] }>('/rising-star/newest');
  useEffect(() => { onReady(!loading); }, [loading, onReady]);
  const scroller = useRef<HTMLDivElement>(null);
  const items = data?.items ?? [];
  if (!items.length) return null;

  const step = (direction: 1 | -1) => {
    const box = scroller.current;
    const card = box?.querySelector<HTMLElement>('.trend-card');
    if (!box || !card) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.scrollBy({ left: direction * (card.offsetWidth + 18), behavior: reduce ? 'auto' : 'smooth' });
  };

  return <section className="shell highlights" aria-labelledby="new-mentors-title">
    <div className="section-head">
      <div>
        <h2 id="new-mentors-title">{s.newMentorsTitle}</h2>
        <p>{s.newMentorsLead}</p>
      </div>
      <div className="slider-controls">
        <button type="button" className="slider-arrow" aria-label={s.previousMentors} onClick={() => step(-1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button type="button" className="slider-arrow" aria-label={s.nextMentors} onClick={() => step(1)}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <Link className="slider-all" to="/mentors">{s.allMentors}<ArrowRight size={14} aria-hidden="true" /></Link>
      </div>
    </div>
    {/* ต้องรับ focus ได้เพื่อให้เลื่อนด้วยลูกศรบนคีย์บอร์ดได้เหมือนกับเมาส์ */}
    <div className="trend-scroller" ref={scroller} tabIndex={0} role="group" aria-label={s.newMentorsScroll}>
      {items.map((mentor) => <Link className="trend-card mentor-slide" key={mentor.id} to={`/mentors/${mentor.id}`}>
        <Avatar initial={mentor.initial} />
        <div>
          <b>{mentor.name}</b>
          <small>{mentor.specialty}</small>
        </div>
      </Link>)}
    </div>
  </section>;
}

function CompetitionCard({ competition }: { competition: Competition }) {
  const { t, lang } = useI18n();
  const s = t.home;
  const { search } = useLocation();
  const saved = useSavedSlugs();
  const isSaved = saved.includes(competition.slug);
  const left = daysLeft(competition);
  const urgent = left >= 0 && left <= 7;
  const [first] = competition.categories;

  return <article className="competition-card">
    {competition.featured && <div className="card-featured-bar" aria-hidden="true" />}
    <div className="card-cover">
      <CoverArt category={first} seed={competition.slug} />
      {competition.kind && <span className="kind-chip">{t.taxonomy.kinds[competition.kind]}</span>}
      {urgent && <span className="urgent-chip"><Timer size={13} aria-hidden="true" />{t.competition.closesInDays(left)}</span>}
    </div>
    <div className="card-body">
      <div className="card-meta">
        {competition.themes?.map(theme => <span className="category-pill" key={theme}>{t.taxonomy.themes[theme]}</span>)}
        <span className="card-org">{competition.org}</span>
      </div>
      <h3><Link to={`/competitions/${competition.slug}${search}`}>{competition.name}</Link></h3>
      <p className="card-summary">{competition.description}</p>
      <div className="card-facts">
        <span><Calendar size={15} aria-hidden="true" />{t.competition.closes(formatDeadline(competition, lang))}</span>
        <span><Trophy size={15} aria-hidden="true" />{prizeLabel(competition, t, lang)}</span>
      </div>
      <div className="card-actions">
        <Link className="detail-link" to={`/competitions/${competition.slug}${search}`} aria-label={s.viewDetailsOf(competition.name)}>
          {s.viewDetails}<ArrowRight size={14} aria-hidden="true" />
        </Link>
        <button
          type="button"
          className={isSaved ? 'save-button is-saved' : 'save-button'}
          aria-pressed={isSaved}
          onClick={() => toggleSaved(competition.slug)}
        >
          <BookmarkSimple size={15} filled={isSaved} />{isSaved ? s.saved : s.save}
        </button>
      </div>
    </div>
  </article>;
}

export function Home() {
  const { t } = useI18n();
  const s = t.home;
  const [params, setParams] = useSearchParams();
  const saved = useSavedSlugs();
  const [panelOpen, setPanelOpen] = useState(false);
  const [highlightsReady, setHighlightsReady] = useState(false);

  const filters = readFilters(params);
  const rawSort = params.get('sort') ?? 'deadline';
  const sort = (sortOptions.some((item) => item.id === rawSort) ? rawSort : 'deadline') as SortId;
  const savedOnly = params.get('saved') === '1';
  const requestedPage = Number(params.get('page'));

  const [draft, setDraft] = useState(filters.query);
  useEffect(() => { setDraft(filters.query); }, [filters.query]);
  useEffect(() => { document.title = `ChampionWays — ${s.pageTitle}`; }, [s.pageTitle]);

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

  /* การกรองและแบ่งหน้าทำที่เซิร์ฟเวอร์ หน้าเว็บส่ง query string ชุดเดียวกับที่อยู่บน URL
     ยกเว้นรายการที่บันทึกไว้ ซึ่งเก็บอยู่ในเบราว์เซอร์เท่านั้น จึงส่งเป็นรายชื่อ slug ไป */
  const apiParams = new URLSearchParams(params);
  apiParams.delete('saved');
  apiParams.set('perPage', String(PER_PAGE));
  if (savedOnly) apiParams.set('slugs', saved.join(','));
  const emptySaved = savedOnly && saved.length === 0;
  const { data, error, loading } = useApi<{
    total: number; page: number; pageCount: number; items: Competition[];
  }>(emptySaved ? null : `/competitions?${apiParams}`);

  // Router restoration can be clamped while the API-driven sections are still
  // placeholders. Restore the departure position once their final height is known.
  useEffect(() => {
    if (loading || !highlightsReady) return;
    const key = `competition-scroll:${params.toString()}`;
    const savedPosition = sessionStorage.getItem(key);
    if (savedPosition === null) return;
    let cancelled = false;
    void document.fonts.ready.then(() => requestAnimationFrame(() => {
      if (cancelled) return;
      window.scrollTo(0, Number(savedPosition));
      sessionStorage.removeItem(key);
    }));
    return () => { cancelled = true; };
  }, [loading, highlightsReady, params]);

  const results = data?.items ?? [];
  const total = emptySaved ? 0 : data?.total ?? 0;
  const pageCount = emptySaved ? 1 : data?.pageCount ?? 1;
  const page = data?.page ?? (Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1);
  const shown = results;
  const panelCount = activeFilterCount(filters);
  const chosenCategories = filters.categories.map((id) => t.taxonomy.categories[id]).join(' · ');
  const summary = [
    loading ? s.loading : s.total(total),
    chosenCategories,
    panelCount > 0 ? s.filterCount(panelCount) : '',
    savedOnly ? s.savedOnly : '',
  ].filter(Boolean).join(' · ');

  return <main id="main" tabIndex={-1} onClickCapture={event => {
    const link = (event.target as HTMLElement).closest('a');
    if (link && new URL(link.href).pathname.startsWith('/competitions/')) {
      sessionStorage.setItem(`competition-scroll:${params.toString()}`, String(window.scrollY));
    }
  }}>
    <section className="hero">
      <div className="shell hero-inner">
        <h1 className="hero-wordmark"><img src={wordmark} alt="ChampionWays" width={1480} height={311} /></h1>
        <p className="hero-tagline">{s.tagline}</p>
        <p className="hero-lead">{s.lead}</p>
      </div>
    </section>

    <NewMentors onReady={setHighlightsReady} />

    <div className="shell search-panel">
      <form className="search-bar" role="search" onSubmit={submitSearch}>
        <div className="search-field">
          <Search size={18} aria-hidden="true" />
          <label className="sr-only" htmlFor="competition-search">{s.searchLabel}</label>
          <input
            id="competition-search" type="search" autoComplete="off"
            placeholder={s.searchPlaceholder}
            value={draft} onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <button className="primary-button" type="submit">{s.searchSubmit}</button>
        <button
          type="button" className="filter-toggle" aria-expanded={panelOpen}
          onClick={() => setPanelOpen(true)}
        >
          <SlidersHorizontal size={17} aria-hidden="true" />
          {s.filters}
          {panelCount > 0 && <span className="filter-count">{panelCount}</span>}
        </button>
      </form>
    </div>

    <div className="shell">
      <CompetitionTypeFilter />
    </div>

    <section className="shell results" aria-labelledby="results-title">
      <div className="results-head">
        <div className="results-title">
          <h2 id="results-title">{s.resultsTitle}</h2>
          <span className="results-count" role="status">
            {summary}
          </span>
        </div>
        <label className="sort-field">
          {s.sortBy}
          <span className="select-wrap">
            <select value={sort} onChange={(event) => updateParam({ sort: event.target.value })}>
              {sortOptions.map((option) => <option key={option.id} value={option.id}>{t.taxonomy.sort[option.id]}</option>)}
            </select>
            <ChevronDown size={13} aria-hidden="true" />
          </span>
        </label>
      </div>

      {error && <p className="auth-message" role="alert">{error}</p>}

      {loading ? <div className="card-grid" aria-hidden="true">
        {Array.from({ length: PER_PAGE }, (_, index) => <div className="card-skeleton" key={index} />)}
      </div> : results.length > 0 ? <div className="card-grid">
        {shown.map((competition) => <CompetitionCard key={competition.slug} competition={competition} />)}
      </div> : <div className="empty-state">
        <Search size={34} aria-hidden="true" />
        <h2>{savedOnly ? s.emptySavedTitle : s.emptyNoneTitle}</h2>
        <p>{savedOnly ? s.emptySavedText : s.emptyNoneText}</p>
        <p style={{ marginTop: 16 }}>
          <Link className="ghost-button" to="/">{s.showAll}</Link>
        </p>
      </div>}

      {pageCount > 1 && <nav className="pagination" aria-label={s.pages}>
        <button type="button" className="page-arrow" aria-label={s.previousPage} disabled={page === 1}
          onClick={() => updateParam({ page: String(page - 1) }, true)}><ChevronLeft size={16} /></button>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button
          key={number} type="button"
          className={number === page ? 'page-button active' : 'page-button'}
          aria-current={number === page ? 'page' : undefined}
          onClick={() => updateParam({ page: String(number) }, true)}
        >{number}</button>)}
        <button type="button" className="page-arrow" aria-label={s.nextPage} disabled={page === pageCount}
          onClick={() => updateParam({ page: String(page + 1) }, true)}><ChevronRight size={16} /></button>
      </nav>}
    </section>

    <FilterPanel
      open={panelOpen} filters={filters} count={total}
      onChange={applyFilters}
      onClear={() => applyFilters(clearedFilters(filters))}
      onClose={() => setPanelOpen(false)}
    />
  </main>;
}
