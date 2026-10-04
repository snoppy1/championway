import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Check, X } from 'lucide-react';
import { formatDate } from '../../data/competitions';
import { ApiError, post } from '../../lib/api';
import { useApi } from '../../lib/useApi';

/* คิวคำขอเพิ่มเวทีจากเมนเทอร์ (หน้าจัดการเป็นภาษาไทยอย่างเดียว ตามที่ตัดสินไว้ใน markdown/i18n.md)
   ทีมงานสร้างเวทีจริงเองจากหน้า "เวทีบนหน้าเว็บ" (ต้องตรวจประกาศต้นทางเหมือนเวทีอื่น) แล้วกลับมาผูกคำขอกับเวทีนั้นด้วย slug
   ตอนอนุมัติ เซิร์ฟเวอร์ใส่เมนเทอร์เป็นผู้รับปรึกษาเวทีนั้นพร้อมราคาที่ขอไว้ และส่งอีเมลแจ้งผล */

type Status = 'pending' | 'approved' | 'rejected';
type Request = {
  id: string; name: string; url: string; details: string; price: number; minutes: number | null; unit: string;
  result: 'winner' | 'finalist' | 'participant' | null; year: string; evidence: string;
  status: Status; reason: string; createdAt: string; decidedAt: string | null;
  mentorName: string; competitionSlug: string | null;
};
type Option = { id: string; slug: string; name: string };
const resultLabel = { winner: 'ชนะ/ได้รางวัล', finalist: 'เข้ารอบสุดท้าย', participant: 'เข้าร่วมแข่งขัน' } as const;

const labels: Record<Status, string> = { pending: 'รอตรวจ', approved: 'อนุมัติแล้ว', rejected: 'ไม่ผ่าน' };
const pillClass: Record<Status, string> = { pending: 'is-pending', approved: 'is-published', rejected: 'is-rejected' };
const filters: { id: Status | 'all'; label: string }[] = [
  { id: 'pending', label: 'รอตรวจ' }, { id: 'approved', label: 'อนุมัติแล้ว' },
  { id: 'rejected', label: 'ไม่ผ่าน' }, { id: 'all', label: 'ทั้งหมด' },
];
const baht = new Intl.NumberFormat('th-TH');

function Decision({ request, options, onDone }: { request: Request; options: Option[]; onDone: () => void }) {
  const [slug, setSlug] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function send(body: { decision: 'approve'; competitionSlug: string } | { decision: 'reject'; reason: string }) {
    setBusy(true);
    setMessage('');
    try {
      await post(`/admin/competition-requests/${request.id}/decision`, body);
      onDone();
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : 'บันทึกผลไม่สำเร็จ ลองใหม่อีกครั้ง');
      setBusy(false);
    }
  }

  function approve(event: FormEvent) {
    event.preventDefault();
    if (!slug.trim()) { setMessage('ใส่ slug ของเวทีที่จะผูกกับคำขอนี้'); return; }
    void send({ decision: 'approve', competitionSlug: slug.trim() });
  }
  function reject(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) { setMessage('กรอกเหตุผลที่ไม่อนุมัติ เพราะข้อความนี้คือสิ่งที่เมนเทอร์จะได้อ่าน'); return; }
    void send({ decision: 'reject', reason: reason.trim() });
  }

  return <div className="request-decision">
    <form onSubmit={approve} noValidate>
      <label htmlFor={`slug-${request.id}`}>slug ของเวทีในระบบ</label>
      <small className="admin-muted">
        ยังไม่มีเวทีนี้ในระบบ? <Link to="/admin/listings">สร้างเวทีก่อนจากหน้าเวทีบนหน้าเว็บ</Link> แล้วกลับมาใส่ slug ของเวทีนั้น
      </small>
      <input id={`slug-${request.id}`} list={`slugs-${request.id}`} value={slug} disabled={busy} autoComplete="off"
        onChange={(event) => { setSlug(event.target.value); setMessage(''); }} />
      <datalist id={`slugs-${request.id}`}>
        {options.map((option) => <option key={option.id} value={option.slug}>{option.name}</option>)}
      </datalist>
      <button className="primary-button" disabled={busy}><Check size={16} aria-hidden="true" />ผูกกับเวทีและอนุมัติ</button>
    </form>
    <form onSubmit={reject} noValidate>
      <label htmlFor={`reason-${request.id}`}>เหตุผลที่ไม่อนุมัติ</label>
      <small className="admin-muted">บังคับกรอก ส่งให้เมนเทอร์ทางอีเมล เขียนให้เขาแก้ต่อได้</small>
      <textarea id={`reason-${request.id}`} rows={3} maxLength={1000} value={reason} disabled={busy}
        onChange={(event) => { setReason(event.target.value); setMessage(''); }} />
      <button className="danger-button" disabled={busy}><X size={16} aria-hidden="true" />ไม่อนุมัติ</button>
    </form>
    <p className="admin-message" role="alert">{message}</p>
  </div>;
}

export function AdminRequestQueue() {
  const [status, setStatus] = useState<Status | 'all'>('pending');
  const { data, error, loading, reload } = useApi<{ items: Request[] }>('/admin/competition-requests');
  const { data: options } = useApi<{ items: Option[] }>('/competitions/options');
  const rows = (data?.items ?? []).filter((item) => status === 'all' || item.status === status);

  return <>
    <header className="admin-page-head">
      <h1>คำขอเพิ่มเวทีจากเมนเทอร์</h1>
      <p className="admin-muted">
        เมนเทอร์ขอเพิ่มเวทีที่ยังไม่มีในระบบ อนุมัติแล้วเมนเทอร์จะถูกใส่เป็นผู้รับปรึกษาเวทีนั้นพร้อมราคาที่ขอไว้
      </p>
    </header>

    <div className="queue-filters" role="group" aria-label="กรองตามสถานะ">
      {filters.map((filter) => <button key={filter.id} type="button"
        className={status === filter.id ? 'tab-button active' : 'tab-button'} aria-pressed={status === filter.id}
        onClick={() => setStatus(filter.id)}>{filter.label}</button>)}
    </div>
    <p className="admin-muted queue-count" role="status">{loading && !data ? 'กำลังโหลด…' : `${rows.length} คำขอ`}</p>
    {error && <p className="admin-message" role="alert">{error}</p>}

    {data && (rows.length > 0 ? <ul className="queue-list">
      {rows.map((item) => <li className="queue-row request-row" key={item.id}>
        <div className="queue-main">
          <span className={`status-pill ${pillClass[item.status]}`}>{labels[item.status]}</span>
          <h2>{/^https?:\/\//i.test(item.url)
            ? <a href={item.url} target="_blank" rel="noreferrer noopener">{item.name}<ArrowUpRight size={14} aria-hidden="true" /></a>
            : item.name}</h2>
          <p className="admin-muted">
            ขอโดย {item.mentorName} · ส่งเมื่อ {formatDate(item.createdAt.slice(0, 10))} · ราคาที่ขอ {item.price === 0 ? 'ฟรี'
              : item.unit ? `${baht.format(item.price)} บาท / ${item.unit}` : `${baht.format(item.price)} บาท / ${item.minutes} นาที`}
          </p>
          {/* เป็นเมนเทอร์ได้เฉพาะเวทีที่เคยแข่ง ผู้ตรวจต้องดูหลักฐานก่อนอนุมัติ (คำขอเก่าไม่มีส่วนนี้) */}
          {item.result && <p className="admin-muted">
            ผลที่อ้าง: {resultLabel[item.result]} · ปี {item.year} · หลักฐาน {/^https?:\/\//i.test(item.evidence)
              ? <a href={item.evidence} target="_blank" rel="noreferrer noopener">เปิดลิงก์<ArrowUpRight size={14} aria-hidden="true" /></a> : item.evidence}
          </p>}
          {item.details && <p className="request-details">{item.details}</p>}
          {item.status === 'approved' && item.competitionSlug && <p className="admin-muted">
            ผูกกับเวที <Link to={`/competitions/${item.competitionSlug}`}>{item.competitionSlug}</Link>
          </p>}
          {item.status === 'rejected' && item.reason && <p className="admin-muted">เหตุผล: {item.reason}</p>}
        </div>
        {item.status === 'pending' && <Decision request={item} options={options?.items ?? []} onDone={reload} />}
      </li>)}
    </ul> : <p className="admin-empty">ไม่มีคำขอในสถานะนี้</p>)}
  </>;
}
