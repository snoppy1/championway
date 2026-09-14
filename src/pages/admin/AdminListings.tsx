import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CircleAlert, Plus } from 'lucide-react';
import {
  categories, categoryLabel, formatDate, levelLabels, regionLabels, rewardLabels, typeLabels,
} from '../../data/competitions';
import type { CategoryId, Level, OpportunityType, Region, Reward } from '../../data/competitions';
import { kindKeys, kinds, themeKeys, themes } from '../../data/focus';
import type { Kind, Theme } from '../../data/focus';
import { ApiError, api, post } from '../../lib/api';
import { useApi } from '../../lib/useApi';

/* ช่วงเริ่มต้นยังไม่มีผู้จัดมาลงงานเอง ทีมงานจึงคัดจากประกาศจริงมากรอกที่นี่
   ทุกเวทีที่สร้างทางนี้เป็น editorial และบังคับให้มีลิงก์ประกาศต้นทางเสมอ */

const STALE_AFTER_DAYS = 30;
const typeIds = Object.keys(typeLabels) as OpportunityType[];
const levelIds = Object.keys(levelLabels) as Level[];
const regionIds = Object.keys(regionLabels) as Region[];
const rewardIds = Object.keys(rewardLabels) as Reward[];
const categoryIds = categories.filter((item) => item.id !== 'all').map((item) => item.id) as CategoryId[];
const baht = new Intl.NumberFormat('th-TH');

type Listing = {
  kind: Kind | null; themes: Theme[];
  id: string; slug: string; name: string; description: string; type: OpportunityType; org: string;
  categories: CategoryId[]; levels: Level[]; rewards: Reward[];
  teamMin: number; teamMax: number;
  opensAt: string | null; closesAt: string; eventDate: string | null;
  region: Region; venue: string | null;
  prizeValue: number; prizeNote: string | null; fee: number | null;
  featured: boolean; keywords: string[];
  sourceUrl: string; registerUrl: string | null; source: string; lastVerifiedAt: string;
  overview: string | null; audience: string | null;
  format: string[]; deliverables: string[]; preparation: string[];
};

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(`${iso}T12:00:00`).getTime()) / 86400000);

export function AdminListingList() {
  const { data, error, loading, reload } = useApi<{ items: Listing[] }>('/admin/listings');
  const [busy, setBusy] = useState('');
  const rows = data?.items ?? [];

  async function verify(id: string) {
    setBusy(id);
    try { await post(`/admin/listings/${id}/verify`, {}); reload(); } finally { setBusy(''); }
  }

  return <>
    <header className="admin-page-head">
      <div className="admin-title-row">
        <h1>เวทีบนหน้าเว็บ</h1>
        <Link className="primary-button" to="/admin/listings/new"><Plus size={16} aria-hidden="true" />เพิ่มเวที</Link>
      </div>
      <p className="admin-muted">
        ช่วงนี้ยังไม่มีผู้จัดมาลงเอง ทีมงานคัดจากประกาศจริงมากรอกเอง ทุกเวทีต้องมีลิงก์ประกาศต้นทาง
      </p>
    </header>

    {error && <p className="admin-message" role="alert">{error}</p>}
    <p className="admin-muted queue-count" role="status">{loading ? 'กำลังโหลด…' : `${rows.length} เวที`}</p>

    {!loading && (rows.length ? <ul className="queue-list">
      {rows.map((item) => {
        const stale = item.source === 'editorial' && daysSince(item.lastVerifiedAt) > STALE_AFTER_DAYS;
        return <li className="queue-row" key={item.id}>
          <div className="queue-main">
            <span className={`status-pill is-${item.source === 'editorial' ? 'published' : 'info'}`}>
              {item.source === 'editorial' ? 'ทีมงานคัดมา' : 'ผู้จัดส่งเอง'}
            </span>
            <h2><Link to={`/admin/listings/${item.id}`}>{item.name}</Link></h2>
            <p className="admin-muted">
              {item.kind ? kinds[item.kind] : <b className="is-overdue">ยังไม่จัดประเภท</b>} · {item.org} · {item.categories.map(categoryLabel).join(' · ')}
            </p>
          </div>
          <dl className="queue-facts">
            <div><dt>ปิดรับ</dt><dd>{formatDate(item.closesAt)}</dd></div>
            <div>
              <dt>ตรวจล่าสุด</dt>
              <dd className={stale ? 'is-overdue' : undefined}>
                {formatDate(item.lastVerifiedAt)}{stale && <> · เกิน {STALE_AFTER_DAYS} วัน</>}
              </dd>
            </div>
            <div>
              <dt>ยืนยันว่ายังถูกต้อง</dt>
              <dd>
                <button type="button" className="ghost-button" disabled={busy === item.id} onClick={() => verify(item.id)}>
                  {busy === item.id ? 'กำลังบันทึก…' : 'ตรวจแล้ววันนี้'}
                </button>
              </dd>
            </div>
          </dl>
        </li>;
      })}
    </ul> : <p className="admin-empty">ยังไม่มีเวทีในระบบ กด “เพิ่มเวที” เพื่อเริ่ม</p>)}
  </>;
}

type Draft = {
  kind: Kind | ''; themes: Theme[];
  name: string; description: string; type: OpportunityType; org: string;
  categories: CategoryId[]; levels: Level[]; rewards: Reward[];
  teamMin: string; teamMax: string;
  opensAt: string; closesAt: string; eventDate: string;
  region: Region; venue: string;
  prizeValue: string; prizeNote: string; fee: string;
  featured: boolean; keywords: string;
  sourceUrl: string; registerUrl: string;
  overview: string; audience: string;
  format: string; deliverables: string; preparation: string;
};

const blank: Draft = {
  kind: '', themes: [],
  name: '', description: '', type: 'contest', org: '',
  categories: [], levels: [], rewards: [],
  teamMin: '1', teamMax: '4',
  opensAt: '', closesAt: '', eventDate: '',
  region: 'online', venue: '',
  prizeValue: '', prizeNote: '', fee: '',
  featured: false, keywords: '',
  sourceUrl: '', registerUrl: '',
  overview: '', audience: '',
  format: '', deliverables: '', preparation: '',
};

/** บรรทัดละข้อ อ่านง่ายกว่าให้กรอกเป็น JSON และตรงกับที่แสดงบนหน้ารายละเอียด */
const toLines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean);
const fromLines = (value: string[]) => value.join('\n');

export function AdminListingForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = id !== 'new';
  const { data, error: loadError, loading } = useApi<{ listing: Listing }>(editing ? `/admin/listings/${id}` : null);

  const [draft, setDraft] = useState<Draft>(blank);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const listing = data?.listing;
    if (!listing) return;
    setDraft({
      kind: listing.kind ?? '', themes: listing.themes ?? [],
      name: listing.name, description: listing.description, type: listing.type, org: listing.org,
      categories: listing.categories, levels: listing.levels, rewards: listing.rewards,
      teamMin: String(listing.teamMin), teamMax: String(listing.teamMax),
      opensAt: listing.opensAt ?? '', closesAt: listing.closesAt, eventDate: listing.eventDate ?? '',
      region: listing.region, venue: listing.venue ?? '',
      prizeValue: String(listing.prizeValue), prizeNote: listing.prizeNote ?? '',
      fee: listing.fee === null ? '' : String(listing.fee),
      featured: listing.featured, keywords: listing.keywords.join(', '),
      sourceUrl: listing.sourceUrl, registerUrl: listing.registerUrl ?? '',
      overview: listing.overview ?? '', audience: listing.audience ?? '',
      format: fromLines(listing.format), deliverables: fromLines(listing.deliverables),
      preparation: fromLines(listing.preparation),
    });
  }, [data]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  function toggle<T>(list: T[], value: T, key: 'categories' | 'levels' | 'rewards' | 'themes', max?: number) {
    if (list.includes(value)) set(key, list.filter((item) => item !== value) as never);
    else if (!max || list.length < max) set(key, [...list, value] as never);
    else setMessage(`เลือกได้สูงสุด ${max} หมวด`);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setSaving(true);
    try {
      const body = {
        kind: draft.kind || undefined, themes: draft.themes,
        name: draft.name, description: draft.description, type: draft.type, org: draft.org,
        categories: draft.categories, levels: draft.levels, rewards: draft.rewards,
        teamMin: Number(draft.teamMin), teamMax: Number(draft.teamMax),
        opensAt: draft.opensAt || null, closesAt: draft.closesAt, eventDate: draft.eventDate || null,
        region: draft.region, venue: draft.venue || null,
        prizeValue: Number(draft.prizeValue || 0), prizeNote: draft.prizeNote || null,
        fee: draft.fee ? Number(draft.fee) : null,
        featured: draft.featured,
        keywords: draft.keywords.split(',').map((word) => word.trim()).filter(Boolean),
        sourceUrl: draft.sourceUrl, registerUrl: draft.registerUrl || null,
        overview: draft.overview || null, audience: draft.audience || null,
        format: toLines(draft.format), deliverables: toLines(draft.deliverables),
        preparation: toLines(draft.preparation),
      };
      if (editing) await api(`/admin/listings/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      else await post('/admin/listings', body);
      navigate('/admin/listings');
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  if (editing && loading) return <p className="admin-muted">กำลังโหลด…</p>;
  if (editing && loadError) return <>
    <h1>เปิดเวทีนี้ไม่ได้</h1>
    <p className="admin-message" role="alert">{loadError}</p>
    <p><Link className="ghost-button" to="/admin/listings"><ArrowLeft size={16} aria-hidden="true" />กลับไปรายการ</Link></p>
  </>;

  const prizeText = Number(draft.prizeValue || 0) > 0
    ? `รางวัลรวม ${baht.format(Number(draft.prizeValue))} บาท`
    : draft.prizeNote || 'ไม่มีเงินรางวัล';

  return <>
    <p className="admin-back"><Link to="/admin/listings"><ArrowLeft size={16} aria-hidden="true" />กลับไปรายการเวที</Link></p>
    <header className="admin-page-head">
      <h1>{editing ? 'แก้ไขเวที' : 'เพิ่มเวทีใหม่'}</h1>
      <p className="admin-muted">
        กรอกข้อเท็จจริงจากประกาศต้นทาง แต่<b>เขียนคำบรรยายใหม่เอง</b> ห้ามคัดลอกข้อความจากเว็บอื่น
      </p>
    </header>

    <form className="listing-form" onSubmit={save} noValidate>
      <section className="admin-block">
        <h2>ประเภทงานและหมวดจับคู่เมนเทอร์</h2>
        <p className="admin-muted">
          หน้า “สำรวจการแข่งขัน” แสดงเฉพาะเวทีที่กรอกสองช่องนี้แล้ว
          และใช้หมวดที่เลือกไว้จับคู่กับความถนัดของเมนเทอร์
        </p>
        <dl className="admin-fields">
          <div className="admin-field"><dt><label htmlFor="listing-kind">ประเภทงาน *</label></dt>
            <dd><select id="listing-kind" required value={draft.kind} onChange={(e) => set('kind', e.target.value as Kind | '')}>
              <option value="">เลือกประเภทงาน</option>
              {kindKeys.map((value) => <option key={value} value={value}>{kinds[value]}</option>)}
            </select></dd></div>
          <div className="admin-field"><dt>หมวดจับคู่เมนเทอร์ *</dt><dd>
            <div className="pick-grid">
              {themeKeys.map((value) => <label className="pick" key={value}>
                <input type="checkbox" checked={draft.themes.includes(value)}
                  onChange={() => toggle(draft.themes, value, 'themes')} />
                <span>{themes[value]}</span>
              </label>)}
            </div>
            <span className="admin-muted">เลือกได้มากกว่าหนึ่งหมวด คนละชุดกับหมวดหมู่ด้านล่าง</span>
          </dd></div>
        </dl>
      </section>

      <section className="admin-block">
        <h2>ข้อมูลหลัก</h2>
        <dl className="admin-fields">
          <div className="admin-field"><dt><label htmlFor="listing-name">ชื่อเวที *</label></dt>
            <dd><input id="listing-name" required value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={200} /></dd></div>
          <div className="admin-field"><dt><label htmlFor="listing-org">ผู้จัด *</label></dt>
            <dd><input id="listing-org" required value={draft.org} onChange={(e) => set('org', e.target.value)} maxLength={200} /></dd></div>
          <div className="admin-field"><dt><label htmlFor="listing-description">คำบรรยายสั้น *</label></dt>
            <dd><textarea id="listing-description" required rows={3} maxLength={400} value={draft.description} onChange={(e) => set('description', e.target.value)} />
              <span className="admin-muted">{draft.description.length} / 400 · ขึ้นบนการ์ดในหน้ารายการ</span></dd></div>
          <div className="admin-field"><dt><label htmlFor="listing-type">ประเภท</label></dt>
            <dd><select id="listing-type" value={draft.type} onChange={(e) => set('type', e.target.value as OpportunityType)}>
              {typeIds.map((value) => <option key={value} value={value}>{typeLabels[value]}</option>)}
            </select></dd></div>
          <div className="admin-field"><dt>หมวดหมู่การแข่งขัน *</dt><dd>
            <div className="pick-grid">
              {categoryIds.map((value) => <label className="pick" key={value}>
                <input type="checkbox" checked={draft.categories.includes(value)}
                  onChange={() => toggle(draft.categories, value, 'categories', 3)} />
                <span>{categoryLabel(value)}</span>
              </label>)}
            </div>
            <span className="admin-muted">เลือกได้สูงสุด 3 หมวด หมวดแรกคือหมวดหลัก</span>
          </dd></div>
          <div className="admin-field"><dt>ระดับผู้เข้าแข่ง *</dt><dd>
            <div className="pick-grid">
              {levelIds.map((value) => <label className="pick" key={value}>
                <input type="checkbox" checked={draft.levels.includes(value)} onChange={() => toggle(draft.levels, value, 'levels')} />
                <span>{levelLabels[value]}</span>
              </label>)}
            </div>
          </dd></div>
          <div className="admin-field"><dt>ขนาดทีม</dt><dd className="pair">
            <input type="number" min={1} aria-label="ขนาดทีมต่ำสุด" value={draft.teamMin} onChange={(e) => set('teamMin', e.target.value)} />
            <input type="number" min={1} aria-label="ขนาดทีมสูงสุด" value={draft.teamMax} onChange={(e) => set('teamMax', e.target.value)} />
          </dd></div>
        </dl>
      </section>

      <section className="admin-block">
        <h2>วันเวลา สถานที่ และรางวัล</h2>
        <dl className="admin-fields">
          <div className="admin-field"><dt><label htmlFor="listing-opens">เปิดรับ</label></dt>
            <dd><input id="listing-opens" type="date" value={draft.opensAt} onChange={(e) => set('opensAt', e.target.value)} /></dd></div>
          <div className="admin-field"><dt><label htmlFor="listing-closes">ปิดรับ *</label></dt>
            <dd><input id="listing-closes" type="date" required value={draft.closesAt} onChange={(e) => set('closesAt', e.target.value)} /></dd></div>
          <div className="admin-field"><dt><label htmlFor="listing-event">วันจัดงาน</label></dt>
            <dd><input id="listing-event" type="date" value={draft.eventDate} onChange={(e) => set('eventDate', e.target.value)} /></dd></div>
          <div className="admin-field"><dt><label htmlFor="listing-region">รูปแบบ</label></dt>
            <dd><select id="listing-region" value={draft.region} onChange={(e) => set('region', e.target.value as Region)}>
              {regionIds.map((value) => <option key={value} value={value}>{regionLabels[value]}</option>)}
            </select></dd></div>
          {draft.region !== 'online' && <div className="admin-field"><dt><label htmlFor="listing-venue">สถานที่</label></dt>
            <dd><input id="listing-venue" value={draft.venue} onChange={(e) => set('venue', e.target.value)} maxLength={200} /></dd></div>}
          <div className="admin-field"><dt><label htmlFor="listing-prize">เงินรางวัล (บาท)</label></dt>
            <dd><input id="listing-prize" type="number" min={0} value={draft.prizeValue} onChange={(e) => set('prizeValue', e.target.value)} />
              <span className="admin-muted">จะแสดงเป็น “{prizeText}”</span></dd></div>
          <div className="admin-field"><dt><label htmlFor="listing-prize-note">รางวัลที่ไม่ใช่เงิน</label></dt>
            <dd><input id="listing-prize-note" value={draft.prizeNote} onChange={(e) => set('prizeNote', e.target.value)} maxLength={200} />
              <span className="admin-muted">บังคับกรอกเมื่อไม่มีเงินรางวัล</span></dd></div>
          <div className="admin-field"><dt>รางวัลอื่น</dt><dd>
            <div className="pick-grid">
              {rewardIds.map((value) => <label className="pick" key={value}>
                <input type="checkbox" checked={draft.rewards.includes(value)} onChange={() => toggle(draft.rewards, value, 'rewards')} />
                <span>{rewardLabels[value]}</span>
              </label>)}
            </div>
          </dd></div>
          <div className="admin-field"><dt><label htmlFor="listing-fee">ค่าสมัคร (บาท)</label></dt>
            <dd><input id="listing-fee" type="number" min={0} value={draft.fee} onChange={(e) => set('fee', e.target.value)} />
              <span className="admin-muted">เว้นว่าง = สมัครฟรี</span></dd></div>
        </dl>
      </section>

      <section className="admin-block">
        <h2>ที่มาและการค้นหา</h2>
        <dl className="admin-fields">
          <div className="admin-field"><dt><label htmlFor="listing-source">ลิงก์ประกาศต้นทาง *</label></dt>
            <dd><input id="listing-source" type="url" required placeholder="https://" value={draft.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} />
              <span className="admin-muted">บังคับทุกเวที ผู้ใช้ต้องตรวจสอบเองได้</span></dd></div>
          <div className="admin-field"><dt><label htmlFor="listing-register">ลิงก์สมัคร</label></dt>
            <dd><input id="listing-register" type="url" placeholder="https://" value={draft.registerUrl} onChange={(e) => set('registerUrl', e.target.value)} /></dd></div>
          <div className="admin-field"><dt><label htmlFor="listing-keywords">คำค้นเพิ่มเติม</label></dt>
            <dd><input id="listing-keywords" value={draft.keywords} onChange={(e) => set('keywords', e.target.value)} placeholder="คั่นด้วยจุลภาค" /></dd></div>
          <div className="admin-field"><dt>เน้นบนหน้าแรก</dt><dd>
            <label className="pick">
              <input type="checkbox" checked={draft.featured} onChange={() => set('featured', !draft.featured)} />
              <span>ติดแถบเน้นบนการ์ด</span>
            </label>
          </dd></div>
        </dl>
      </section>

      <section className="admin-block">
        <h2>เนื้อหาที่ทีมงานเขียนเอง</h2>
        <p className="admin-muted">ห้าส่วนนี้ผู้จัดไม่ได้กรอกมา เว้นว่างได้ ส่วนที่เว้นจะไม่ขึ้นบนหน้ารายละเอียด</p>
        <dl className="admin-fields">
          <div className="admin-field"><dt><label htmlFor="listing-overview">เวทีนี้เกี่ยวกับอะไร</label></dt>
            <dd><textarea id="listing-overview" rows={3} value={draft.overview} onChange={(e) => set('overview', e.target.value)} /></dd></div>
          <div className="admin-field"><dt><label htmlFor="listing-audience">เหมาะกับใคร</label></dt>
            <dd><textarea id="listing-audience" rows={3} value={draft.audience} onChange={(e) => set('audience', e.target.value)} /></dd></div>
          <div className="admin-field"><dt><label htmlFor="listing-format">รูปแบบการแข่งขัน</label></dt>
            <dd><textarea id="listing-format" rows={3} value={draft.format} onChange={(e) => set('format', e.target.value)} />
              <span className="admin-muted">บรรทัดละหนึ่งข้อ</span></dd></div>
          <div className="admin-field"><dt><label htmlFor="listing-deliverables">สิ่งที่ต้องส่ง</label></dt>
            <dd><textarea id="listing-deliverables" rows={3} value={draft.deliverables} onChange={(e) => set('deliverables', e.target.value)} />
              <span className="admin-muted">บรรทัดละหนึ่งข้อ</span></dd></div>
          <div className="admin-field"><dt><label htmlFor="listing-preparation">สิ่งที่ควรเตรียม</label></dt>
            <dd><textarea id="listing-preparation" rows={3} value={draft.preparation} onChange={(e) => set('preparation', e.target.value)} />
              <span className="admin-muted">บรรทัดละหนึ่งข้อ</span></dd></div>
        </dl>
      </section>

      {editing && data?.listing.source === 'organiser' && <p className="review-gate">
        <CircleAlert size={15} aria-hidden="true" />
        เวทีนี้มาจากใบที่ผู้จัดส่งเอง แก้แล้วจะไม่ตรงกับสิ่งที่เขาส่งมา
      </p>}

      <p className="admin-message" role="alert">{message}</p>
      <div className="review-actions">
        <button className="primary-button" type="submit" disabled={saving}>
          {saving ? 'กำลังบันทึก…' : editing ? 'บันทึกการแก้ไข' : 'เพิ่มเวที'}
        </button>
        <Link className="ghost-button" to="/admin/listings">ยกเลิก</Link>
      </div>
    </form>
  </>;
}
