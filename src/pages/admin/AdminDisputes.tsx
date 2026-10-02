import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Check, Undo2 } from 'lucide-react';
import { formatDate } from '../../data/competitions';
import { isAdmin, useAuth } from '../../data/auth';
import { ApiError, post } from '../../lib/api';
import { useApi } from '../../lib/useApi';

/* เรื่องที่นักเรียนแจ้งปัญหาหลังจ่ายเงิน (หน้าจัดการภาษาไทย เฉพาะ admin)
   เงินถูกพักไว้จนกว่าจะตัดสิน: "ปล่อยเงินให้เมนเทอร์" = ถือว่างานเสร็จ ยอดไปรอโอน
   "คืนเงินนักเรียน" = ยกเลิกงานและคืนเงินทั้งหมด ทั้งสองอย่างย้อนไม่ได้ จึงต้องเขียนเหตุผลและกดยืนยันอีกชั้น
   ห้องแชตของงานนี้ยังอ่านได้ที่ roomId ทีมงานดูบทสนทนาได้จากฐานข้อมูลถ้าต้องตรวจ */

type Dispute = {
  id: string; mentorName: string; student: string; studentEmail: string; competitionName: string | null;
  price: number; minutes: number; paidAt: string | null; disputedAt: string; disputeReason: string; roomId: string | null;
};
type Decision = 'release' | 'refund';
const baht = new Intl.NumberFormat('th-TH');

function Decide({ item, onDone }: { item: Dispute; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function ask(decision: Decision) {
    if (!note.trim()) { setMessage('เขียนเหตุผลของการตัดสินก่อน ข้อความนี้ถูกบันทึกไว้เป็นหลักฐาน'); return; }
    setMessage('');
    setAsking(decision);
  }

  async function confirm() {
    if (!asking) return;
    setBusy(true);
    try {
      await post(`/admin/disputes/${item.id}/decision`, { decision: asking, note: note.trim() });
      onDone();
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : 'ทำไม่สำเร็จ ลองใหม่อีกครั้ง');
      setBusy(false);
      setAsking(null);
    }
  }

  return <div className="request-decision">
    <label htmlFor={`note-${item.id}`}>เหตุผลของการตัดสิน</label>
    <small className="admin-muted">บังคับกรอก เก็บเป็นหลักฐาน</small>
    <textarea id={`note-${item.id}`} rows={3} maxLength={1000} value={note} disabled={busy} onChange={(event) => { setNote(event.target.value); setMessage(''); }} />
    {!asking
      ? <div className="review-actions">
        <button type="button" className="primary-button" onClick={() => ask('release')}><Check size={16} aria-hidden="true" />ปล่อยเงินให้เมนเทอร์</button>
        <button type="button" className="danger-button" onClick={() => ask('refund')}><Undo2 size={16} aria-hidden="true" />คืนเงินนักเรียน</button>
      </div>
      : <div className="review-gate" role="group" aria-label="ยืนยันการตัดสิน">
        <p>{asking === 'release'
          ? `ปล่อยเงิน ${baht.format(item.price)} บาท ให้ ${item.mentorName} ใช่ไหม ย้อนไม่ได้`
          : `คืนเงิน ${baht.format(item.price)} บาท ให้ ${item.student} และยกเลิกงานใช่ไหม ย้อนไม่ได้`}</p>
        <div className="review-actions">
          <button type="button" className={asking === 'release' ? 'primary-button' : 'danger-button'} disabled={busy} onClick={() => { void confirm(); }}>
            {busy ? 'กำลังบันทึก…' : 'ยืนยัน'}</button>
          <button type="button" className="ghost-button" disabled={busy} onClick={() => setAsking(null)}>ยังก่อน</button>
        </div>
      </div>}
    <p className="admin-message" role="alert">{message}</p>
  </div>;
}

export function AdminDisputes() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<{ items: Dispute[] }>(isAdmin(user) ? '/admin/disputes' : null);
  if (!isAdmin(user)) return <Navigate to="/admin" replace />;
  const rows = data?.items ?? [];

  return <>
    <header className="admin-page-head">
      <h1>เรื่องแจ้งปัญหา</h1>
      <p className="admin-muted">นักเรียนจ่ายเงินแล้วแจ้งปัญหา เงินถูกพักไว้ตัดสินได้สองทาง ปล่อยเงินให้เมนเทอร์ หรือคืนเงินนักเรียน</p>
    </header>
    <p className="admin-muted queue-count" role="status">{loading && !data ? 'กำลังโหลด…' : `${rows.length} เรื่อง`}</p>
    {error && <p className="admin-message" role="alert">{error}</p>}
    {data && (rows.length > 0 ? <ul className="queue-list">
      {rows.map((item) => <li className="queue-row request-row" key={item.id}>
        <div className="queue-main">
          <span className="status-pill is-rejected">แจ้งปัญหา</span>
          <h2>{item.student} กับ {item.mentorName}</h2>
          <p className="admin-muted">
            {item.competitionName ?? 'ไม่ระบุเวที'} · {baht.format(item.price)} บาท / {item.minutes / 60} ชั่วโมง ·
            จ่ายเมื่อ {item.paidAt ? formatDate(item.paidAt.slice(0, 10)) : '-'} · แจ้งเมื่อ {formatDate(item.disputedAt.slice(0, 10))}
          </p>
          <p className="admin-muted">อีเมลนักเรียน {item.studentEmail}</p>
          <p className="request-details">{item.disputeReason}</p>
        </div>
        <Decide item={item} onDone={reload} />
      </li>)}
    </ul> : <p className="admin-empty">ไม่มีเรื่องที่รอตัดสิน</p>)}
  </>;
}
