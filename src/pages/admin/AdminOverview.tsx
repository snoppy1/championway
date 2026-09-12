import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, ClipboardList, CircleAlert, Archive } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDate, formatDeadline } from '../../data/competitions';
import {
  REVIEW_TARGET_DAYS, STALE_AFTER_DAYS, alreadyClosed, byWaiting, closingSoon,
  competitionSubmissions, mentorSubmissions, pendingOf, staleListings, waitingDays,
} from '../../data/submissions';

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

export function AdminOverview() {
  const waiting = byWaiting(pendingOf(competitionSubmissions));
  const waitingMentors = byWaiting(pendingOf(mentorSubmissions));
  const queue = [...waiting, ...waitingMentors];
  const oldest = queue.length ? Math.max(...queue.map(waitingDays)) : 0;
  const soon = closingSoon();
  const stale = staleListings();
  const closed = alreadyClosed();

  return <>
    <header className="admin-page-head">
      <h1>ภาพรวม</h1>
      <p className="admin-muted">สี่เรื่องที่ต้องตัดสินใจวันนี้ ถ้าไม่มีอะไรค้าง ตัวเลขจะบอกว่าไม่มี</p>
    </header>

    <div className="stat-grid">
      <Stat
        icon={<ClipboardList size={16} aria-hidden="true" />}
        title="ใบที่รอตรวจ"
        value={queue.length ? `${queue.length} ใบ` : 'ไม่มี'}
        tone={oldest > REVIEW_TARGET_DAYS ? 'warn' : undefined}
      >
        {queue.length > 0
          ? <p>ใบเก่าสุดรอมาแล้ว {oldest} วัน {oldest > REVIEW_TARGET_DAYS
            ? <b>เกินเป้าหมาย {REVIEW_TARGET_DAYS} วันทำการ</b>
            : `ยังอยู่ในเป้าหมาย ${REVIEW_TARGET_DAYS} วันทำการ`}</p>
          : <p>ไม่มีใบค้างในคิว</p>}
        <p className="stat-links">
          <Link className="detail-link" to="/admin/competitions">งานแข่ง {waiting.length} ใบ<ArrowRight size={14} aria-hidden="true" /></Link>
          <Link className="detail-link" to="/admin/mentors">เมนเทอร์ {waitingMentors.length} ใบ<ArrowRight size={14} aria-hidden="true" /></Link>
        </p>
      </Stat>

      <Stat
        icon={<CalendarClock size={16} aria-hidden="true" />}
        title="ปิดรับใน 7 วัน"
        value={soon.length ? `${soon.length} เวที` : 'ไม่มี'}
      >
        {soon.length > 0
          ? <ul className="stat-list">
            {soon.map((item) => <li key={item.slug}>
              <Link to={`/competitions/${item.slug}`}>{item.name}</Link>
              <span className="admin-muted">ปิดรับ {formatDeadline(item)}</span>
            </li>)}
          </ul>
          : <p>ไม่มีเวทีที่ใกล้ปิดรับ</p>}
        <p className="stat-note">กลุ่มนี้ต้องยืนยันกับผู้จัดก่อนถึงกำหนด</p>
      </Stat>

      <Stat
        icon={<CircleAlert size={16} aria-hidden="true" />}
        title={`ไม่ได้ตรวจเกิน ${STALE_AFTER_DAYS} วัน`}
        value={stale.length ? `${stale.length} เวที` : 'ไม่มี'}
        tone={stale.length ? 'warn' : undefined}
      >
        {stale.length > 0
          ? <ul className="stat-list">
            {stale.map((item) => <li key={item.slug}>
              <Link to={`/competitions/${item.slug}`}>{item.name}</Link>
              <span className="admin-muted">ตรวจล่าสุด {formatDate(item.lastVerifiedAt)}</span>
            </li>)}
          </ul>
          : <p>ทุกเวทีที่ทีมงานคัดมาเองยังอยู่ในรอบตรวจ</p>}
        <p className="stat-note">เฉพาะเวทีที่ทีมงานคัดมาเอง ข้อมูลค้างแย่กว่าข้อมูลน้อย</p>
      </Stat>

      <Stat
        icon={<Archive size={16} aria-hidden="true" />}
        title="เลยวันปิดรับแล้ว"
        value={closed.length ? `${closed.length} เวที` : 'ไม่มี'}
      >
        {closed.length > 0
          ? <ul className="stat-list">
            {closed.map((item) => <li key={item.slug}>
              <Link to={`/competitions/${item.slug}`}>{item.name}</Link>
              <span className="admin-muted">ปิดรับ {formatDeadline(item)}</span>
            </li>)}
          </ul>
          : <p>ไม่มีเวทีที่เลยกำหนด</p>}
        <p className="stat-note">ควรย้ายออกจากรายการหลัก แต่ยังเปิดหน้ารายละเอียดได้เพื่อไม่ให้ลิงก์เสีย</p>
      </Stat>
    </div>
  </>;
}
