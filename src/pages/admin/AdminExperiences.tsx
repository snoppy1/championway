import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, X } from 'lucide-react';
import { formatDate } from '../../data/competitions';
import { ApiError, post } from '../../lib/api';
import { useApi } from '../../lib/useApi';

/* คิวตรวจประสบการณ์แข่งขันที่เมนเทอร์เพิ่มเองใน Mentor zone (spec 2026-10-13 หมวด C) หน้าจัดการเป็นภาษาไทยอย่างเดียว
   เปิดลิงก์หลักฐานดูว่าชื่อเมนเทอร์อยู่ในผลจริง กด "หลักฐานถูกต้อง" รายการนั้นจึงนับเป็นผลงาน (ป้าย ลำดับ คะแนนจับคู่)
   ไม่ผ่านต้องบอกเหตุผล เมนเทอร์เห็นเหตุผลในแท็บประสบการณ์ */

type Status = 'pending' | 'verified' | 'rejected';
type Item = {
  id: string; mentorId: string; mentorName: string; name: string; competitionSlug: string | null; year: string; kind: string; result: string;
  detail: string; role: string; roleOther: string; responsibility: string; evidenceUrl: string; lessons: string; status: Status; reason: string; createdAt: string;
};
const labels: Record<Status, string> = { pending: 'รอตรวจ', verified: 'ตรวจแล้ว', rejected: 'ไม่ผ่าน' };
const pillClass: Record<Status, string> = { pending: 'is-pending', verified: 'is-published', rejected: 'is-rejected' };
const filters: { id: Status | 'all'; label: string }[] = [
  { id: 'pending', label: 'รอตรวจ' }, { id: 'verified', label: 'ตรวจแล้ว' }, { id: 'rejected', label: 'ไม่ผ่าน' }, { id: 'all', label: 'ทั้งหมด' },
];
const kindLabel: Record<string, string> = { hackathon: 'Hackathon', case: 'Case competition', innovation: 'Innovation / Invention', software: 'Software / Programming', other: 'ประเภทอื่น' };
const resultLabel: Record<string, string> = { participant: 'ผู้เข้าร่วม', finalist: 'Finalist', winner: 'ได้รับรางวัล', other: 'ผลอื่น ๆ' };
const roleLabel: Record<string, string> = { developer: 'Developer', designer: 'Designer', leader: 'Team Leader / PM', business: 'Business / Pitching', other: 'อื่น ๆ' };

function Decision({ item, onDone }: { item: Item; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function send(body: { decision: 'verify' } | { decision: 'reject'; reason: string }) {
    setBusy(true);
    setMessage('');
    try {
      await post(`/admin/experiences/${item.id}/decision`, body);
      onDone();
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : 'บันทึกผลไม่สำเร็จ ลองใหม่อีกครั้ง');
      setBusy(false);
    }
  }
  function reject(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) { setMessage('กรอกเหตุผลที่ไม่ผ่าน เพราะข้อความนี้คือสิ่งที่เมนเทอร์จะได้อ่าน'); return; }
    void send({ decision: 'reject', reason: reason.trim() });
  }

  return <div className="request-decision">
    <form onSubmit={(event) => { event.preventDefault(); void send({ decision: 'verify' }); }} noValidate>
      <button className="primary-button" disabled={busy}><Check size={16} aria-hidden="true" />หลักฐานถูกต้อง</button>
    </form>
    <form onSubmit={reject} noValidate>
      <label htmlFor={`reason-${item.id}`}>เหตุผลที่ไม่ผ่าน</label>
      <small className="admin-muted">บังคับกรอก เมนเทอร์จะเห็นข้อความนี้ในแท็บประสบการณ์</small>
      <input id={`reason-${item.id}`} value={reason} maxLength={500} disabled={busy} onChange={(event) => { setReason(event.target.value); setMessage(''); }} />
      <button className="danger-button" disabled={busy}><X size={16} aria-hidden="true" />ไม่ผ่าน</button>
    </form>
    <p className="admin-message" role="alert">{message}</p>
  </div>;
}

export function AdminExperienceQueue() {
  const [status, setStatus] = useState<Status | 'all'>('pending');
  const { data, error, loading, reload } = useApi<{ items: Item[] }>(`/admin/experiences?status=${status}`);
  const rows = data?.items ?? [];

  return <>
    <header className="admin-page-head">
      <h1>ประสบการณ์เมนเทอร์</h1>
      <p className="admin-muted">
        เมนเทอร์เพิ่มงานที่เคยแข่งเองใน Mentor zone เปิดลิงก์หลักฐานดูว่าชื่อเมนเทอร์อยู่ในผลจริง แล้วกดหลักฐานถูกต้อง
        รายการที่ผ่านจะนับเป็นผลงานของเมนเทอร์ (ป้ายบนโปรไฟล์ ลำดับ และการจับคู่)
      </p>
    </header>

    <div className="queue-filters" role="group" aria-label="กรองตามสถานะ">
      {filters.map((filter) => <button key={filter.id} type="button"
        className={status === filter.id ? 'tab-button active' : 'tab-button'} aria-pressed={status === filter.id}
        onClick={() => setStatus(filter.id)}>{filter.label}</button>)}
    </div>
    <p className="admin-muted queue-count" role="status">{loading && !data ? 'กำลังโหลด…' : `${rows.length} รายการ`}</p>
    {error && <p className="admin-message" role="alert">{error}</p>}

    {data && (rows.length > 0 ? <ul className="queue-list">
      {rows.map((item) => <li className="queue-row request-row" key={item.id}>
        <div className="queue-main">
          <span className={`status-pill ${pillClass[item.status]}`}>{labels[item.status]}</span>
          <h2>{item.name} · {item.year}</h2>
          <p className="admin-muted">
            <Link to={`/mentors/${item.mentorId}`}>{item.mentorName}</Link> · ส่งเมื่อ {formatDate(item.createdAt.slice(0, 10))}
            {item.competitionSlug && <> · เวทีในระบบ <Link to={`/competitions/${item.competitionSlug}`}>{item.competitionSlug}</Link></>}
          </p>
          <p className="admin-muted">
            {kindLabel[item.kind] ?? item.kind} · {resultLabel[item.result] ?? item.result}{item.detail ? ` (${item.detail})` : ''}
            {' · '}{item.role === 'other' ? item.roleOther || 'ไม่ระบุบทบาท' : roleLabel[item.role]}
          </p>
          <p className="request-details">สิ่งที่รับผิดชอบ: {item.responsibility || '-'}</p>
          {item.lessons && <p className="request-details">ประสบการณ์ที่ส่งต่อได้: {item.lessons}</p>}
          {item.evidenceUrl
            ? <p><a href={item.evidenceUrl} target="_blank" rel="noreferrer noopener">{item.evidenceUrl}<ArrowUpRight size={14} aria-hidden="true" /></a></p>
            : <p className="admin-muted">ไม่มีลิงก์หลักฐาน (ย้ายมาจากระบบเดิม ตรวจแล้วตอนอนุมัติใบสมัคร)</p>}
          {item.status === 'rejected' && item.reason && <p className="admin-muted">เหตุผล: {item.reason}</p>}
        </div>
        {item.status === 'pending' && <Decision item={item} onDone={reload} />}
      </li>)}
    </ul> : <p className="admin-empty">ไม่มีรายการในสถานะนี้</p>)}
  </>;
}
