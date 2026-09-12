import { Link } from 'react-router-dom';
import { ArrowRight, Archive, CalendarClock, CircleAlert, ClipboardList } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDate } from '../../data/competitions';
import { useApi } from '../../lib/useApi';

const REVIEW_TARGET_DAYS = 2;
const STALE_AFTER_DAYS = 30;

type Listing = { slug: string; name: string; closesAt?: string; lastVerifiedAt?: string };
type Overview = {
  waiting: { competitions: number; mentors: number; total: number; oldestDays: number };
  closingSoon: Listing[];
  stale: Listing[];
  closed: Listing[];
};

/** ตัวเลขที่ไม่นำไปสู่การลงมือทำห้ามอยู่บนหน้านี้ ทุกการ์ดจึงมีทางไปต่อ */
function Stat({ icon, title, value, tone, children }: {
  icon: ReactNode; title: string; value: string; tone?: 'warn'; children: ReactNode;
}) {
  return <article className={tone === 'warn' ? 'stat-card is-warn' : 'stat-card'}>
    <h3>{icon}{title}</h3>
    <p className="stat-value">{value}</p>
    <div className="stat-body">{children}</div>
  </article>;
}

function Listings({ items, label, empty }: { items: Listing[]; label: (item: Listing) => string; empty: string }) {
  if (!items.length) return <p>{empty}</p>;
  return <ul className="stat-list">
    {items.map((item) => <li key={item.slug}>
      <Link to={`/competitions/${item.slug}`}>{item.name}</Link>
      <span className="admin-muted">{label(item)}</span>
    </li>)}
  </ul>;
}

export function AdminOverview() {
  const { data, error, loading } = useApi<Overview>('/admin/overview');

  if (loading) return <p className="admin-muted">กำลังโหลด…</p>;
  if (error || !data) return <p className="admin-message" role="alert">{error || 'โหลดข้อมูลไม่สำเร็จ'}</p>;

  const { waiting, closingSoon, stale, closed } = data;

  return <>
    <header className="admin-page-head">
      <h1>ภาพรวม</h1>
      <p className="admin-muted">สี่เรื่องที่ต้องตัดสินใจวันนี้ ถ้าไม่มีอะไรค้าง ตัวเลขจะบอกว่าไม่มี</p>
    </header>

    <div className="stat-grid">
      <Stat
        icon={<ClipboardList size={16} aria-hidden="true" />}
        title="ใบที่รอตรวจ"
        value={waiting.total ? `${waiting.total} ใบ` : 'ไม่มี'}
        tone={waiting.oldestDays > REVIEW_TARGET_DAYS ? 'warn' : undefined}
      >
        {waiting.total > 0
          ? <p>ใบเก่าสุดรอมาแล้ว {waiting.oldestDays} วัน {waiting.oldestDays > REVIEW_TARGET_DAYS
            ? <b>เกินเป้าหมาย {REVIEW_TARGET_DAYS} วันทำการ</b>
            : `ยังอยู่ในเป้าหมาย ${REVIEW_TARGET_DAYS} วันทำการ`}</p>
          : <p>ไม่มีใบค้างในคิว</p>}
        <p className="stat-links">
          <Link className="detail-link" to="/admin/competitions">งานแข่ง {waiting.competitions} ใบ<ArrowRight size={14} aria-hidden="true" /></Link>
          <Link className="detail-link" to="/admin/mentors">เมนเทอร์ {waiting.mentors} ใบ<ArrowRight size={14} aria-hidden="true" /></Link>
        </p>
      </Stat>

      <Stat
        icon={<CalendarClock size={16} aria-hidden="true" />}
        title="ปิดรับใน 7 วัน"
        value={closingSoon.length ? `${closingSoon.length} เวที` : 'ไม่มี'}
      >
        <Listings
          items={closingSoon} empty="ไม่มีเวทีที่ใกล้ปิดรับ"
          label={(item) => `ปิดรับ ${formatDate(item.closesAt!)}`}
        />
        <p className="stat-note">กลุ่มนี้ต้องยืนยันกับผู้จัดก่อนถึงกำหนด</p>
      </Stat>

      <Stat
        icon={<CircleAlert size={16} aria-hidden="true" />}
        title={`ไม่ได้ตรวจเกิน ${STALE_AFTER_DAYS} วัน`}
        value={stale.length ? `${stale.length} เวที` : 'ไม่มี'}
        tone={stale.length ? 'warn' : undefined}
      >
        <Listings
          items={stale} empty="ทุกเวทีที่ทีมงานคัดมาเองยังอยู่ในรอบตรวจ"
          label={(item) => `ตรวจล่าสุด ${formatDate(item.lastVerifiedAt!)}`}
        />
        <p className="stat-note">เฉพาะเวทีที่ทีมงานคัดมาเอง ข้อมูลค้างแย่กว่าข้อมูลน้อย</p>
      </Stat>

      <Stat
        icon={<Archive size={16} aria-hidden="true" />}
        title="เลยวันปิดรับแล้ว"
        value={closed.length ? `${closed.length} เวที` : 'ไม่มี'}
      >
        <Listings
          items={closed} empty="ไม่มีเวทีที่เลยกำหนด"
          label={(item) => `ปิดรับ ${formatDate(item.closesAt!)}`}
        />
        <p className="stat-note">ควรย้ายออกจากรายการหลัก แต่ยังเปิดหน้ารายละเอียดได้เพื่อไม่ให้ลิงก์เสีย</p>
      </Stat>
    </div>
  </>;
}
