import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../data/auth';
import { post } from '../lib/api';
import { consultError } from '../data/consult';
import type { ContactStatus } from '../data/consult';
import { useI18n } from '../i18n';
import { ConfirmAction, ReviewForm } from './ConsultFlow';
import '../consult.css';

/* ขั้นตอนหลังกด Contact Mentor ของนักเรียน (โหมดตัวกลาง: คุยกับเมนเทอร์นอกเว็บ) ใช้ทั้งหน้าโปรไฟล์เมนเทอร์และหน้า Consulting
   contacted → คุยกับเมนเทอร์ แล้วกด "ฉันได้รับคำแนะนำแล้ว" (ยกเลิกได้)
   claimed   → เราส่งอีเมลให้เมนเทอร์ยืนยันแล้ว รอ (ยกเลิกได้)
   completed → เมนเทอร์ยืนยันแล้ว รีวิวได้หนึ่งครั้ง
   denied    → เมนเทอร์ตอบว่าไม่ใช่ ไม่นับ (ถ้อยคำเป็นกลาง) ติดต่อใหม่ได้
   cancelled → จบ ติดต่อใหม่ได้
   ปุ่มที่กดแล้วหายไป (เช่น ฉันได้รับคำแนะนำแล้ว) ทำให้โฟกัสหลุด จึงย้ายโฟกัสกลับมาที่กล่องนี้หลังสถานะเปลี่ยน */

export type FlowContact = { id: string; status: ContactStatus; reviewed: boolean; stars?: number | null };

export function ContactStatusPill({ status, reviewed }: { status: ContactStatus; reviewed: boolean }) {
  const { t } = useI18n();
  // สีใช้ชุดเดียวกับป้ายสถานะงานจ้าง: contacted/claimed = ทอง completed = เขียว denied/cancelled = แดงอ่อน
  const tone = status === 'contacted' || status === 'claimed' ? 'requested' : status === 'completed' ? 'completed' : 'cancelled';
  return <span className={`cx-pill cx-pill--${tone}`}>
    {status === 'completed' && reviewed ? t.contact.reviewedPill : t.contact.status[status]}
  </span>;
}

/** viewLink: ลิงก์ของหน้า Consulting ("ดูเมนเทอร์และช่องทางติดต่อ") ใส่ในแถวปุ่มเดียวกัน ลำดับคือปุ่มหลัก → ลิงก์ → ยกเลิกชิดขวา
    collapseReview: หน้า Consulting ซ่อนฟอร์มรีวิวไว้หลังปุ่ม "เขียนรีวิว" หน้าโปรไฟล์เมนเทอร์แสดงฟอร์มเลย
    again: ลิงก์/ปุ่ม "ติดต่ออีกครั้ง" สำหรับสถานะที่จบแล้วโดยไม่ได้รีวิว (denied, cancelled) หน้าโปรไฟล์ใส่เป็นฟอร์มของตัวเอง */
export function ContactFlow({ contact, onChange, viewLink, again, collapseReview = false }: {
  contact: FlowContact; onChange: () => Promise<void> | void; viewLink?: ReactNode; again?: ReactNode; collapseReview?: boolean;
}) {
  const { t } = useI18n();
  const s = t.contact;
  const { user } = useAuth();
  const [busy, setBusy] = useState<'claim' | 'cancel' | null>(null);
  const [message, setMessage] = useState('');
  const [reviewOpen, setReviewOpen] = useState(!collapseReview);
  const rootRef = useRef<HTMLDivElement>(null);

  async function run(kind: 'claim' | 'cancel') {
    setBusy(kind);
    setMessage('');
    try {
      await post(`/consult/${contact.id}/${kind}`, {});
      await onChange();
      rootRef.current?.focus({ preventScroll: true });
    } catch (failure) {
      setMessage(consultError(failure, t));
    } finally {
      setBusy(null);
    }
  }

  const { status } = contact;
  const cancel = <ConfirmAction quiet trigger={s.cancel} question={s.cancelAsk} yes={s.cancelYes} no={s.cancelNo}
    busyLabel={s.cancelling} busy={busy === 'cancel'} danger onConfirm={() => run('cancel')} />;
  return <div className="cx-flow" ref={rootRef} tabIndex={-1}>
    {status === 'contacted' && <>
      <p>{s.contactedHelp}</p>
      <div className="cx-row cx-row--split">
        <button type="button" className="primary-button cx-button" disabled={busy !== null} onClick={() => { void run('claim'); }}>
          {busy === 'claim' ? s.claiming : s.claim}
        </button>
        {viewLink}{cancel}
      </div>
    </>}
    {status === 'claimed' && <>
      <p>{s.claimedNote}</p>
      <div className="cx-row cx-row--split">{viewLink}{cancel}</div>
    </>}
    {status === 'completed' && (contact.reviewed
      ? <>
        <p>{s.reviewedNote}{contact.stars ? ` ${s.yourRating(contact.stars)}.` : ''}</p>
        {viewLink && <div className="cx-row">{viewLink}</div>}
      </>
      : <>
        <p>{s.completedNote}</p>
        {!reviewOpen && <div className="cx-row">
          <button type="button" className="primary-button cx-button" onClick={() => setReviewOpen(true)}>{s.writeReview}</button>
          {viewLink}
        </div>}
        {reviewOpen && <ReviewForm id={contact.id} verified={Boolean(user?.emailVerified)}
          onDone={async () => { await onChange(); rootRef.current?.focus({ preventScroll: true }); }} />}
      </>)}
    {status === 'denied' && <>
      <p>{s.deniedNote}</p>
      {again && <div className="cx-row">{again}</div>}
    </>}
    {status === 'cancelled' && <>
      <p>{s.cancelledNote}</p>
      {again && <div className="cx-row">{again}</div>}
    </>}
    <p className="cx-message cx-message--error" role="alert">{message}</p>
  </div>;
}
