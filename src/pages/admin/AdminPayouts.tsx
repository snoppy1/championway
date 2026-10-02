import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Copy, Landmark } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { formatDate } from '../../data/competitions';
import { isAdmin, useAuth } from '../../data/auth';
import { ApiError, post } from '../../lib/api';
import { useApi } from '../../lib/useApi';
import { th } from '../../i18n/th';

/* รายการที่ต้องโอนเงินให้เมนเทอร์ (หน้าจัดการเป็นภาษาไทยอย่างเดียว เฉพาะ admin)
   นักเรียนจ่ายเงินแล้วเงินอยู่กับแพลตฟอร์ม พอนักเรียนกดเสร็จงาน (หรือครบกำหนดเงียบ 3 วัน) ยอดนี้จะ "รอโอน"
   ทีมโอนเข้าบัญชีที่เมนเทอร์ให้ไว้ด้วยตัวเอง แล้วกดบันทึกพร้อมเลขอ้างอิงการโอน เมนเทอร์ได้อีเมลแจ้ง
   เลขบัญชีเต็มเห็นเฉพาะยอดที่ยังรอโอน โอนแล้วเหลือ 4 ตัวท้าย */

type Overdue = { hireId: string; mentorName: string; amount: number; dueSince: string };
type Status = 'due' | 'held' | 'paid' | 'cancelled';
type Payout = {
  id: string; hireId: string; mentorName: string; competitionName: string | null; amount: number; status: Status;
  method: string | null; note: string; paidAt: string | null; createdAt: string;
  account: null | { accountName: string; bankCode: string; last4: string; status: string; accountNumber: string | null };
};

const labels: Record<Status, string> = { due: 'รอโอน', held: 'พักไว้ (แจ้งปัญหา)', paid: 'โอนแล้ว', cancelled: 'ยกเลิก (คืนเงิน)' };
const pillClass: Record<Status, string> = { due: 'is-pending', held: 'is-info', paid: 'is-published', cancelled: 'is-rejected' };
const filters: { id: Status | 'all'; label: string }[] = [
  { id: 'due', label: 'รอโอน' }, { id: 'held', label: 'พักไว้' }, { id: 'paid', label: 'โอนแล้ว' }, { id: 'all', label: 'ทั้งหมด' },
];
const baht = new Intl.NumberFormat('th-TH');

/** เลขบัญชีแบ่งกลุ่มให้อ่านและเทียบกับสมุดบัญชีง่าย: 10 หลักแบบไทย XXX-X-XXXXX-X, 12 หลัก XXXX-XXXX-XXXX, อื่น ๆ กลุ่มละ 4 */
function groupAccountNumber(digits: string) {
  const d = digits.replace(/\D/g, '');
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 4)}-${d.slice(4, 9)}-${d.slice(9)}`;
  return d.replace(/(.{4})(?=.)/g, '$1-');
}

/** คัดลอกเลขบัญชี (ไม่ใส่ขีด แอปธนาคารวางได้เลย) บอกผลด้วยข้อความที่อ่านออกเสียงได้ */
function CopyNumber({ digits }: { digits: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function copy() {
    try { await navigator.clipboard.writeText(digits); setState('done'); } catch { setState('failed'); }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 3000);
  }
  return <>
    <button type="button" className="ghost-button payout-copy" onClick={() => { void copy(); }}>
      <Copy size={16} aria-hidden="true" />{state === 'done' ? 'คัดลอกแล้ว' : 'คัดลอก'}</button>
    <span className="sr-only" role="status">{state === 'done' ? 'คัดลอกเลขบัญชีแล้ว' : state === 'failed' ? 'คัดลอกไม่สำเร็จ ลองเลือกเลขแล้วคัดลอกเอง' : ''}</span>
  </>;
}

function MarkPaid({ payout, onDone }: { payout: Payout; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) { setMessage('บันทึกเลขอ้างอิงการโอนก่อน เผื่อต้องย้อนตรวจ'); return; }
    setBusy(true);
    setMessage('');
    try {
      await post(`/admin/payouts/${payout.id}/mark-paid`, { note: note.trim() });
      onDone();
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
      setBusy(false);
    }
  }

  return <form className="request-decision payout-mark" onSubmit={submit} noValidate>
    <label htmlFor={`ref-${payout.id}`}>เลขอ้างอิงการโอน</label>
    <small className="admin-muted">โอนเสร็จแล้วค่อยกด ระบบจะแจ้งเมนเทอร์ทางอีเมล</small>
    <input id={`ref-${payout.id}`} value={note} maxLength={500} disabled={busy} autoComplete="off" onChange={(event) => { setNote(event.target.value); setMessage(''); }} />
    <button className="primary-button" disabled={busy}><Check size={16} aria-hidden="true" />บันทึกว่าโอนแล้ว</button>
    <p className="admin-message" role="alert">{message}</p>
  </form>;
}

/** ปุ่มปล่อยเงินงานที่เกินกำหนด: บอกจำนวนในป้ายปุ่ม กดแล้วมีกล่องยืนยันที่ลิสต์ทุกงานก่อน (ปล่อยแล้วย้อนไม่ได้)
    ใช้ <dialog> ของเบราว์เซอร์ จึงมีกับดักโฟกัส ปิดด้วย Esc และคืนโฟกัสที่ปุ่มให้เอง */
function ReleaseOverdue({ overdue, onDone }: { overdue: Overdue[]; onDone: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function release() {
    setBusy(true);
    setMessage('');
    try {
      const result = await post<{ released: number }>('/admin/payouts/release-overdue', {});
      dialog.current?.close();
      onDone(`ปล่อยเงินแล้ว ${result.released} งาน`);
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : 'ทำไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" className="ghost-button" disabled={overdue.length === 0}
      onClick={() => { setMessage(''); dialog.current?.showModal(); }}>
      ปล่อยเงินงานที่เกินกำหนด ({overdue.length})</button>
    <dialog ref={dialog} className="admin-dialog" aria-labelledby="release-title">
      <h2 id="release-title">ปล่อยเงิน {overdue.length} งานที่เกินกำหนด?</h2>
      <p className="admin-muted">
        นักเรียนไม่ได้กดเสร็จงานและไม่ได้แจ้งปัญหาเกิน 3 วันหลังจบเซสชัน ระบบจะนับว่างานเสร็จและยอดเหล่านี้จะขึ้น “รอโอน” ย้อนไม่ได้
      </p>
      <ul className="admin-dialog__list">
        {overdue.map((item) => <li key={item.hireId}>
          <span>{item.mentorName}</span>
          <span className="admin-muted">เกินกำหนดตั้งแต่ {formatDate(item.dueSince.slice(0, 10))}</span>
          <b>{baht.format(item.amount)} บาท</b>
        </li>)}
      </ul>
      <p className="admin-message" role="alert">{message}</p>
      <div className="review-actions">
        <button type="button" className="primary-button" disabled={busy || overdue.length === 0} onClick={() => { void release(); }}>
          {busy ? 'กำลังปล่อยเงิน…' : `ยืนยันปล่อยเงิน ${overdue.length} งาน`}</button>
        <button type="button" className="ghost-button" disabled={busy} onClick={() => dialog.current?.close()}>ยกเลิก</button>
      </div>
    </dialog>
  </>;
}

export function AdminPayouts() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | 'all'>('due');
  const [notice, setNotice] = useState('');
  const { data, error, loading, reload } = useApi<{ items: Payout[]; overdue: Overdue[] }>(isAdmin(user) ? '/admin/payouts' : null);
  if (!isAdmin(user)) return <Navigate to="/admin" replace />;
  const rows = (data?.items ?? []).filter((item) => status === 'all' || item.status === status);

  return <>
    <header className="admin-page-head">
      <h1>โอนเงินเมนเทอร์</h1>
      <p className="admin-muted">
        ยอดที่นักเรียนกดเสร็จงานแล้ว (หรือเงียบเกิน 3 วันหลังจบเซสชัน) จะขึ้น “รอโอน” โอนเข้าบัญชีของเมนเทอร์ด้วยตัวเอง แล้วบันทึกเลขอ้างอิงที่นี่
      </p>
    </header>

    <div className="queue-filters" role="group" aria-label="กรองตามสถานะ">
      {filters.map((filter) => <button key={filter.id} type="button" className={status === filter.id ? 'tab-button active' : 'tab-button'}
        aria-pressed={status === filter.id} onClick={() => setStatus(filter.id)}>{filter.label}</button>)}
    </div>
    <div className="queue-meta">
      <p className="admin-muted queue-count" role="status">{loading && !data ? 'กำลังโหลด…' : `${rows.length} รายการ`}</p>
      {data && <ReleaseOverdue overdue={data.overdue} onDone={(message) => { setNotice(message); reload(); }} />}
      <p className="admin-muted queue-notice" role="status">{notice}</p>
    </div>
    {error && <p className="admin-message" role="alert">{error}</p>}

    {data && (rows.length > 0 ? <ul className="queue-list">
      {rows.map((item) => <li className="queue-row payout-card" key={item.id} data-hire={item.hireId}>
        <div className="queue-main">
          <span className={`status-pill ${pillClass[item.status]}`}>{labels[item.status]}</span>
          <h2>{item.mentorName}</h2>
          <p className="admin-muted">{item.competitionName ?? 'ไม่ระบุเวที'} · สร้างเมื่อ {formatDate(item.createdAt.slice(0, 10))}</p>
          {item.account
            ? <dl className="payout-account">
              <div><dt>ธนาคาร</dt><dd><Landmark size={16} aria-hidden="true" />{th.payout.banks[item.account.bankCode] ?? item.account.bankCode}</dd></div>
              <div><dt>ชื่อบัญชี</dt><dd>{item.account.accountName}</dd></div>
              <div><dt>เลขบัญชี</dt><dd>{item.account.accountNumber
                ? <><b className="payout-number">{groupAccountNumber(item.account.accountNumber)}</b><CopyNumber digits={item.account.accountNumber} /></>
                : `ลงท้าย ${item.account.last4}`}</dd></div>
            </dl>
            : <p className="admin-message">เมนเทอร์ยังไม่ได้เพิ่มบัญชีรับเงิน โอนไม่ได้จนกว่าจะเพิ่ม</p>}
          {item.account && item.account.status !== 'verified' && item.status === 'due' && <p className="admin-muted">สถานะบัญชี: {item.account.status === 'pending' ? 'ยังไม่ได้ตรวจ' : 'ตรวจไม่ผ่าน'}</p>}
          {item.status === 'paid' && <p className="admin-muted">โอนเมื่อ {item.paidAt ? formatDate(item.paidAt.slice(0, 10)) : '-'} · อ้างอิง {item.note}</p>}
        </div>
        <div className="payout-side">
          <p className="payout-amount"><span className="sr-only">ยอดที่ต้องโอน </span>{baht.format(item.amount)}<small>บาท</small></p>
          {item.status === 'due' && <MarkPaid payout={item} onDone={reload} />}
        </div>
      </li>)}
    </ul> : <p className="admin-empty">ไม่มีรายการในสถานะนี้</p>)}
  </>;
}
