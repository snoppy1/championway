import { useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Landmark } from 'lucide-react';
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

  return <form className="request-decision" onSubmit={submit} noValidate>
    <label htmlFor={`ref-${payout.id}`}>เลขอ้างอิงการโอน</label>
    <small className="admin-muted">โอนเข้าบัญชีด้านซ้ายเสร็จแล้วค่อยกด ระบบจะส่งอีเมลแจ้งเมนเทอร์</small>
    <input id={`ref-${payout.id}`} value={note} maxLength={500} disabled={busy} autoComplete="off" onChange={(event) => { setNote(event.target.value); setMessage(''); }} />
    <button className="primary-button" disabled={busy}><Check size={16} aria-hidden="true" />บันทึกว่าโอนแล้ว</button>
    <p className="admin-message" role="alert">{message}</p>
  </form>;
}

export function AdminPayouts() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | 'all'>('due');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, error, loading, reload } = useApi<{ items: Payout[] }>(isAdmin(user) ? '/admin/payouts' : null);
  if (!isAdmin(user)) return <Navigate to="/admin" replace />;
  const rows = (data?.items ?? []).filter((item) => status === 'all' || item.status === status);

  async function release() {
    setBusy(true);
    setNotice('');
    try {
      const result = await post<{ released: number }>('/admin/payouts/release-overdue', {});
      setNotice(`ปล่อยเงินแล้ว ${result.released} งาน`);
      reload();
    } catch (failure) {
      setNotice(failure instanceof ApiError ? failure.message : 'ทำไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <header className="admin-page-head">
      <h1>โอนเงินเมนเทอร์</h1>
      <p className="admin-muted">
        ยอดที่นักเรียนกดเสร็จงานแล้ว (หรือเงียบเกิน 3 วันหลังนัด) จะขึ้น “รอโอน” โอนเข้าบัญชีของเมนเทอร์ด้วยตัวเอง แล้วบันทึกเลขอ้างอิงที่นี่
      </p>
    </header>

    <div className="queue-actions">
      <button type="button" className="ghost-button" disabled={busy} onClick={() => { void release(); }}>ปล่อยเงินงานที่เกินกำหนด</button>
      <span className="admin-muted" role="status">{notice}</span>
    </div>

    <div className="queue-filters" role="group" aria-label="กรองตามสถานะ">
      {filters.map((filter) => <button key={filter.id} type="button" className={status === filter.id ? 'tab-button active' : 'tab-button'}
        aria-pressed={status === filter.id} onClick={() => setStatus(filter.id)}>{filter.label}</button>)}
    </div>
    <p className="admin-muted queue-count" role="status">{loading && !data ? 'กำลังโหลด…' : `${rows.length} รายการ`}</p>
    {error && <p className="admin-message" role="alert">{error}</p>}

    {data && (rows.length > 0 ? <ul className="queue-list">
      {rows.map((item) => <li className="queue-row request-row" key={item.id}>
        <div className="queue-main">
          <span className={`status-pill ${pillClass[item.status]}`}>{labels[item.status]}</span>
          <h2>{item.mentorName} · {baht.format(item.amount)} บาท</h2>
          <p className="admin-muted">{item.competitionName ?? 'ไม่ระบุเวที'} · สร้างเมื่อ {formatDate(item.createdAt.slice(0, 10))}</p>
          {item.account
            ? <p className="payout-account"><Landmark size={16} aria-hidden="true" />
              <span>{item.account.accountName} · {th.payout.banks[item.account.bankCode] ?? item.account.bankCode} ·{' '}
                {item.account.accountNumber ? <b className="payout-number">{item.account.accountNumber}</b> : `ลงท้าย ${item.account.last4}`}</span></p>
            : <p className="admin-message">เมนเทอร์ยังไม่ได้เพิ่มบัญชีรับเงิน โอนไม่ได้จนกว่าจะเพิ่ม</p>}
          {item.account && item.account.status !== 'verified' && item.status === 'due' && <p className="admin-muted">สถานะบัญชี: {item.account.status === 'pending' ? 'ยังไม่ได้ตรวจ' : 'ตรวจไม่ผ่าน'}</p>}
          {item.status === 'paid' && <p className="admin-muted">โอนเมื่อ {item.paidAt ? formatDate(item.paidAt.slice(0, 10)) : '-'} · อ้างอิง {item.note}</p>}
        </div>
        {item.status === 'due' && <MarkPaid payout={item} onDone={reload} />}
      </li>)}
    </ul> : <p className="admin-empty">ไม่มีรายการในสถานะนี้</p>)}
  </>;
}
