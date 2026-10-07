import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, CalendarClock, X } from 'lucide-react';
import { post } from '../lib/api';
import { useApi } from '../lib/useApi';
import { consultError, hireTotal } from '../data/consult';
import type { Contacts, HireStatus, MentorCard, Rating as RatingValue } from '../data/consult';
import { useHiring } from '../data/hiring';
import { HireSteps } from '../components/hire';
import { ContactPanel } from '../components/ContactPanel';
import { Avatar, Rating, RisingStarPill, StarIcon } from '../components/mentors';
import { VerifyEmailNotice } from '../components/VerifyEmailNotice';
import { useAuth } from '../data/auth';
import { useI18n } from '../i18n';
import { formatDate, formatDateTime, formatInputDate } from '../i18n/format';
import '../consult.css';

/* โปรไฟล์เมนเทอร์สาธารณะ กับฟอร์มจ้าง (1 ต.ค. 2569: จ้างผ่านเว็บและคุยในแชตของเว็บ)
   นักเรียนเลือกเวทีที่เมนเทอร์เปิดรับ ใส่จำนวนชั่วโมง เวลาที่อยากนัด และสิ่งที่อยากให้ช่วย → เห็นราคารวมสด → ส่งคำขอ
   เมนเทอร์รับ → ห้องแชตเปิด (อยู่ในหน้า Consulting) หน้านี้ไม่มีแชต แค่บอกว่างานอยู่ขั้นไหนและพาไปต่อ
   ราคารวมที่แสดงเป็นแค่ตัวช่วยดู เซิร์ฟเวอร์คิดจากราคาที่เมนเทอร์ตั้งไว้เองเสมอ
   ขั้นชำระเงินและปุ่มเข้าห้องวิดีโอจะมาเติมในบรรทัดขั้นตอนและแถวปุ่มของการ์ดงานโดยไม่ต้องจัดหน้าใหม่ */

type Offer = { slug: string; name: string; closesAt: string; price: number | null; minutes: number | null; unit: string };
type Payload = {
  mentor: MentorCard & {
    bio: string; experience: string; best: string; cannot: string;
    risingStar: boolean; rating: RatingValue; allTime: RatingValue;
    price: number | null; minutes: number | null; unit: string;
  };
  competitions: Offer[];
  reviews: { stars: number; comment: string; createdAt: string; name: string }[];
  viewer: null | { signedIn: boolean; emailVerified: boolean; isSelf: boolean };
  hire: null | { id: string; status: HireStatus; reviewed: boolean; roomId: string | null };
  /** ช่องทางติดต่อ: ส่งมาเฉพาะโหมดตัวกลางและเฉพาะคนที่ยืนยันอีเมลแล้วและเคยกดติดต่อ */
  contacts: Contacts | null;
};

function StarsRow({ stars }: { stars: number }) {
  const { t } = useI18n();
  return <span className="cx-stars-row">
    <span aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= stars ? 'is-on' : ''}><StarIcon /></span>)}</span>
    <span className="sr-only">{t.rating.outOf(stars)}</span>
  </span>;
}

/** เวลาที่อยากนัดเป็นเวลาไทยเสมอ ไม่ใช้เขตเวลาของเครื่อง (ช่อง datetime-local ไม่มีเขตเวลา) */
const toIso = (local: string) => new Date(`${local}+07:00`).toISOString();

/* ช่องวันเวลาที่ข้อความที่เห็นเป็นรูปแบบของภาษาที่เลือก (ไม่ใช่ mm/dd/yyyy ของเบราว์เซอร์)
   ใต้ปุ่มมี <input type="datetime-local"> จริงซ่อนไว้ ปุ่มเปิดตัวเลือกวันเวลาของเบราว์เซอร์ด้วย showPicker()
   ค่าเก็บเป็นเวลาไทย (YYYY-MM-DDTHH:mm) เหมือนช่องเดิม เบราว์เซอร์ที่ไม่มี showPicker ให้พิมพ์ในช่องจริงได้เอง */
function DateTimeField({ id, value, onChange, disabled, label, hintId, inputRef }: {
  id: string; value: string; onChange: (value: string) => void; disabled: boolean; label: string; hintId: string;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const { t, lang } = useI18n();
  const s = t.mentorProfile;
  const text = value ? formatDateTime(new Date(`${value}+07:00`).toISOString(), lang) : s.whenPlaceholder;
  return <div className="cx-datetime">
    <button type="button" id={id} className={value ? 'cx-datetime__button' : 'cx-datetime__button is-empty'} disabled={disabled}
      aria-describedby={hintId} aria-label={`${label}: ${text}`}
      onClick={() => { try { inputRef.current?.showPicker(); } catch { inputRef.current?.focus(); } }}>
      <CalendarClock size={18} aria-hidden="true" /><span>{text}</span>
    </button>
    {value && <button type="button" className="cx-datetime__clear" disabled={disabled} aria-label={s.whenClear} onClick={() => onChange('')}>
      <X size={16} aria-hidden="true" /></button>}
    <input ref={inputRef} type="datetime-local" className="cx-datetime__native" tabIndex={-1} aria-hidden="true" value={value}
      disabled={disabled} onChange={(event) => onChange(event.target.value)} />
  </div>;
}

function HireForm({ mentorId, offers, initial, onDone }: { mentorId: string; offers: Offer[]; initial: string; onDone: () => Promise<void> }) {
  const { t } = useI18n();
  const s = t.mentorProfile;
  const [slug, setSlug] = useState(offers.some((offer) => offer.slug === initial) ? initial : offers[0].slug);
  const [hours, setHours] = useState('1');
  const [when, setWhen] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const hoursRef = useRef<HTMLInputElement>(null);
  const whenRef = useRef<HTMLInputElement | null>(null);
  const uid = useId();

  const offer = offers.find((item) => item.slug === slug)!;
  const count = Number(hours);
  const validHours = hours.trim() !== '' && Number.isInteger(count) && count >= 1 && count <= 10;
  const total = useMemo(
    () => (validHours && offer.price !== null && offer.minutes ? hireTotal(offer.price, offer.minutes, count) : null),
    [validHours, offer, count],
  );
  const rate = t.price.line(offer.price, offer.minutes, offer.unit);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const fail = (text: string, focus?: HTMLElement | null) => { setMessage(text); focus?.focus(); };
    if (!validHours) return fail(s.badHours, hoursRef.current);
    if (when && new Date(`${when}+07:00`).getTime() <= Date.now()) return fail(s.pastTime, document.getElementById(`${uid}-when`));
    if (!note.trim()) return fail(s.needNote, noteRef.current);
    setBusy(true);
    setMessage('');
    try {
      await post(`/consult/mentors/${encodeURIComponent(mentorId)}/hire`, {
        competition: slug, hours: count, note: note.trim(), ...(when ? { preferredAt: toIso(when) } : {}),
      });
      await onDone();
    } catch (failure) {
      setMessage(consultError(failure, t, 'hire'));
      setBusy(false);
    }
  }

  return <form className="cx-form cx-hire-form" onSubmit={(event) => { void submit(event); }} noValidate>
    <fieldset className="cx-choices" disabled={busy}>
      <legend>{s.competitionLabel}</legend>
      {offers.map((item) => <label key={item.slug} className={item.slug === slug ? 'cx-choice is-on' : 'cx-choice'}>
        <input type="radio" name={`${uid}-competition`} value={item.slug} checked={item.slug === slug} onChange={() => setSlug(item.slug)} />
        <span className="cx-choice__name">{item.name}</span>
        <span className="cx-choice__rate">{t.price.line(item.price, item.minutes, item.unit)}</span>
      </label>)}
    </fieldset>
    <div className="cx-grid-2">
      <div className="cx-field">
        <label htmlFor={`${uid}-hours`}>{s.hoursLabel}</label>
        <input id={`${uid}-hours`} ref={hoursRef} type="number" inputMode="numeric" min={1} max={10} step={1} value={hours}
          disabled={busy} aria-describedby={`${uid}-hours-hint`} onChange={(event) => { setHours(event.target.value); setMessage(''); }} />
        <p className="cx-hint" id={`${uid}-hours-hint`}>{s.hoursHint}</p>
      </div>
      <div className="cx-field">
        <label htmlFor={`${uid}-when`}>{s.whenLabel}</label>
        <DateTimeField id={`${uid}-when`} value={when} disabled={busy} label={s.whenLabel} hintId={`${uid}-when-hint`} inputRef={whenRef}
          onChange={(value) => { setWhen(value); setMessage(''); }} />
        <p className="cx-hint" id={`${uid}-when-hint`}>{s.whenHint}</p>
      </div>
    </div>
    <div className="cx-field">
      <label htmlFor={`${uid}-note`}>{s.noteLabel}</label>
      <textarea id={`${uid}-note`} ref={noteRef} rows={4} maxLength={1500} value={note} disabled={busy} aria-describedby={`${uid}-note-hint`}
        onChange={(event) => { setNote(event.target.value); setMessage(''); }} />
      <p className="cx-hint" id={`${uid}-note-hint`}>{s.noteHint}</p>
    </div>

    {/* ราคารวมสด: ที่ว่างข้างล่างนี้คือจุดที่ขั้นชำระเงินจะมาต่อ */}
    <div className="cx-total" aria-live="polite">
      <span className="cx-total__label">{s.totalLabel}</span>
      <strong className="cx-total__value">{total === null ? '-' : t.price.total(total)}</strong>
      {total !== null && <span className="cx-hint">{s.totalDetail(count, rate)}</span>}
    </div>
    <p className="cx-note">{s.totalNote}</p>

    <p className="cx-message cx-message--error" role="alert">{message}</p>
    <button className="primary-button cx-button" disabled={busy}>{busy ? s.sending : s.submit}</button>
  </form>;
}

function HirePanel({ data, competition, reload }: { data: Payload; competition: string; reload: () => Promise<void> }) {
  const { t } = useI18n();
  const s = t.mentorProfile;
  const c = t.consult;
  const { viewer, hire, mentor } = data;
  const next = `/mentors/${mentor.id}${competition ? `?competition=${encodeURIComponent(competition)}` : ''}`;
  const offers = data.competitions.filter((item) => item.price !== null && item.minutes);
  // งานที่ยังดำเนินอยู่ หรือเสร็จแล้วแต่ยังไม่รีวิว: ไม่ให้ส่งคำขอซ้อน พาไปทำต่อที่ Consulting
  const open = hire && (hire.status === 'requested' || hire.status === 'accepted' || hire.status === 'paid' || (hire.status === 'completed' && !hire.reviewed));

  let body;
  if (!viewer) {
    body = <>
      <p>{s.signInText}</p>
      <p><Link className="primary-button cx-button" to={`/signin?next=${encodeURIComponent(next)}`}>{s.signIn}</Link></p>
    </>;
  } else if (viewer.isSelf) {
    body = <>
      <p>{s.ownText}</p>
      <p><Link className="ghost-button cx-button" to="/mentor-zone">{s.ownLink}</Link></p>
    </>;
  } else if (!viewer.emailVerified) {
    body = <VerifyEmailNotice />;
  } else if (open && hire) {
    const link = hire.roomId ? `/consulting#room-${hire.roomId}` : `/consulting#hire-${hire.id}`;
    body = <>
      <h3>{s.openHireTitle}</h3>
      <HireSteps status={hire.status} />
      <p className="cx-flow-note">{hire.status === 'requested' ? c.requestedNote : hire.status === 'accepted' ? c.acceptedShort : hire.status === 'paid' ? c.paidNote : c.completedNote}</p>
      <p><Link className={hire.status === 'accepted' || hire.status === 'paid' || hire.status === 'completed' ? 'primary-button cx-button' : 'ghost-button cx-button'} to={link}>
        {hire.status === 'accepted' ? c.payShort : hire.status === 'paid' ? c.openChat : hire.status === 'completed' ? c.writeReview : c.openInConsulting}</Link></p>
    </>;
  } else if (offers.length === 0) {
    body = <p>{s.noOffers}</p>;
  } else {
    body = <>
      <HireSteps status={null} />
      <HireForm mentorId={mentor.id} offers={offers} initial={competition} onDone={reload} />
    </>;
  }

  return <section className="panel cx-contact" aria-labelledby="hire-title">
    <h2 id="hire-title">{s.hireTitle}</h2>
    {!open && viewer && !viewer.isSelf && viewer.emailVerified && <p className="cx-lead">{s.hireIntro}</p>}
    {body}
  </section>;
}

export function MentorProfile() {
  const { t, lang } = useI18n();
  const s = t.mentorProfile;
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const competition = params.get('competition') ?? '';
  // จ้างพักไว้ (ตอนนี้) = โหมดตัวกลาง กล่องติดต่อเมนเทอร์แทนฟอร์มจ้าง
  const hiring = useHiring();

  const { data, error, loading, reload } = useApi<Payload>(id ? `/consult/mentors/${encodeURIComponent(id)}` : null);

  // ยืนยันอีเมลเสร็จในอีกแท็บ หรือสลับบัญชี ต้องอ่านหน้านี้ใหม่ ไม่อย่างนั้นยังเห็นว่า "ยังไม่ยืนยัน"
  const accountKey = `${user?.id ?? ''}:${user?.emailVerified ?? ''}`;
  const firstKey = useRef(accountKey);
  useEffect(() => {
    if (firstKey.current === accountKey) return;
    firstKey.current = accountKey;
    reload();
  }, [accountKey, reload]);

  const mentor = data?.mentor;
  useEffect(() => {
    if (mentor) document.title = `${mentor.name} — ChampionWays`;
    else if (!loading) document.title = `${s.notFoundTitle} — ChampionWays`;
  }, [mentor, loading, s.notFoundTitle]);

  if ((loading && !data) || hiring === null) return <main id="main" tabIndex={-1} className="shell page cx-page"><p className="side-note" role="status">{s.loading}</p></main>;
  if (!data || !mentor) return <main id="main" tabIndex={-1} className="shell page cx-page">
    <h1>{s.notFoundTitle}</h1>
    <p className="cx-lead">{error || s.notFoundText}</p>
    <p><Link className="primary-button cx-button" to="/explore"><ArrowLeft size={17} aria-hidden="true" />{s.backToPick}</Link></p>
  </main>;

  const from = data.competitions.find((item) => item.slug === competition);
  const reloadAsync = async () => { reload(); };

  return <main id="main" tabIndex={-1} className="shell page cx-page">
    <p className="detail-breadcrumb">
      <Link to={from ? `/competitions/${from.slug}#mentors` : '/explore'}><ArrowLeft size={16} aria-hidden="true" />
        {from ? s.backTo(from.name) : s.backToPick}
      </Link>
    </p>

    <header className="cx-hero">
      <span className="rs-avatar-wrap"><Avatar initial={mentor.initial} plain={!mentor.risingStar} photoUrl={mentor.photoUrl} /></span>
      <div className="cx-hero__who">
        <h1>{mentor.name}</h1>
        <p className="cx-badges">
          {mentor.verified && <span className="cx-badge"><BadgeCheck size={15} aria-hidden="true" />{s.verifiedBadge}</span>}
          {mentor.risingStar && <RisingStarPill />}
        </p>
        <p className="cx-hero__spec">{mentor.specialty}</p>
        <dl className="cx-facts">
          {mentor.rating.average === null && mentor.allTime.average === null
            ? <div><dt>{t.rating.label}</dt><dd><Rating rating={mentor.rating} /></dd></div>
            : <>
              <div><dt>{s.ratingThisMonth}</dt><dd><Rating rating={mentor.rating} /></dd></div>
              <div><dt>{s.ratingAllTime}</dt><dd><Rating rating={mentor.allTime} /></dd></div>
            </>}
          <div><dt>{s.usually}</dt><dd>{t.price.line(mentor.price, mentor.minutes, mentor.unit)}</dd></div>
        </dl>
      </div>
    </header>

    <div className="cx-layout">
      {hiring
        ? <HirePanel data={data} competition={competition} reload={reloadAsync} />
        : <ContactPanel data={data} competition={competition} reload={reloadAsync} />}

      <div className="cx-main">
        <section className="panel" aria-labelledby="about-title">
          <h2 id="about-title">{s.experience}</h2>
          <p className="cx-prose">{mentor.experience}</p>
          <h3>{s.helpsWith}</h3>
          <p className="cx-prose">{mentor.best}</p>
          <h3>{s.cannotHelp}</h3>
          <p className="cx-prose">{mentor.cannot}</p>
        </section>

        <section className="panel" aria-labelledby="competitions-title">
          <h2 id="competitions-title">{s.competitionsTitle}</h2>
          {data.competitions.length === 0 ? <p className="cx-lead">{s.competitionsEmpty}</p> : <ul className="cx-list">
            {data.competitions.map((item) => <li key={item.slug}>
              <div>
                <Link className="cx-list__title" to={`/competitions/${item.slug}#mentors`}>{item.name}</Link>
                <p className="cx-hint">{s.closes(formatInputDate(item.closesAt.slice(0, 10), lang))}</p>
              </div>
              <p className="cx-list__price">{t.price.line(item.price, item.minutes, item.unit)}</p>
            </li>)}
          </ul>}
        </section>

        <section className="panel" aria-labelledby="reviews-title">
          <h2 id="reviews-title">{s.reviewsTitle}</h2>
          {data.reviews.length === 0 ? <p className="cx-lead">{s.reviewsEmpty}</p> : <ul className="cx-list cx-reviews">
            {data.reviews.map((review, index) => <li key={`${review.createdAt}-${index}`}>
              <div>
                <StarsRow stars={review.stars} />
                <p className="cx-hint">{s.reviewMeta(review.name, formatDate(review.createdAt, lang))}</p>
                {review.comment && <p className="cx-prose">{review.comment}</p>}
              </div>
            </li>)}
          </ul>}
        </section>
      </div>
    </div>
  </main>;
}
