import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAuth } from '../data/auth';
import { post } from '../lib/api';
import { consultError } from '../data/consult';
import type { ConsultStatus } from '../data/consult';
import { useI18n } from '../i18n';
import { StarIcon } from './mentors';
import { VerifyEmailNotice } from './VerifyEmailNotice';
import '../consult.css';

/* ขั้นตอนหลังกด Contact Mentor ของนักเรียน ใช้ทั้งในหน้าโปรไฟล์เมนเทอร์และหน้า Consulting
   active  → คุยกับเมนเทอร์นอกเว็บ แล้วกด "I received guidance" (ยกเลิกได้)
   claimed → เราส่งอีเมลให้เมนเทอร์ยืนยันแล้ว รอ (ยกเลิกได้)
   confirmed → เมนเทอร์ยืนยันแล้ว รีวิวได้หนึ่งครั้ง
   cancelled → จบ ติดต่อใหม่ได้ที่หน้าโปรไฟล์เมนเทอร์
   ปุ่มที่กดแล้วหายไป (เช่น I received guidance) ทำให้โฟกัสหลุด จึงย้ายโฟกัสกลับมาที่กล่องนี้หลังสถานะเปลี่ยน */

export type FlowConsultation = { id: string; status: ConsultStatus; reviewed: boolean; stars?: number | null };

export function StatusPill({ status, reviewed }: { status: ConsultStatus; reviewed: boolean }) {
  const { t } = useI18n();
  return <span className={`cx-pill cx-pill--${status}`}>
    {status === 'confirmed' && reviewed ? t.consult.reviewedPill : t.consult.status[status]}
  </span>;
}

function CancelControl({ busy, onCancel }: { busy: boolean; onCancel: () => Promise<void> }) {
  const { t } = useI18n();
  const s = t.consult;
  const [asking, setAsking] = useState(false);
  const askRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  if (!asking) {
    return <button type="button" ref={openRef} className="link-button cx-link cx-link--danger" disabled={busy}
      onClick={() => { setAsking(true); requestAnimationFrame(() => askRef.current?.focus()); }}>{s.cancel}</button>;
  }
  // ยืนยันในที่ ไม่เด้ง dialog: ถามหนึ่งครั้งพอ เพราะกดผิดก็แค่ติดต่อเมนเทอร์ใหม่ได้
  return <div className="cx-confirm" role="group" aria-labelledby={titleId}>
    <p id={titleId}>{s.cancelAsk}</p>
    <div className="cx-row">
      <button type="button" className="ghost-button cx-button cx-button--danger" disabled={busy} onClick={() => { void onCancel(); }}>
        {busy ? s.cancelling : s.cancelYes}
      </button>
      <button type="button" ref={askRef} className="ghost-button cx-button" disabled={busy}
        onClick={() => { setAsking(false); requestAnimationFrame(() => openRef.current?.focus()); }}>{s.cancelNo}</button>
    </div>
  </div>;
}

function ReviewForm({ id, verified, onDone }: { id: string; verified: boolean; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const s = t.consult;
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const hintId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (stars < 1) {
      setMessage(s.needStars);
      formRef.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await post(`/consult/${id}/review`, { stars, comment });
      await onDone();
    } catch (failure) {
      setMessage(consultError(failure, t));
      setBusy(false);
    }
  }

  return <form className="cx-review" ref={formRef} onSubmit={(event) => { void submit(event); }} noValidate>
    <h3>{s.reviewTitle}</h3>
    {!verified && <VerifyEmailNotice />}
    <fieldset className="cx-stars" disabled={busy || !verified}>
      <legend>{s.ratingLegend}</legend>
      <div className="cx-stars__row">
        {[1, 2, 3, 4, 5].map((value) => <label key={value} className={value <= stars ? 'cx-star is-on' : 'cx-star'}>
          <input type="radio" name={`stars-${id}`} value={value} checked={stars === value} onChange={() => { setStars(value); setMessage(''); }} />
          <span className="cx-star__glyph" aria-hidden="true"><StarIcon /></span>
          <span className="cx-star__number" aria-hidden="true">{value}</span>
          <span className="sr-only">{t.rating.stars(value)}</span>
        </label>)}
      </div>
    </fieldset>
    <div className="cx-field">
      <label htmlFor={`review-comment-${id}`}>{s.comment}</label>
      <textarea id={`review-comment-${id}`} rows={4} maxLength={1000} value={comment} disabled={busy || !verified}
        aria-describedby={hintId} onChange={(event) => setComment(event.target.value)} />
      <p className="cx-hint" id={hintId}>{s.commentHint}</p>
    </div>
    <p className="cx-message cx-message--error" role="alert">{message}</p>
    <button className="primary-button cx-button" disabled={busy || !verified}>{busy ? s.submittingReview : s.submitReview}</button>
  </form>;
}

export function ConsultFlow({ consultation, onChange }: { consultation: FlowConsultation; onChange: () => Promise<void> | void }) {
  const { t } = useI18n();
  const s = t.consult;
  const { user } = useAuth();
  const [busy, setBusy] = useState<'claim' | 'cancel' | null>(null);
  const [message, setMessage] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  async function run(kind: 'claim' | 'cancel') {
    setBusy(kind);
    setMessage('');
    try {
      await post(`/consult/${consultation.id}/${kind}`, {});
      await onChange();
      rootRef.current?.focus({ preventScroll: true });
    } catch (failure) {
      setMessage(consultError(failure, t));
    } finally {
      setBusy(null);
    }
  }

  const { status } = consultation;
  return <div className="cx-flow" ref={rootRef} tabIndex={-1}>
    {status === 'active' && <>
      <p>{s.claimHelp}</p>
      <div className="cx-row">
        <button type="button" className="primary-button cx-button" disabled={busy !== null} onClick={() => { void run('claim'); }}>
          {busy === 'claim' ? s.claiming : s.claim}
        </button>
        <CancelControl busy={busy === 'cancel'} onCancel={() => run('cancel')} />
      </div>
    </>}
    {status === 'claimed' && <>
      <p>{s.claimedNote}</p>
      <CancelControl busy={busy === 'cancel'} onCancel={() => run('cancel')} />
    </>}
    {status === 'confirmed' && (consultation.reviewed
      ? <p>{s.reviewedNote}{consultation.stars ? ` ${s.yourRating(consultation.stars)}.` : ''}</p>
      : <>
        <p>{s.confirmedNote}</p>
        <ReviewForm id={consultation.id} verified={Boolean(user?.emailVerified)} onDone={async () => { await onChange(); rootRef.current?.focus({ preventScroll: true }); }} />
      </>)}
    {status === 'cancelled' && <p>{s.cancelledNote}</p>}
    <p className="cx-message cx-message--error" role="alert">{message}</p>
  </div>;
}
