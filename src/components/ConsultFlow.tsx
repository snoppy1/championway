import { useId, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../data/auth';
import { ApiError, post } from '../lib/api';
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

/** แจ้งปัญหาหลังจ่ายเงิน: ต้องเล่าเหตุผลก่อนส่ง เงินถูกพักไว้จนกว่าทีมงานตัดสิน แจ้งได้ครั้งเดียว */
function ReportProblem({ hireId, onDone }: { hireId: string; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const s = t.consult;
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) { setMessage(s.reportNeed); areaRef.current?.focus(); return; }
    setBusy(true);
    setMessage('');
    try {
      await post(`/consult/${hireId}/dispute`, { reason: reason.trim() });
      await onDone();
    } catch (failure) {
      setMessage(consultError(failure, t));
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" className="link-button cx-link cx-link--quiet"
      onClick={() => { setOpen(true); requestAnimationFrame(() => areaRef.current?.focus()); }}>{s.reportProblem}</button>;
  }
  return <form className="cx-confirm cx-report" onSubmit={(event) => { void send(event); }} noValidate>
    <label htmlFor={id}><strong>{s.reportAsk}</strong></label>
    <p className="cx-hint">{s.reportHint}</p>
    <textarea id={id} ref={areaRef} rows={3} maxLength={2000} value={reason} disabled={busy}
      onChange={(event) => { setReason(event.target.value); setMessage(''); }} />
    <p className="cx-message cx-message--error" role="alert">{message}</p>
    <div className="cx-row">
      <button className="ghost-button cx-button cx-button--danger" disabled={busy}>{busy ? s.reportSending : s.reportSend}</button>
      <button type="button" className="link-button cx-link" disabled={busy} onClick={() => { setOpen(false); setMessage(''); }}>{s.reportBack}</button>
    </div>
  </form>;
}

export function MemberHireActions({ hire, onChange, extra, paymentsOpen }: {
  hire: MemberHire; onChange: () => Promise<void> | void; extra?: ReactNode; paymentsOpen: boolean;
}) {
  const { t } = useI18n();
  const s = t.consult;
  const { user } = useAuth();
  const [busy, setBusy] = useState<'cancel' | 'complete' | 'pay' | null>(null);
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

  /* จ่ายเงิน: เซิร์ฟเวอร์สร้างรายการจ่ายจากยอดในแถวการจ้าง แล้วส่ง url ของหน้าจ่ายเงินมาให้เปิด
     (ตอนนี้เป็นหน้าจำลองของเรา เมื่อต่อ Opn จะเป็นหน้าของ Opn และกลับมาที่ /pay/return) */
  async function pay() {
    setBusy('pay');
    setMessage('');
    try {
      const result = await post<{ url: string }>(`/consult/${hire.id}/pay`, {});
      window.location.assign(result.url);
    } catch (failure) {
      setMessage(failure instanceof ApiError && failure.status === 409 ? s.errors.changed : s.payFailed);
      setBusy(null);
    }
  }

  const cancel = <ConfirmAction quiet trigger={s.cancel} question={s.cancelAsk} yes={s.cancelYes} no={s.cancelNo}
    busyLabel={s.cancelling} busy={busy === 'cancel'} danger onConfirm={() => run('cancel')} />;
  const { status } = hire;
  const done = async () => { await onChange(); rootRef.current?.focus({ preventScroll: true }); };
  return <div className="cx-actions" ref={rootRef} tabIndex={-1}>
    {status === 'requested' && <div className="cx-row">{extra}{cancel}</div>}
    {status === 'accepted' && <>
      {!paymentsOpen && <p className="cx-note">{s.paymentsClosed}</p>}
      <div className="cx-row">
        {paymentsOpen && <button type="button" className="primary-button cx-button" disabled={busy !== null} onClick={() => { void pay(); }}>
          {busy === 'pay' ? s.paying : s.pay(t.price.total(hire.price))}</button>}
        {extra}{cancel}
      </div>
    </>}
    {status === 'paid' && (hire.disputedAt
      ? (extra && <div className="cx-row">{extra}</div>)
      : <div className="cx-row">
        <ConfirmAction primary trigger={s.markDone} question={s.markDoneAsk} yes={s.markDoneYes} no={s.markDoneNo}
          busyLabel={s.markingDone} busy={busy === 'complete'} onConfirm={() => run('complete')} />
        {extra}
        <ReportProblem hireId={hire.id} onDone={done} />
      </div>)}
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
