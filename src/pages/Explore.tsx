import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, ChevronDown, GraduationCap, Search, Users, X } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { categories, categoryInfo, competitions, filterCompetitions, levelLabels } from '../data/competitions';
import type { Competition, Level } from '../data/competitions';
import { Poster } from '../components/Poster';
import { SampleNote } from '../components/Layout';

function CompetitionRow({ competition, index }: { competition: Competition; index: number }) {
  const { search } = useLocation();
  const link = `/competitions/${competition.slug}${search}`;
  return <li className="competition-row">
    <span className="row-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
    <div className="row-cover"><Poster competition={competition} /></div>
    <div className="row-heading">
      <span className={`category-label category-label--${competition.category}`}><span aria-hidden="true" />{categoryInfo(competition.category).label}</span>
      <h2><Link to={link}>{competition.name}</Link></h2>
    </div>
    <p className="row-description">{competition.description}</p>
    <div className="row-meta">
      <span><GraduationCap size={16} aria-hidden="true" />{competition.levels.map((level) => levelLabels[level]).join(' / ')}</span>
      <span><Users size={15} aria-hidden="true" />{competition.team}</span>
    </div>
    <Link className="detail-link" to={link} aria-label={`ดูรายละเอียด ${competition.name}`}>ดูรายละเอียด<ArrowUpRight size={19} aria-hidden="true" /></Link>
  </li>;
}

export function Explore() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const rawCategory = params.get('category') ?? 'all';
  const category = categories.some((item) => item.id === rawCategory) ? rawCategory : 'all';
  const rawLevel = params.get('level') ?? 'all';
  const level = Object.hasOwn(levelLabels, rawLevel) ? rawLevel : 'all';
  const [draft, setDraft] = useState(query);
  useEffect(() => { setDraft(query); }, [query]);
  useEffect(() => { document.title = 'สำรวจการแข่งขัน — ChampionWays'; }, []);
  const results = filterCompetitions(query, category, level);
  const hasFilters = Boolean(query || category !== 'all' || level !== 'all');

  function update(key: string, value: string) {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (category !== 'all') next.set('category', category);
    if (level !== 'all') next.set('level', level);
    if (value && value !== 'all') next.set(key, value); else next.delete(key);
    setParams(next, { preventScrollReset: true });
  }
  function search(event: FormEvent) { event.preventDefault(); update('q', draft.trim()); }
  function clear() { setDraft(''); setParams({}, { preventScrollReset: true }); }

  return <main id="main" tabIndex={-1} className="container explore-page">
    <section className="explore-intro" aria-labelledby="explore-title">
      <div className="eyebrow"><span className="eyebrow-line" />FIND YOUR NEXT CHALLENGE</div>
      <div className="intro-title-row"><h1 id="explore-title">สำรวจการแข่งขัน<span className="title-period">.</span></h1><span className="intro-index" aria-hidden="true">EXPLORE / 01</span></div>
      <p className="intro-description">ค้นหาเวทีที่ตรงกับความสนใจ และรู้ว่าต้องเตรียมอะไร</p>
    </section>

    <section className="search-section" aria-label="ค้นหาและกรองการแข่งขัน">
      <form className="search-form" role="search" onSubmit={search}>
        <Search size={22} aria-hidden="true" />
        <label htmlFor="competition-search" className="sr-only">ค้นหาการแข่งขัน</label>
        <input id="competition-search" type="search" autoComplete="off" placeholder="ชื่อการแข่งขัน เรื่องที่สนใจ หรือคำสำคัญ" value={draft} onChange={(event) => setDraft(event.target.value)} />
        {draft && <button type="button" className="search-clear icon-button" aria-label="ล้างคำค้น" onClick={() => { setDraft(''); update('q', ''); document.getElementById('competition-search')?.focus(); }}><X size={18} /></button>}
        <button className="primary-button search-submit" type="submit">ค้นหา<ArrowRight size={18} aria-hidden="true" /></button>
      </form>
      <div className="filter-bar">
        <div className="category-filters" role="group" aria-label="หมวดการแข่งขัน">
          {categories.map((item) => <button key={item.id} type="button" aria-pressed={category === item.id} className={category === item.id ? 'category-button active' : 'category-button'} onClick={() => update('category', item.id)}>{item.label}{item.id === 'all' && <span className="category-count">{competitions.length}</span>}</button>)}
        </div>
        <div className="level-filter"><label htmlFor="level-select">ระดับผู้สมัคร</label><div className="select-wrap"><select id="level-select" value={level} onChange={(event) => update('level', event.target.value)}><option value="all">ทุกระดับ</option>{Object.entries(levelLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></div></div>
      </div>
    </section>

    <section aria-label="ผลการค้นหาการแข่งขัน" className="results-section">
      <div className="results-bar">
        <p role="status" aria-live="polite"><strong>{hasFilters ? 'พบ' : 'เวทีทั้งหมด'} {results.length}</strong> รายการ{query && <span className="query-label"> สำหรับ “{query}”</span>}</p>
        <SampleNote />
      </div>
      {hasFilters && <div className="active-filters"><span>กำลังแสดง{category !== 'all' ? `หมวด${categories.find((item) => item.id === category)?.label}` : 'ทุกหมวด'} · {level !== 'all' ? levelLabels[level as Level] : 'ทุกระดับ'}</span><button className="text-button" onClick={clear}><X size={14} aria-hidden="true" />ล้างตัวกรองทั้งหมด</button></div>}
      {results.length ? <ol className="competition-list">{results.map((competition, index) => <CompetitionRow key={competition.id} competition={competition} index={index} />)}</ol> : <div className="empty-state"><div className="empty-icon"><Search size={30} aria-hidden="true" /></div><p className="eyebrow">A DIFFERENT WAY TO SEARCH</p><h2>ยังไม่เจอเวทีที่คุณค้นหา</h2><p>ลองใช้คำสั้น ๆ เช่น “ออกแบบ” หรือ “ธุรกิจ”<br />หรือเลือกหมวดและระดับผู้สมัครให้กว้างขึ้น</p><button className="primary-button" onClick={clear}>ล้างตัวกรองและดูทุกเวที<ArrowRight size={18} aria-hidden="true" /></button></div>}
      {results.length > 0 && <div className="list-end"><span />ครบทั้ง {results.length} เวทีแล้ว ลองเปิดดูเวทีที่สนใจ<span /></div>}
    </section>
  </main>;
}
