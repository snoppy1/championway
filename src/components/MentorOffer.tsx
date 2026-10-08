import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../data/auth';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useI18n } from '../i18n';
import { consultError, priceDraft, pricePayload, priceProblem } from '../data/consult';
import type { Price } from '../data/consult';
import { PriceFields, samePrice } from './PriceFields';
import { ClaimForm } from './MentorClaim';

/* กล่องสำหรับเมนเทอร์บนหน้าเวที (ผู้ใช้ขอ 9 ต.ค. 2569) คนที่ไม่ใช่เมนเทอร์ไม่เห็นอะไรเลย
   รับปรึกษาอยู่ → แก้ราคา · ตรวจผลงานแล้ว → ตั้งราคาแล้วขึ้นทันที · รอตรวจ → บอกสถานะ · ยังไม่มีผลงาน → ส่งหลักฐาน */

type State = { mentor: false } | { mentor: true; state: 'helping' | 'eligible' | 'pending' | 'none'; price: number | null; unit: string };

export function MentorOffer({ slug, name, onChanged }: { slug: string; name: string; onChanged: () => void }) {
  const { user } = useAuth();
  const { data, reload } = useApi<State>(user ? `/consult/zone/competitions/${encodeURIComponent(slug)}` : null);
  if (!data?.mentor) return null;
  return <MentorOfferBox key={`${data.state}-${data.price}-${data.unit}`} slug={slug} name={name} state={data}
    onChanged={() => { reload(); onChanged(); }} />;
}

function MentorOfferBox({ slug, name, state, onChanged }: {
  slug: string; name: string; state: Extract<State, { mentor: true }>; onChanged: () => void;
}) {
  const { t } = useI18n();
  const s = t.mentorClaim;
  const uid = useId();
  const saved = priceDraft(state.price, state.unit);
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState<Price>(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const openRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const close = () => { setOpen(false); setError(''); requestAnimationFrame(() => openRef.current?.focus()); };
  const done = (message: string) => { setNote(message); setOpen(false); onChanged(); titleRef.current?.focus(); };

  async function save(event: FormEvent) {
    event.preventDefault();
    const problem = priceProblem(price);
    if (problem) { setError(t.price.errors[problem]); return; }
    setBusy(true);
    setError('');
    try {
      await api(`/consult/zone/competitions/${encodeURIComponent(slug)}`, { method: 'PUT', body: JSON.stringify(pricePayload(price)) });
      done(state.state === 'helping' ? s.saved : s.added);
    } catch (failure) {
      setError(consultError(failure, t, 'mentor'));
    } finally {
      setBusy(false);
    }
  }

  const lead = { helping: s.helpingPrice(t.price.line(state.price, null, state.unit)), eligible: s.eligibleLead, pending: s.pendingLead, none: s.noneLead }[state.state];
  const button = state.state === 'helping' ? s.editPrice : s.offer;

  return <section className="mentor-offer" aria-labelledby={`${uid}-title`}>
    <h3 id={`${uid}-title`} tabIndex={-1} ref={titleRef}>{state.state === 'helping' ? s.helping : s.boxTitle}</h3>
    <p className="mentor-offer__lead">{lead}</p>
    <p className="cx-message cx-message--ok" role="status">{note}</p>
    {state.state !== 'pending' && !open && <div className="cx-row">
      <button type="button" ref={openRef} className={state.state === 'helping' ? 'ghost-button cx-button' : 'primary-button cx-button'}
        onClick={() => { setOpen(true); setNote(''); }}>{button}</button>
      <Link className="cx-link cx-link--text" to="/mentor-zone#competitions">{s.manage}</Link>
    </div>}
    {state.state === 'pending' && <p><Link className="cx-link cx-link--text" to="/mentor-zone#competitions">{s.manage}</Link></p>}
    {open && (state.state === 'none'
      ? <ClaimForm slug={slug} name={name} onSent={done} onCancel={close} />
      : <form className="cx-competition__form" onSubmit={(event) => { void save(event); }} noValidate>
        <PriceFields idPrefix={uid} value={price} disabled={busy} label={t.price.modeLabel(name)} onChange={(next) => { setPrice(next); setError(''); }} />
        <div className="cx-row">
          <button className="primary-button cx-button" disabled={busy || (state.state === 'helping' && samePrice(price, saved))}>
            {busy ? s.saving : state.state === 'helping' ? t.mentorZone.save : s.confirm}
          </button>
          <button type="button" className="link-button cx-link cx-link--quiet" disabled={busy} onClick={close}>{s.cancel}</button>
        </div>
        <p className="cx-message cx-message--error" role="alert">{error}</p>
      </form>)}
  </section>;
}
