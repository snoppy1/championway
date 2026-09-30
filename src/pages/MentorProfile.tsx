import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, ExternalLink } from 'lucide-react';
import { post } from '../lib/api';
import { useApi } from '../lib/useApi';
import { consultError, contactHref, contactKeys } from '../data/consult';
import type { ConsultStatus, Contacts, MentorCard, Rating as RatingValue } from '../data/consult';
import { ConsultFlow } from '../components/ConsultFlow';
import { Avatar, Rating, RisingStarPill, StarIcon } from '../components/mentors';
import { VerifyEmailNotice } from '../components/VerifyEmailNotice';
import { useAuth } from '../data/auth';
import { useI18n } from '../i18n';
import { formatDate, formatInputDate } from '../i18n/format';
import '../consult.css';

/* โปรไฟล์เมนเทอร์สาธารณะ กับทางติดต่อที่เกิดขึ้นนอกเว็บ
   นักเรียนกด Contact mentor → เห็นช่องทางติดต่อ → คุยกันที่อื่น → กลับมากด I received guidance
   เมนเทอร์ยืนยัน → นักเรียนรีวิวได้หนึ่งครั้ง ทั้งหมดอ่านจาก GET /api/consult/mentors/:id คำขอเดียว
   ช่องทางติดต่อเซิร์ฟเวอร์ส่งมาเฉพาะคนที่ยืนยันอีเมลแล้วและเคยกด Contact mentor หน้านี้ไม่ได้เดาเอง */

type Payload = {
  mentor: MentorCard & {
    bio: string; experience: string; best: string; cannot: string;
    risingStar: boolean; rating: RatingValue; allTime: RatingValue;
    price: number | null; minutes: number | null;
  };
  competitions: { slug: string; name: string; closesAt: string; price: number | null; minutes: number | null }[];
  reviews: { stars: number; comment: string; createdAt: string; name: string }[];
  viewer: null | { signedIn: boolean; emailVerified: boolean; isSelf: boolean };
  consultation: null | { id: string; status: ConsultStatus; reviewed: boolean };
  contacts: Contacts | null;
};

function StarsRow({ stars }: { stars: number }) {
  const { t } = useI18n();
  return <span className="cx-stars-row">
    <span aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= stars ? 'is-on' : ''}><StarIcon /></span>)}</span>
    <span className="sr-only">{t.rating.outOf(stars)}</span>
  </span>;
}

/* ขั้นปัจจุบันของนักเรียนกับเมนเทอร์คนนี้ ไม่เคยติดต่อหรือยกเลิกแล้วคือขั้น 1
   กดติดต่อแล้วและรอเมนเทอร์ยืนยันคือขั้น 2 เมนเทอร์ยืนยันแล้ว (รวมรีวิวแล้ว) คือขั้น 3 */
function currentStep(consultation: Payload['consultation']) {
  if (!consultation || consultation.status === 'cancelled') return 0;
  return consultation.status === 'confirmed' ? 2 : 1;
}

/** บรรทัดขั้นตอนธรรมดา ขั้นปัจจุบันตัวหนา ไม่ใช้ชิปตัวเลข */
function Steps({ current }: { current: number }) {
  const { t } = useI18n();
  return <p className="cx-steps" aria-label={t.consult.stepsLabel}>
    {t.consult.steps.map((step, index) => <span key={step}>
      {index > 0 && <span aria-hidden="true"> · </span>}
      {index === current ? <strong aria-current="step">{step}</strong> : step}
    </span>)}
  </p>;
}

function ContactList({ contacts }: { contacts: Contacts }) {
  const { t } = useI18n();
  const s = t.mentorProfile;
  return <section aria-labelledby="channels-title">
    <h3 id="channels-title" tabIndex={-1}>{s.channelsTitle}</h3>
    <dl className="cx-contacts">
      {contactKeys.map((key) => {
        const value = contacts[key].trim();
        const href = contactHref(key, value);
        // ช่องที่ว่างแสดงเป็น "-" ตามที่ผู้ใช้สั่ง แถวบีบให้เตี้ยเพื่อไม่กินที่ ค่าที่กรอกแล้วกดได้ทุกช่อง
        let content;
        if (!value) content = <><span aria-hidden="true">-</span><span className="sr-only">{s.notProvided}</span></>;
        else if (!href) content = value;
        else if (key === 'link') content = <a href={href} target="_blank" rel="noopener noreferrer">{value}<ExternalLink size={14} aria-hidden="true" /></a>;
        else if (key === 'email' || key === 'phone') content = <a href={href}>{value}</a>;
        else content = <a href={href} target="_blank" rel="noopener noreferrer">{value}</a>;
        return <div key={key}><dt>{s.channels[key]}</dt><dd>{content}</dd></div>;
      })}
    </dl>
  </section>;
}

function ContactForm({ mentorId, competitions, initial, again, onDone }: {
  mentorId: string;
  competitions: Payload['competitions'];
  initial: string;
  again: boolean;
  onDone: () => Promise<void>;
}) {
  const { t } = useI18n();
  const s = t.mentorProfile;
  const [about, setAbout] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await post(`/consult/mentors/${encodeURIComponent(mentorId)}/contact`, about ? { competition: about } : {});
      await onDone();
    } catch (failure) {
      setMessage(consultError(failure, t));
    } finally {
      setBusy(false);
    }
  }

  return <form className="cx-contact-form" onSubmit={(event) => { void submit(event); }}>
    {competitions.length > 0 && <div className="cx-field">
      <label htmlFor="contact-about">{s.aboutLabel}</label>
      <select id="contact-about" value={about} disabled={busy} onChange={(event) => setAbout(event.target.value)}>
        <option value="">{s.aboutNone}</option>
        {competitions.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
      </select>
    </div>}
    <p className="cx-message cx-message--error" role="alert">{message}</p>
    <button className="primary-button cx-button" disabled={busy}>
      {busy ? s.contacting : again ? t.consult.contactAgain : s.contactCta}
    </button>
  </form>;
}

function ContactPanel({ data, competition, reload }: { data: Payload; competition: string; reload: () => Promise<void> }) {
  const { t } = useI18n();
  const s = t.mentorProfile;
  const { viewer, consultation, contacts, mentor } = data;
  const signInHref = `/signin?next=${encodeURIComponent(`/mentors/${mentor.id}${competition ? `?competition=${competition}` : ''}`)}`;
  const initial = data.competitions.some((item) => item.slug === competition) ? competition : '';
  const finished = consultation?.status === 'cancelled' || (consultation?.status === 'confirmed' && consultation.reviewed);

  // กดติดต่อแล้วปุ่มหายไป โฟกัสต้องไปอยู่ที่ช่องทางติดต่อที่เพิ่งขึ้นมา ไม่ใช่หลุดไปที่หน้าเปล่า
  const lastStatus = useRef(consultation?.status);
  useEffect(() => {
    if (consultation?.status === 'active' && lastStatus.current !== 'active') document.getElementById('channels-title')?.focus();
    lastStatus.current = consultation?.status;
  }, [consultation?.status]);

  let body;
  if (!viewer) {
    body = <>
      <p>{s.signInText}</p>
      <p><Link className="primary-button cx-button" to={signInHref}>{s.signIn}</Link></p>
    </>;
  } else if (viewer.isSelf) {
    body = <>
      <p>{s.ownText}</p>
      <p><Link className="ghost-button cx-button" to="/mentor-zone">{s.ownLink}</Link></p>
    </>;
  } else if (!viewer.emailVerified) {
    body = <VerifyEmailNotice />;
  } else {
    body = <>
      <Steps current={currentStep(consultation)} />
      {contacts && <ContactList contacts={contacts} />}
      {consultation && <ConsultFlow consultation={consultation} onChange={reload} />}
      {(!consultation || finished) && <ContactForm
        mentorId={mentor.id} competitions={data.competitions} initial={initial} again={Boolean(consultation)} onDone={reload}
      />}
    </>;
  }

  return <section className="panel cx-contact" aria-labelledby="contact-title">
    <h2 id="contact-title">{s.contactTitle}</h2>
    {!consultation && <p className="cx-lead">{s.contactIntro}</p>}
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

  if (loading && !data) return <main id="main" tabIndex={-1} className="shell page cx-page"><p className="side-note" role="status">{s.loading}</p></main>;
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
      <span className="rs-avatar-wrap"><Avatar initial={mentor.initial} plain={!mentor.risingStar} /></span>
      <div className="cx-hero__who">
        <h1>{mentor.name}</h1>
        <p className="cx-badges">
          {mentor.verified && <span className="cx-badge"><BadgeCheck size={15} aria-hidden="true" />{s.verifiedBadge}</span>}
          {mentor.risingStar && <RisingStarPill />}
        </p>
        <p className="cx-hero__spec">{mentor.specialty}</p>
        <dl className="cx-facts">
          <div><dt>{s.ratingThisMonth}</dt><dd><Rating rating={mentor.rating} /></dd></div>
          <div><dt>{s.ratingAllTime}</dt><dd><Rating rating={mentor.allTime} /></dd></div>
          <div><dt>{s.usually}</dt><dd>{t.price.line(mentor.price, mentor.minutes)}</dd></div>
        </dl>
      </div>
    </header>

    <div className="cx-layout">
      <ContactPanel data={data} competition={competition} reload={reloadAsync} />

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
              <p className="cx-list__price">{t.price.line(item.price, item.minutes)}</p>
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
