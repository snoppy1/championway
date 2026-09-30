import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Archive, CalendarClock, CircleAlert, ClipboardList, FlaskConical } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDate } from '../../data/competitions';
import { useApi } from '../../lib/useApi';
import { ApiError, post } from '../../lib/api';
import { useAuth } from '../../data/auth';

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

type DemoStatus = {
  enabled: boolean;
  present?: { risingStar: number; competitions: number; mentors: number; competitionSubmissions: number; mentorSubmissions: number };
  totals?: { risingStar: number; competitions: number; mentors: number; competitionSubmissions: number; mentorSubmissions: number };
};

/* ปุ่มเปิด/ลบข้อมูลตัวอย่าง ขึ้นเฉพาะบนเว็บ dev (ในเครื่องและ Preview)
   บน Production เซิร์ฟเวอร์ตอบ enabled: false ส่วนนี้จึงไม่แสดงเลย และ API ปฏิเสธเองอีกชั้น
   ใส่ซ้ำได้ไม่สร้างรายการซ้ำ ลบแล้วเหลือเฉพาะข้อมูลที่ทีมกรอกเอง */
function DemoPanel() {
  const { user } = useAuth();
  const { data, reload } = useApi<DemoStatus>('/admin/demo');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  if (!data?.enabled || !data.present || !data.totals) return null;

  const { present, totals } = data;
  const isAdmin = user?.role === 'admin';
  const loaded = present.risingStar + present.competitions + present.mentors + present.competitionSubmissions + present.mentorSubmissions;
  const all = totals.risingStar + totals.competitions + totals.mentors + totals.competitionSubmissions + totals.mentorSubmissions;

  async function run(action: 'load' | 'clear') {
    if (action === 'clear' && !window.confirm('ลบข้อมูลตัวอย่างทั้งหมด รวมการจองที่ทำไว้บนเวทีหรือเมนเทอร์ตัวอย่าง? ข้อมูลที่ทีมกรอกเองไม่ถูกลบ')) return;
    setBusy(true);
    setMessage('');
    try {
      await post(`/admin/demo/${action}`, {});
      setMessage(action === 'load' ? 'ใส่ข้อมูลตัวอย่างแล้ว' : 'ลบข้อมูลตัวอย่างแล้ว');
      reload();
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : 'ทำไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-block demo-panel" aria-labelledby="demo-title">
    <h2 id="demo-title"><FlaskConical size={16} aria-hidden="true" />ข้อมูลตัวอย่าง <span className="status-pill is-info">เฉพาะเว็บ dev</span></h2>
    <p className="admin-muted">
      เวที เมนเทอร์ และใบสมัครสมมติ ไว้ลองใช้งานและถ่ายภาพหน้าจอ ส่วนนี้ไม่มีบนเว็บจริง
    </p>
    <p>
      มีอยู่ตอนนี้ {loaded} จาก {all} รายการ · เวที {present.competitions}/{totals.competitions} ·
      เมนเทอร์ {present.mentors}/{totals.mentors} · ใบลงงาน {present.competitionSubmissions}/{totals.competitionSubmissions} ·
      ใบสมัครเมนเทอร์ {present.mentorSubmissions}/{totals.mentorSubmissions} ·
      อันดับ Rising Star {present.risingStar ? 'มีแล้ว' : 'ยังไม่มี'}
    </p>
    {isAdmin ? <p className="demo-actions">
      <button type="button" className="ghost-button" disabled={busy || loaded === all} onClick={() => run('load')}>
        {busy ? 'กำลังทำ…' : 'เปิดข้อมูลตัวอย่าง'}
      </button>
      <button type="button" className="danger-button" disabled={busy || loaded === 0} onClick={() => run('clear')}>
        ลบข้อมูลตัวอย่าง
      </button>
    </p> : <p className="admin-muted">เฉพาะผู้ดูแล (admin) เท่านั้นที่เปิดหรือลบได้</p>}
    <p className="admin-message" role="status">{message}</p>
  </section>;
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

    <DemoPanel />
  </>;
}
