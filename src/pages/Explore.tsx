import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Calendar, ChevronDown, ChevronLeft, ChevronRight, Search, Trophy } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { formatDeadline, primaryCategory, prizeLabel, sortOptions } from '../data/competitions';
import type { Competition } from '../data/competitions';
import { kinds, themeKeys, themes } from '../data/focus';
import type { Theme } from '../data/focus';
import { toggleSaved, useSavedSlugs } from '../data/saved';
import { useApi } from '../lib/useApi';
import { CoverArt } from '../components/CoverArt';
import { BookmarkSimple } from '../components/icons';
import '../journey.css';

/* หน้าสำรวจของเส้นทางใหม่ เริ่มจากคำถามว่าอยากแข่งงานไหน ไม่ใช่ว่าติดปัญหาตรงไหน
   ประเภทงานกับหมวดเป็นคนละแกนกัน จึงแยกเป็นแท็บกับช่องติ๊ก ไม่รวมเป็นรายการเดียว
   เงื่อนไขทุกข้ออยู่ใน URL ผู้ใช้จึงแชร์ผลลัพธ์หรือกดย้อนกลับแล้วได้หน้าเดิม */

function KindCard({ competition }: { competition: Competition }) {
  const { search } = useLocation();
  const saved = useSavedSlugs();
  const isSaved = saved.includes(competition.slug);
  const link = `/competitions/${competition.slug}${search}`;

  return <article className="competition-card">
    <div className="card-cover">
      <CoverArt category={primaryCategory(competition)} seed={`explore-${competition.slug}`} />
      {/* ป้ายประเภทงานเด่นกว่าป้ายหมวด เพราะ "ธุรกิจ" เป็นได้ทั้ง Hackathon และแข่งเคส */}
      {competition.kind && <span className="kind-chip">{kinds[competition.kind]}</span>}
    </div>
    <div className="card-body">
      <div className="card-meta">
        {competition.themes?.map((theme) => <span className="theme-pill" key={theme}>{themes[theme]}</span>)}
        <span className="card-org">{competition.org}</span>
      </div>
      <h3><Link to={link}>{competition.name}</Link></h3>
      <p className="card-summary">{competition.description}</p>
      <div className="card-facts">
        <span><Calendar size={15} aria-hidden="true" />ปิดรับ {formatDeadline(competition)}</span>
        <span><Trophy size={15} aria-hidden="true" />{prizeLabel(competition)}</span>
      </div>
      <div className="card-actions">
        <Link className="detail-link" to={link} aria-label={`ดูรายละเอียด ${competition.name}`}>
          ดูรายละเอียดและเมนเทอร์<ArrowRight size={14} aria-hidden="true" />
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

export function Explore() {
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState(params.get('q') ?? '');

  const kind = params.get('kind') ?? '';
  const chosen = (params.get('theme') ?? '').split(',').filter((id): id is Theme => themeKeys.includes(id as Theme));
  const sort = params.get('sort') ?? 'deadline';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  useEffect(() => { document.title = 'อยากแข่งงานไหน — ChampionWays'; }, []);
  // ช่องค้นหาต้องตามค่าใน URL ด้วย ไม่อย่างนั้นกดย้อนกลับแล้วคำค้นในช่องจะค้างของเดิม
  useEffect(() => { setDraft(params.get('q') ?? ''); }, [params]);

  const { data, error, loading } = useApi<{
    total: number; page: number; pageCount: number; items: Competition[];
  }>(`/competitions?${params}`);

  /** เปลี่ยนเงื่อนไขข้อเดียว แล้วกลับไปหน้าแรกของผลลัพธ์เสมอ ยกเว้นตอนเปลี่ยนหน้า */
  function update(key: string, value: string, keepPage = false) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (!keepPage) next.delete('page');
    setParams(next);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    update('q', draft.trim());
  }

  const items = data?.items ?? [];
  const pageCount = data?.pageCount ?? 1;
  const filtered = Boolean(kind || chosen.length || params.get('q'));

  return <main id="main" tabIndex={-1} className="journey-page">
    <section className="explore-hero">
      <div className="shell">
        <p className="eyebrow">เริ่มจากเวทีที่อยากลง</p>
        <h1>อยากแข่งงานไหน</h1>
        <p className="explore-lead">
          เลือก Hackathon หรือเวทีแข่งเคสที่สนใจ แล้วดูเมนเทอร์ที่มีเวลาว่างสำหรับงานนั้น
          นัดคุยกันในแชตของเว็บได้เลย
        </p>
      </div>
    </section>

    <div className="shell search-panel">
      <form className="search-bar" role="search" onSubmit={submitSearch}>
        <div className="search-field">
          <Search size={18} aria-hidden="true" />
          <label className="sr-only" htmlFor="explore-search">ค้นหาการแข่งขัน</label>
          <input
            id="explore-search" type="search" autoComplete="off"
            placeholder="ชื่อเวที ผู้จัด หรือคำค้น"
            value={draft} onChange={(event) => setDraft(event.target.value)}
          />
        </div>
        <button className="primary-button" type="submit">ค้นหา</button>
      </form>
    </div>

    <div className="shell">
      <div className="category-tabs" role="group" aria-label="ประเภทการแข่งขัน">
        {[['', 'ทั้งหมด'], ...Object.entries(kinds)].map(([id, label]) => <button
          key={id || 'all'} type="button"
          className={kind === id ? 'tab-button active' : 'tab-button'}
          aria-pressed={kind === id}
          onClick={() => update('kind', id)}
        >{label}</button>)}
      </div>

      <fieldset className="theme-filter">
        <legend>หมวดการแข่งขัน</legend>
        <div className="theme-options">
          {themeKeys.map((id) => <label key={id}>
            <input
              type="checkbox" checked={chosen.includes(id)}
              onChange={() => update('theme', (chosen.includes(id)
                ? chosen.filter((theme) => theme !== id)
                : [...chosen, id]).join(','))}
            />
            {themes[id]}
          </label>)}
        </div>
      </fieldset>
    </div>

    <section className="shell results" aria-labelledby="explore-results">
      <div className="results-head">
        <div className="results-title">
          <h2 id="explore-results">เวทีที่เปิดรับ</h2>
          <span className="results-count" role="status">
            {loading ? 'กำลังโหลด…' : `${data?.total ?? 0} เวที`}
          </span>
        </div>
        <label className="sort-field">
          เรียงตาม
          <span className="select-wrap">
            <select value={sort} onChange={(event) => update('sort', event.target.value)}>
              {sortOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
            <ChevronDown size={13} aria-hidden="true" />
          </span>
        </label>
      </div>

      {error && <p className="auth-message" role="alert">{error}</p>}

      {loading ? <div className="card-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => <div className="card-skeleton" key={index} />)}
      </div> : items.length > 0 ? <div className="card-grid">
        {items.map((competition) => <KindCard key={competition.slug} competition={competition} />)}
      </div> : <div className="empty-state">
        <Search size={34} aria-hidden="true" />
        <h2>ยังไม่มีเวทีที่ตรงกับเงื่อนไข</h2>
        {/* บอกตามจริงว่าหน้านี้แสดงเฉพาะงานที่จัดประเภทแล้ว ไม่เติมรายการอื่นให้ดูเต็ม */}
        <p>{filtered
          ? 'ลองเปลี่ยนประเภทงานหรือเอาบางหมวดออก'
          : 'หน้านี้แสดงเฉพาะเวทีที่ทีมงานจัดประเภทและตรวจข้อมูลแล้ว เมื่อมีเวทีใหม่จะขึ้นที่นี่'}</p>
        {filtered && <p style={{ marginTop: 16 }}>
          <button type="button" className="ghost-button" onClick={() => { setParams({}); setDraft(''); }}>
            ล้างตัวกรอง
          </button>
        </p>}
      </div>}

      {pageCount > 1 && <nav className="pagination" aria-label="หน้าผลการค้นหา">
        <button type="button" className="page-arrow" aria-label="หน้าก่อนหน้า" disabled={page === 1}
          onClick={() => update('page', String(page - 1), true)}><ChevronLeft size={16} /></button>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button
          key={number} type="button"
          className={number === page ? 'page-button active' : 'page-button'}
          aria-current={number === page ? 'page' : undefined}
          onClick={() => update('page', String(number), true)}
        >{number}</button>)}
        <button type="button" className="page-arrow" aria-label="หน้าถัดไป" disabled={page === pageCount}
          onClick={() => update('page', String(page + 1), true)}><ChevronRight size={16} /></button>
      </nav>}
    </section>
  </main>;
}
