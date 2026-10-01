import { useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../data/auth';
import { post } from '../lib/api';
import { consultError } from '../data/consult';
import type { MemberHire } from '../data/consult';
import { useI18n } from '../i18n';
import { StarIcon } from './mentors';
import { VerifyEmailNotice } from './VerifyEmailNotice';
import '../consult.css';

/* ปุ่มของนักเรียนบนงานจ้าง ใช้ใน Consulting
   requested → ยกเลิกได้ | accepted → กดเสร็จงาน (ถามก่อน) หรือยกเลิก | completed → เขียนรีวิวได้ครั้งเดียว
   declined / cancelled → จ้างอีกครั้งที่หน้าเมนเทอร์
   ปุ่มที่กดแล้วหายไป ทำให้โฟกัสหลุด จึงย้ายโฟกัสกลับมาที่กล่องนี้หลังสถานะเปลี่ยน */

/** ปุ่มที่ต้องถามก่อนทำ ถามในที่ ไม่เด้ง dialog ปุ่มเริ่มต้นที่โฟกัสคือ "ไม่" เพราะทำพลาดแล้วย้อนไม่ได้ */
function ConfirmAction({ trigger, question, yes, no, busyLabel, busy, danger = false, quiet = false, primary = false, onConfirm }: {
  trigger: string; question: string; yes: string; no: string; busyLabel: string; busy: boolean;
  danger?: boolean; quiet?: boolean; primary?: boolean; onConfirm: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const noRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  if (!asking) {
    return <button type="button" ref={openRef}
      className={quiet ? 'link-button cx-link cx-link--quiet' : primary ? 'primary-button cx-button' : 'ghost-button cx-button'} disabled={busy}
      onClick={() => { setAsking(true); requestAnimationFrame(() => noRef.current?.focus()); }}>{trigger}</button>;
  }
  return <div className="cx-confirm" role="group" aria-labelledby={titleId}>
    <p id={titleId}>{question}</p>
    <div className="cx-row">
      <button type="button" className={danger ? 'ghost-button cx-button cx-button--danger' : 'primary-button cx-button'} disabled={busy}
        onClick={() => { void onConfirm(); }}>{busy ? busyLabel : yes}</button>
      <button type="button" ref={noRef} className="ghost-button cx-button" disabled={busy}
        onClick={() => { setAsking(false); requestAnimationFrame(() => openRef.current?.focus()); }}>{no}</button>
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

export function MemberHireActions({ hire, onChange, extra }: {
  hire: MemberHire; onChange: () => Promise<void> | void; extra?: ReactNode;
}) {
  const { t } = useI18n();
  const s = t.consult;
  const { user } = useAuth();
  const [busy, setBusy] = useState<'cancel' | 'complete' | null>(null);
  const [message, setMessage] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  async function run(kind: 'cancel' | 'complete') {
    setBusy(kind);
    setMessage('');
    try {
      await post(`/consult/${hire.id}/${kind}`, {});
      await onChange();
      rootRef.current?.focus({ preventScroll: true });
    } catch (failure) {
      setMessage(consultError(failure, t));
    } finally {
      setBusy(null);
    }
  }

  const cancel = <ConfirmAction quiet trigger={s.cancel} question={s.cancelAsk} yes={s.cancelYes} no={s.cancelNo}
    busyLabel={s.cancelling} busy={busy === 'cancel'} danger onConfirm={() => run('cancel')} />;
  const { status } = hire;
  return <div className="cx-actions" ref={rootRef} tabIndex={-1}>
    {status === 'requested' && <div className="cx-row">{extra}{cancel}</div>}
    {status === 'accepted' && <div className="cx-row">
      <ConfirmAction primary trigger={s.markDone} question={s.markDoneAsk} yes={s.markDoneYes} no={s.markDoneNo}
        busyLabel={s.markingDone} busy={busy === 'complete'} onConfirm={() => run('complete')} />
      {extra}{cancel}
    </div>}
    {status === 'completed' && (hire.review
      ? <>
        <p>{s.reviewedNote} {s.yourRating(hire.review.stars)}.</p>
        {extra && <div className="cx-row">{extra}</div>}
      </>
      : <>
        {!reviewOpen && <div className="cx-row">
          <button type="button" className="primary-button cx-button" onClick={() => setReviewOpen(true)}>{s.writeReview}</button>
          {extra}
        </div>}
        {reviewOpen && <ReviewForm id={hire.id} verified={Boolean(user?.emailVerified)}
          onDone={async () => { await onChange(); rootRef.current?.focus({ preventScroll: true }); }} />}
      </>)}
    {(status === 'declined' || status === 'cancelled') && <div className="cx-row">
      <Link className="ghost-button cx-button" to={`/mentors/${hire.mentor.id}${hire.competition ? `?competition=${encodeURIComponent(hire.competition.slug)}` : ''}`}>{s.hireAgain}</Link>
      {extra}
    </div>}
    <p className="cx-message cx-message--error" role="alert">{message}</p>
  </div>;
}

export { ConfirmAction };
