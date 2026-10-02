import { useCallback, useEffect, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../data/auth';
import { useApi } from '../lib/useApi';
import type { MemberHire } from '../data/consult';
import { MemberHireActions } from '../components/ConsultFlow';
import { CHAT_CHANGED } from '../components/ChatPanel';
import { HireWorkspace } from '../components/HireWorkspace';
import { VerifyEmailNotice } from '../components/VerifyEmailNotice';
import { useI18n } from '../i18n';
import '../consult.css';

/* Consulting ของนักเรียน: งานที่จ้างทั้งหมด กับแชตของแต่ละงาน (ห้องเดียวต่อเมนเทอร์หนึ่งคน ใช้ซ้ำทุกงานของคู่นั้น)
   ลิงก์ลึก /consulting#room-<id ห้อง> หรือ #hire-<id งาน> เลือกงานนั้นให้เอง
   จำนวนข้อความที่ยังไม่อ่านมากับรายการ และอ่านใหม่ทุกครั้งที่แชตอ่านหรือส่งข้อความ */

type Payload = { emailVerified: boolean; paymentsOpen: boolean; items: MemberHire[] };

export function Consulting() {
  const { t } = useI18n();
  const s = t.consulting;
  const { user, loading: authLoading } = useAuth();
  const { data, error, loading, reload } = useApi<Payload>(user ? '/consult/mine' : null);

  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);
  // เมนเทอร์รับงานหรือสถานะอื่นเปลี่ยนในระหว่างที่หน้านี้เปิดอยู่ อ่านใหม่เป็นระยะตอนแท็บมองเห็น
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) reload(); }, 20_000);
    return () => clearInterval(timer);
  }, [reload]);
  // อ่านแล้วหรือส่งข้อความแล้ว จำนวนที่ยังไม่อ่านบนรายการต้องเปลี่ยนตาม
  useEffect(() => {
    window.addEventListener(CHAT_CHANGED, reload);
    return () => window.removeEventListener(CHAT_CHANGED, reload);
  }, [reload]);
  // ยืนยันอีเมลแล้วในอีกแท็บ ต้องอ่านรายการใหม่ ไม่อย่างนั้นปุ่มรีวิวยังค้างสถานะเดิม
  const verified = user?.emailVerified;
  const lastVerified = useRef(verified);
  useEffect(() => {
    if (lastVerified.current === verified) return;
    lastVerified.current = verified;
    reload();
  }, [verified, reload]);

  const reloadAsync = useCallback(async () => { reload(); }, [reload]);

  if (authLoading) return <main id="main" tabIndex={-1} className="shell page cx-page"><p className="side-note" role="status">{s.loading}</p></main>;
  if (!user) return <Navigate to="/signin?next=/consulting" replace />;

  const noteFor = (hire: MemberHire) => {
    const c = t.consult;
    switch (hire.status) {
      case 'requested': return c.requestedNote;
      case 'accepted': return c.acceptedNote(t.price.total(hire.price));
      case 'paid': return hire.disputedAt ? c.disputedNote : c.paidNote;
      case 'declined': return c.declinedNote;
      case 'cancelled': return c.cancelledNote;
      default: return hire.review ? null : c.completedNote;
    }
  };

  return <main id="main" tabIndex={-1} className="shell page cx-page cx-page--wide">
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

    {data && data.items.length > 0 && <HireWorkspace
      items={data.items}
      nameOf={(hire) => hire.mentor.name}
      initialOf={(hire) => hire.mentor.initial}
      reviewedOf={(hire) => Boolean(hire.review)}
      noteFor={noteFor}
      renderActions={(hire) => <MemberHireActions key={`${hire.id}-${hire.status}`} hire={hire} onChange={reloadAsync} paymentsOpen={data?.paymentsOpen ?? false}
        extra={<Link className="cx-link cx-link--text" to={`/mentors/${hire.mentor.id}${hire.competition ? `?competition=${encodeURIComponent(hire.competition.slug)}` : ''}`}
          aria-label={s.viewMentorOf(hire.mentor.name)}>{s.viewMentor}</Link>} />}
      labels={{ list: s.listLabel, back: s.backToList, detail: s.detailLabel, chat: s.chatTitle, noChat: (status) => (status === 'accepted' ? s.noChatPay : s.noChatYet) }}
      closedNote={s.chatClosedNote}
    />}
  </main>;
}
