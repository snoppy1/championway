import { useEffect, useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CircleAlert, ExternalLink, RefreshCw } from 'lucide-react';
import { isAdmin, useAuth } from '../../data/auth';
import { formatDate } from '../../data/competitions';
import type { ImportDraft, ImportRow, ImportSource, ImportSourceId, ImportStatus } from '../../data/imports';
import { ApiError, api, post } from '../../lib/api';
import { useApi } from '../../lib/useApi';

/* งานแข่งที่ระบบดึงมาให้ตรวจ (server/lib/import/run.ts, 5 ต.ค. 2569)
   ระบบอ่าน RSS ของแหล่งที่เปิดไว้วันละครั้ง ให้ AI อ่านประกาศแล้วกรอกร่าง แอดมินตรวจแล้วกด "ตรวจและเพิ่มเวที" หรือ "ปฏิเสธ"
   ทุกแหล่งปิดเป็นค่าเริ่มต้น เปิดปิดได้เฉพาะ admin เพราะมีค่าใช้จ่าย AI */

type Payload = { ai: boolean; sources: ImportSource[]; counts: Partial<Record<ImportStatus, number>>; items: ImportRow[] };
type Tab = Exclude<ImportStatus, 'processing'>;

/** จัดกลุ่มแหล่งให้อ่านง่าย: แหล่งทางการ กับเว็บรวมประกาศ */
const sourceGroups: Array<{ title: string; note: string; items: Array<{ id: ImportSourceId; name: string; text: string }> }> = [
  { title: 'แหล่งทางการ', note: 'ผู้จัดประกาศเอง ข้อมูลเชื่อถือได้ แต่มีข่าวอื่นปนมา AI จะคัดให้', items: [
    { id: 'ysc', name: 'YSC / สวทช.', text: 'RSS ของโครงการ Young Scientist Competition มีข่าวผลการแข่งขันปนมาด้วย' },
  ] },
  { title: 'เว็บรวมประกาศ', note: 'ได้ประกาศหลายหมวด ต้องเปิดลิงก์ผู้จัดต้นทางยืนยันทุกครั้ง', items: [
    { id: 'contest_thailand', name: 'Contest Thailand', text: 'RSS รวมประกาศการประกวดหลายหมวด ใช้เป็นตัวค้นพบ แล้วตามไปยืนยันกับผู้จัด' },
  ] },
];

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'pending', label: 'รอตรวจ' },
  { id: 'skipped', label: 'ไม่ใช่ประกาศรับสมัคร' },
  { id: 'failed', label: 'อ่านไม่สำเร็จ' },
  { id: 'accepted', label: 'เพิ่มแล้ว' },
  { id: 'rejected', label: 'ปฏิเสธแล้ว' },
];

const originLabels: Record<string, string> = {
  ysc: 'YSC / สวทช.', contest_thailand: 'Contest Thailand', link: 'วางลิงก์', text: 'วางข้อความ',
};
const itemKindLabels: Record<string, string> = {
  call: 'ประกาศรับสมัคร', result: 'ประกาศผล', news: 'ข่าวทั่วไป', unsure: 'AI ไม่แน่ใจ',
};
/** ชื่อช่องที่ AI ไม่แน่ใจ แสดงเป็นภาษาไทยให้แอดมินรู้ว่าต้องเช็กอะไร */
export const draftFieldLabels: Partial<Record<keyof ImportDraft, string>> = {
  name: 'ชื่อเวที', org: 'ผู้จัด', description: 'คำบรรยาย', type: 'ประเภท', kind: 'ประเภทงาน', themes: 'หมวดจับคู่เมนเทอร์',
  categories: 'หมวดหมู่', levels: 'ระดับผู้เข้าแข่ง', rewards: 'รางวัลอื่น', teamMin: 'ขนาดทีมต่ำสุด', teamMax: 'ขนาดทีมสูงสุด',
  opensAt: 'วันเปิดรับ', closesAt: 'วันปิดรับ', eventDate: 'วันจัดงาน', region: 'รูปแบบ/ภูมิภาค', venue: 'สถานที่',
  prizeValue: 'เงินรางวัล', prizeNote: 'รางวัล', fee: 'ค่าสมัคร', registerUrl: 'ลิงก์สมัคร',
};
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(iso)) : 'ยังไม่เคย');

function SourceSwitch({ id, name, text, setting, canEdit, onSaved }: {
  id: ImportSourceId; name: string; text: string; setting: ImportSource | undefined; canEdit: boolean;
  onSaved: (sources: ImportSource[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const enabled = setting?.enabled ?? false;
  async function toggle(next: boolean) {
    setBusy(true);
    setMessage('');
    try {
      const result = await api<{ sources: ImportSource[] }>(`/admin/imports/sources/${id}`, { method: 'PUT', body: JSON.stringify({ enabled: next }) });
      onSaved(result.sources);
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }
  return <li className="import-source">
    <div>
      <h3>{name}</h3>
      <p className="admin-muted">{text}</p>
      <p className="admin-muted">
        ดึงล่าสุด {when(setting?.lastRunAt ?? null)}{setting?.lastRunAt && ` · ได้ประกาศใหม่ ${setting.lastFound} รายการ`}
      </p>
      {setting?.lastError && <p className="admin-message" role="alert">ครั้งล่าสุดผิดพลาด: {setting.lastError}</p>}
      {message && <p className="admin-message" role="alert">{message}</p>}
    </div>
    <label className="notify-switch">
      <input type="checkbox" role="switch" checked={enabled} disabled={busy || !canEdit}
        aria-label={`ดึงอัตโนมัติจาก ${name}`} onChange={(event) => { void toggle(event.target.checked); }} />
      <span>{enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</span>
    </label>
  </li>;
}

function ManualImport({ onDone }: { onDone: (id: string) => void }) {
  const uid = useId();
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const result = await post<{ id: string; duplicate: boolean; status: ImportStatus }>('/admin/imports/manual', { url: url.trim() || null, text: text.trim() || null });
      setMessage({ ok: true, text: result.duplicate ? 'ประกาศนี้เคยดึงมาแล้ว ดูได้ในคิว' : result.status === 'failed' ? 'อ่านประกาศไม่สำเร็จ ดูเหตุผลในแท็บ "อ่านไม่สำเร็จ"' : 'อ่านประกาศแล้ว ร่างอยู่ในคิว' });
      setUrl('');
      setText('');
      onDone(result.id);
    } catch (failure) {
      setMessage({ ok: false, text: failure instanceof ApiError ? failure.message : 'ส่งไม่สำเร็จ ลองใหม่อีกครั้ง' });
    } finally {
      setBusy(false);
    }
  }
  return <form className="admin-block import-manual" onSubmit={submit} aria-labelledby={`${uid}-title`}>
    <h2 id={`${uid}-title`}>วางลิงก์หรือข้อความประกาศ</h2>
    <p className="admin-muted">ใช้กับประกาศจากที่ไหนก็ได้ เช่น EventPop หรือเว็บผู้จัด ถ้าระบบเปิดหน้านั้นไม่ได้ (เช่น Facebook) ให้คัดลอกข้อความประกาศมาวางแทน</p>
    <dl className="admin-fields">
      <div className="admin-field"><dt><label htmlFor={`${uid}-url`}>ลิงก์ประกาศ</label></dt>
        <dd><input id={`${uid}-url`} type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} /></dd></div>
      <div className="admin-field"><dt><label htmlFor={`${uid}-text`}>หรือข้อความประกาศ</label></dt>
        <dd><textarea id={`${uid}-text`} rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={30000} />
          <span className="admin-muted">ใส่ลิงก์ด้วยถ้ามี ร่างจะได้มีลิงก์ประกาศต้นทาง</span></dd></div>
    </dl>
    <div className="review-actions">
      <button className="primary-button" type="submit" disabled={busy || (!url.trim() && !text.trim())}>
        {busy ? 'กำลังให้ AI อ่าน… (ราว 20 วินาที)' : 'ให้ AI อ่านประกาศ'}
      </button>
    </div>
    {message && <p className={message.ok ? 'notify-message is-ok' : 'admin-message'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
  </form>;
}

function RejectForm({ id, onDone }: { id: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!open) return <button type="button" className="ghost-button" onClick={() => setOpen(true)}>ปฏิเสธ</button>;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await post(`/admin/imports/${id}/reject`, { reason });
      onDone();
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : 'บันทึกไม่สำเร็จ');
      setBusy(false);
    }
  }
  return <form className="import-reject" onSubmit={submit}>
    <label>เหตุผลที่ปฏิเสธ
      <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="เช่น ปิดรับแล้ว, ไม่ใช่งานแข่ง, ซ้ำกับเวทีที่มี" />
    </label>
    <button type="submit" className="ghost-button" disabled={busy || !reason.trim()}>{busy ? 'กำลังบันทึก…' : 'ยืนยันปฏิเสธ'}</button>
    <button type="button" className="ghost-button" onClick={() => setOpen(false)}>ยกเลิก</button>
    {message && <p className="admin-message" role="alert">{message}</p>}
  </form>;
}

function ImportItem({ item, onChanged }: { item: ImportRow; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const draft = item.draft;
  const decidable = ['pending', 'skipped'].includes(item.status);
  async function retry() {
    setBusy(true);
    setMessage('');
    try { await post(`/admin/imports/${item.id}/retry`, {}); onChanged(); } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : 'ลองใหม่ไม่สำเร็จ');
    } finally { setBusy(false); }
  }
  return <li className="queue-row import-row">
    <div className="queue-main">
      <p className="import-tags">
        <span className="status-pill is-info">{originLabels[item.origin] ?? item.origin}</span>
        {item.itemKind && <span className={`status-pill ${item.itemKind === 'call' ? 'is-published' : 'is-pending'}`}>{itemKindLabels[item.itemKind]}</span>}
        {draft && !draft.kind && item.status === 'pending' && <span className="status-pill is-pending">ไม่ใช่ Hackathon หรือแข่งเคส</span>}
      </p>
      <h2>{item.title}</h2>
      {draft?.org && <p className="admin-muted">{draft.org}</p>}
      {draft?.description && <p>{draft.description}</p>}
      {item.note && <p className="admin-muted">AI: {item.note}</p>}
      {item.duplicateOf && <p className="review-gate"><CircleAlert size={15} aria-hidden="true" />
        อาจซ้ำกับเวทีที่มีอยู่แล้ว: <Link to={`/admin/listings/${item.duplicateOf.id}`}>{item.duplicateOf.name}</Link></p>}
      {item.uncertain.length > 0 && <p className="import-uncertain">ต้องเช็กเป็นพิเศษ: {item.uncertain.map((key) => draftFieldLabels[key as keyof ImportDraft] ?? key).join(' · ')}</p>}
      {item.error && <p className="admin-message">{item.error}</p>}
      {item.rejectReason && <p className="admin-muted">เหตุผลที่ปฏิเสธ: {item.rejectReason}</p>}
      {item.url && <p><a href={item.url} target="_blank" rel="noopener noreferrer">เปิดประกาศต้นทาง<ExternalLink size={13} aria-hidden="true" /></a></p>}
    </div>
    <dl className="queue-facts">
      <div><dt>ปิดรับ</dt><dd>{draft?.closesAt ? formatDate(draft.closesAt) : <span className="is-overdue">ไม่ทราบ</span>}</dd></div>
      <div><dt>เงินรางวัล</dt><dd>{draft?.prizeValue ? `${draft.prizeValue.toLocaleString('th-TH')} บาท` : draft?.prizeNote ?? '—'}</dd></div>
      <div><dt>ดึงมาเมื่อ</dt><dd>{when(item.createdAt)}</dd></div>
    </dl>
    <div className="import-actions">
        {decidable && <Link className="primary-button" to={`/admin/listings/new?import=${item.id}`}>ตรวจและเพิ่มเวที</Link>}
        {item.status === 'accepted' && item.competitionId && <Link className="ghost-button" to={`/admin/listings/${item.competitionId}`}>ดูเวทีที่เพิ่ม</Link>}
        {item.status === 'failed' && item.url && <button type="button" className="ghost-button" disabled={busy} onClick={() => { void retry(); }}>
          {busy ? 'กำลังอ่าน…' : 'ลองอ่านใหม่'}</button>}
        {(decidable || item.status === 'failed') && <RejectForm id={item.id} onDone={onChanged} />}
        {message && <p className="admin-message" role="alert">{message}</p>}
    </div>
  </li>;
}

export function AdminImports() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [tab, setTab] = useState<Tab>('pending');
  const { data, error, loading, reload } = useApi<Payload>(`/admin/imports?status=${tab}`);
  const [sources, setSources] = useState<ImportSource[] | null>(null);
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (data) setSources(data.sources); }, [data]);
  const anyEnabled = (sources ?? []).some((source) => source.enabled);

  async function runNow() {
    setRunning(true);
    setRunMessage(null);
    try {
      const { summary } = await post<{ summary: Record<string, number | string> }>('/admin/imports/run', {});
      const parts = Object.entries(summary).map(([id, value]) => `${originLabels[id] ?? id}: ${typeof value === 'number' ? `ใหม่ ${value} รายการ` : value}`);
      setRunMessage({ ok: true, text: parts.length ? parts.join(' · ') : 'ไม่มีแหล่งที่เปิดอยู่' });
      reload();
    } catch (failure) {
      setRunMessage({ ok: false, text: failure instanceof ApiError ? failure.message : 'ดึงไม่สำเร็จ ลองใหม่อีกครั้ง' });
    } finally {
      setRunning(false);
    }
  }

  return <>
    <header className="admin-page-head">
      <h1>งานแข่งที่ดึงมา</h1>
      <p className="admin-muted">
        ระบบอ่านประกาศจากแหล่งที่เปิดไว้วันละครั้ง ให้ AI กรอกร่างให้ ทุกร่างต้องผ่านการตรวจกับประกาศต้นทางก่อนขึ้นหน้าเว็บ
        AI ไม่เดาข้อมูลที่ประกาศไม่ได้บอก ช่องเหล่านั้นจะว่างและติดป้ายให้เช็ก
      </p>
    </header>

    {data && !data.ai && <p className="admin-message" role="alert">
      ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ใน Vercel ระบบจึงยังอ่านประกาศไม่ได้ ทั้งการดึงอัตโนมัติและการวางลิงก์
    </p>}

    <section className="admin-block" aria-labelledby="import-sources-title">
      <div className="admin-title-row">
        <h2 id="import-sources-title">แหล่งที่ดึงอัตโนมัติ</h2>
        {admin && <button type="button" className="ghost-button" disabled={running || !anyEnabled || !data?.ai} onClick={() => { void runNow(); }}>
          <RefreshCw size={15} aria-hidden="true" />{running ? 'กำลังดึง… (อาจนานถึง 3 นาที)' : 'ดึงตอนนี้'}
        </button>}
      </div>
      <p className="admin-muted">ทุกแหล่งปิดไว้ก่อน {admin ? 'เปิดแล้วระบบจะดึงทุกวันตอนเช้า' : 'เปิดปิดได้เฉพาะ admin'} · ดึงได้ไม่เกิน 6 ประกาศใหม่ต่อแหล่งต่อรอบ</p>
      {runMessage && <p className={runMessage.ok ? 'notify-message is-ok' : 'admin-message'} role={runMessage.ok ? 'status' : 'alert'}>{runMessage.text}</p>}
      {sourceGroups.map((group) => <div className="import-group" key={group.title}>
        <h3 className="import-group__title">{group.title}</h3>
        <p className="admin-muted">{group.note}</p>
        <ul className="import-sources">
          {group.items.map((item) => <SourceSwitch key={item.id} {...item} canEdit={admin}
            setting={sources?.find((source) => source.id === item.id)} onSaved={setSources} />)}
        </ul>
      </div>)}
    </section>

    <ManualImport onDone={() => { setTab('pending'); reload(); }} />

    <div className="queue-filters" role="group" aria-label="กรองตามสถานะ">
      {tabs.map((item) => <button key={item.id} type="button" className={tab === item.id ? 'tab-button active' : 'tab-button'}
        aria-pressed={tab === item.id} onClick={() => setTab(item.id)}>
        {item.label}{data?.counts[item.id] ? ` (${data.counts[item.id]})` : ''}
      </button>)}
    </div>

    {error && <div className="admin-message" role="alert">{error} <button type="button" className="ghost-button" onClick={reload}>ลองใหม่</button></div>}
    <p className="admin-muted queue-count" role="status">{loading ? 'กำลังโหลด…' : `${data?.items.length ?? 0} รายการ`}</p>
    {!loading && data && (data.items.length
      ? <ul className="queue-list">{data.items.map((item) => <ImportItem key={item.id} item={item} onChanged={reload} />)}</ul>
      : <p className="admin-empty">{tab === 'pending' ? 'ไม่มีร่างรอตรวจ เปิดแหล่งด้านบน หรือวางลิงก์ประกาศเพื่อเริ่ม' : 'ไม่มีรายการ'}</p>)}
  </>;
}
