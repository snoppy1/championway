import { useEffect, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../data/auth';
import { useApi } from '../lib/useApi';
import type { ConsultStatus } from '../data/consult';
import { ConsultFlow, StatusPill } from '../components/ConsultFlow';
import { Avatar } from '../components/mentors';
import { VerifyEmailNotice } from '../components/VerifyEmailNotice';
import { useI18n } from '../i18n';
import { formatDate } from '../i18n/format';
import '../consult.css';

/* หน้า Consulting ของนักเรียน: เมนเทอร์ทุกคนที่เคยกดติดต่อ กับสถานะของแต่ละครั้ง
   ทำได้ทุกอย่างที่หน้าโปรไฟล์เมนเทอร์ทำได้ยกเว้นดูช่องทางติดต่อ ซึ่งอยู่ที่หน้าโปรไฟล์ของเมนเทอร์คนนั้น */

type Item = {
  id: string; status: ConsultStatus; createdAt: string; claimedAt: string | null; confirmedAt: string | null;
  mentor: { id: string; name: string; initial: string; specialty: string; verified: boolean };
  competition: { slug: string; name: string } | null;
  review: { stars: number } | null;
};
type Payload = { emailVerified: boolean; items: Item[] };

export function Consulting() {
  const { t, lang } = useI18n();
  const s = t.consulting;
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

  if (authLoading) return <main id="main" tabIndex={-1} className="shell page cx-page"><p className="side-note" role="status">{s.loading}</p></main>;
  if (!user) return <Navigate to="/signin?next=/consulting" replace />;

  const reloadAsync = async () => { reload(); };

  return <main id="main" tabIndex={-1} className="shell page cx-page">
    <header className="cx-page-head">
      <h1>{s.pageTitle}</h1>
      <p className="cx-lead">{s.lead}</p>
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
      {data.items.map((item) => <li className="panel cx-consult" key={item.id}>
        <div className="cx-consult__head">
          <Avatar initial={item.mentor.initial} plain />
          <div className="cx-consult__who">
            <h2><Link to={`/mentors/${item.mentor.id}${item.competition ? `?competition=${encodeURIComponent(item.competition.slug)}` : ''}`}
              aria-label={s.viewMentorOf(item.mentor.name)}>{item.mentor.name}</Link></h2>
            <p className="cx-hint">{item.competition ? `${s.about(item.competition.name)} · ` : ''}{s.startedOn(formatDate(item.createdAt, lang))}</p>
          </div>
          <StatusPill status={item.status} reviewed={Boolean(item.review)} />
        </div>
        {item.status === 'claimed' && item.claimedAt && <p className="cx-hint">{s.claimedOn(formatDate(item.claimedAt, lang))}</p>}
        {item.status === 'confirmed' && item.confirmedAt && <p className="cx-hint">{s.confirmedOn(formatDate(item.confirmedAt, lang))}</p>}
        <ConsultFlow consultation={{ id: item.id, status: item.status, reviewed: Boolean(item.review), stars: item.review?.stars }} onChange={reloadAsync} />
        {item.status !== 'cancelled' && <p><Link className="cx-link" to={`/mentors/${item.mentor.id}${item.competition ? `?competition=${encodeURIComponent(item.competition.slug)}` : ''}`}>
          {s.viewMentor}</Link></p>}
      </li>)}
    </ul>}
  </main>;
}
