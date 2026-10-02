import { useEffect, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../data/auth';
import { useApi } from '../lib/useApi';
import type { ContactStatus } from '../data/consult';
import { ContactFlow, ContactStatusPill } from '../components/ContactFlow';
import { ContactSteps } from '../components/hire';
import { Avatar } from '../components/mentors';
import { VerifyEmailNotice } from '../components/VerifyEmailNotice';
import { useI18n } from '../i18n';
import { nb } from '../components/nb';
import { formatDate } from '../i18n/format';
import '../consult.css';

/* Consulting ของนักเรียนในโหมดตัวกลาง: เมนเทอร์ทุกคนที่เคยกดติดต่อ กับสถานะและปุ่มถัดไปของแต่ละคน
   ทำได้ทุกอย่างที่หน้าโปรไฟล์เมนเทอร์ทำได้ ยกเว้นดูช่องทางติดต่อ ซึ่งอยู่ที่โปรไฟล์ของเมนเทอร์คนนั้น (ลิงก์อยู่ในการ์ด)
   ลิงก์ในอีเมลพามาที่ #hire-<id> เลื่อนไปที่รายการนั้นให้เอง */

type Item = {
  id: string; status: ContactStatus; createdAt: string; claimedAt: string | null; completedAt: string | null;
  mentor: { id: string; name: string; initial: string; specialty: string; verified: boolean };
  competition: { slug: string; name: string } | null;
  review: { stars: number } | null;
};
type Payload = { emailVerified: boolean; items: Item[] };

export function ContactConsulting() {
  const { t, lang } = useI18n();
  const s = t.contact.consulting;
  const { user, loading: authLoading } = useAuth();
  const { data, error, loading, reload } = useApi<Payload>(user ? '/consult/mine' : null);

  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);
  // ยืนยันอีเมลแล้วในอีกแท็บ ต้องอ่านรายการใหม่ ไม่อย่างนั้นช่องรีวิวยังค้างสถานะเดิม
  const verified = user?.emailVerified;
  const lastVerified = useRef(verified);
  useEffect(() => {
    if (lastVerified.current === verified) return;
    lastVerified.current = verified;
    reload();
  }, [verified, reload]);
  // ลิงก์จากอีเมลพามาที่รายการนั้นโดยตรง
  const scrolled = useRef(false);
  useEffect(() => {
    if (!data || scrolled.current) return;
    const id = /^#hire-(.+)$/.exec(window.location.hash)?.[1];
    if (!id) return;
    scrolled.current = true;
    requestAnimationFrame(() => document.getElementById(`hire-${id}`)?.scrollIntoView({ block: 'start' }));
  }, [data]);

  if (authLoading) return <main id="main" tabIndex={-1} className="shell page cx-page"><p className="side-note" role="status">{s.loading}</p></main>;
  if (!user) return <Navigate to="/signin?next=/consulting" replace />;

  const reloadAsync = async () => { reload(); };

  return <main id="main" tabIndex={-1} className="shell page cx-page">
    <header className="cx-page-head">
      <h1>{s.pageTitle}</h1>
      <p className="cx-lead">{nb(s.lead)}</p>
    </header>

    <VerifyEmailNotice />

    {loading && !data && <p className="side-note" role="status">{s.loading}</p>}
    {error && !data && <div className="cx-state cx-state--error" role="alert">
      <h2>{s.errorTitle}</h2>
      <p>{error}</p>
      <button type="button" className="ghost-button cx-button" onClick={reload}>{s.retry}</button>
    </div>}

    {data && data.items.length === 0 && <div className="cx-state">
      <h2>{s.emptyTitle}</h2>
      <p>{s.emptyText}</p>
      <Link className="primary-button cx-button" to="/explore">{s.emptyCta}</Link>
    </div>}

    {data && data.items.length > 0 && <ul className="cx-consults" aria-label={s.listLabel}>
      {data.items.map((item) => {
        const to = `/mentors/${item.mentor.id}${item.competition ? `?competition=${encodeURIComponent(item.competition.slug)}` : ''}`;
        const stamp = item.status === 'contacted' ? s.stampContacted(formatDate(item.createdAt, lang))
          : item.status === 'claimed' ? s.stampClaimed(formatDate(item.claimedAt ?? item.createdAt, lang))
            : item.status === 'completed' ? s.stampCompleted(formatDate(item.completedAt ?? item.createdAt, lang)) : null;
        const link = <Link className="cx-link cx-link--text" to={to} aria-label={s.viewMentorOf(item.mentor.name)}>{s.viewMentor}</Link>;
        return <li className="panel cx-consult" key={item.id} id={`hire-${item.id}`}>
          <Avatar initial={item.mentor.initial} plain />
          <div className="cx-consult__body">
            <div className="cx-consult__title">
              <h2><Link to={to} aria-label={s.viewMentorOf(item.mentor.name)}>{item.mentor.name}</Link></h2>
              {/* สัญญาณสถานะอันเดียว: จอแคบเป็นป้าย (กับแถบความคืบหน้า) จอกว้างมีบรรทัดขั้นตอนอยู่แล้ว ป้ายจึงเป็นเวลาที่เกิดขึ้น
                  สถานะที่จบแบบไม่สำเร็จไม่มีบรรทัดขั้นตอน จึงใช้ป้ายทุกขนาดจอ */}
              <span className={stamp ? 'cx-consult__pill' : undefined}><ContactStatusPill status={item.status} reviewed={Boolean(item.review)} /></span>
              {stamp && <span className="cx-consult__stamp">{stamp}</span>}
            </div>
            <p className="cx-hint">{item.competition ? `${s.about(item.competition.name)} · ` : ''}{s.startedOn(formatDate(item.createdAt, lang))}</p>
            <ContactSteps barOnly status={item.status === 'denied' || item.status === 'cancelled' ? null : item.status} reviewed={Boolean(item.review)} />
            <ContactFlow
              contact={{ id: item.id, status: item.status, reviewed: Boolean(item.review), stars: item.review?.stars }}
              onChange={reloadAsync} collapseReview
              viewLink={link}
              again={<Link className="ghost-button cx-button" to={to}>{t.contact.contactAgain}</Link>}
            />
          </div>
        </li>;
      })}
    </ul>}
  </main>;
}
