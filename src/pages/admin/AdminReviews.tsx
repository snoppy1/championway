import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { formatDate } from '../../data/competitions';
import { ApiError, post } from '../../lib/api';
import { useApi } from '../../lib/useApi';

/* รายการรีวิวเมนเทอร์ ทีมงานซ่อนรีวิวที่น่าสงสัยได้ รีวิวที่ซ่อนไม่นับคะแนน Rising Star และไม่ขึ้นหน้าเว็บ
   ไม่ลบจริง เผื่อต้องย้อนดู แสดงคืนได้ทุกเมื่อ (หน้าจัดการเป็นภาษาไทยอย่างเดียว) */

type Review = {
  id: string; mentorId: string; stars: number; comment: string; createdAt: string; hiddenAt: string | null;
  mentorName: string; reviewer: string; reviewerEmail: string;
};
type Filter = 'all' | 'shown' | 'hidden';
const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' }, { id: 'shown', label: 'แสดงอยู่' }, { id: 'hidden', label: 'ซ่อนอยู่' },
];

export function AdminReviewList() {
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const { data, error, loading, reload } = useApi<{ items: Review[] }>('/admin/reviews');
  const rows = (data?.items ?? []).filter((item) => filter === 'all' || (filter === 'hidden') === Boolean(item.hiddenAt));

  async function toggle(item: Review) {
    setBusy(item.id);
    setMessage('');
    try {
      await post(`/admin/reviews/${item.id}/visibility`, { hidden: !item.hiddenAt });
      reload();
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy('');
    }
  }

  return <>
    <header className="admin-page-head">
      <h1>รีวิวเมนเทอร์</h1>
      <p className="admin-muted">
        ซ่อนรีวิวที่น่าสงสัย เช่นปั๊มคะแนนหรือข้อความไม่เหมาะสม รีวิวที่ซ่อนจะไม่นับคะแนน Rising Star และไม่ขึ้นหน้าเว็บ แต่ยังอยู่ในรายการนี้ให้แสดงคืนได้
      </p>
    </header>

    <div className="queue-filters" role="group" aria-label="กรองตามการแสดงผล">
      {filters.map((item) => <button key={item.id} type="button"
        className={filter === item.id ? 'tab-button active' : 'tab-button'} aria-pressed={filter === item.id}
        onClick={() => setFilter(item.id)}>{item.label}</button>)}
    </div>
    <p className="admin-muted queue-count" role="status">{loading && !data ? 'กำลังโหลด…' : `${rows.length} รีวิว (แสดง 200 รายการล่าสุด)`}</p>
    {(error || message) && <p className="admin-message" role="alert">{error || message}</p>}

    {data && (rows.length > 0 ? <ul className="queue-list">
      {rows.map((item) => <li className="queue-row" key={item.id}>
        <div className="queue-main">
          <span className={item.hiddenAt ? 'status-pill is-rejected' : 'status-pill is-published'}>{item.hiddenAt ? 'ซ่อนอยู่' : 'แสดงอยู่'}</span>
          <h2>
            <span aria-hidden="true">{'★'.repeat(item.stars)}{'☆'.repeat(5 - item.stars)}</span>
            <span className="sr-only">{item.stars} จาก 5 ดาว</span>
            {' '}<Link to={`/mentors/${item.mentorId}`}>{item.mentorName}</Link>
          </h2>
          <p className="admin-muted">
            โดย {item.reviewer} ({item.reviewerEmail}) · {formatDate(item.createdAt.slice(0, 10))}
          </p>
          {item.comment ? <p className="request-details">{item.comment}</p> : <p className="admin-muted">ไม่มีความเห็น</p>}
        </div>
        <button type="button" className={item.hiddenAt ? 'ghost-button' : 'danger-button'} disabled={busy !== ''}
          aria-label={`${item.hiddenAt ? 'แสดงรีวิวอีกครั้ง' : 'ซ่อนรีวิว'} ของ ${item.mentorName} โดย ${item.reviewer}`}
          onClick={() => { void toggle(item); }}>
          {item.hiddenAt ? <Eye size={16} aria-hidden="true" /> : <EyeOff size={16} aria-hidden="true" />}
          {busy === item.id ? 'กำลังบันทึก…' : item.hiddenAt ? 'แสดงอีกครั้ง' : 'ซ่อนรีวิว'}
        </button>
      </li>)}
    </ul> : <p className="admin-empty">ไม่มีรีวิวในตัวกรองนี้</p>)}
  </>;
}
