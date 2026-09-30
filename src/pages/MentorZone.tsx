import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '../data/auth';
import { api, ApiError, post } from '../lib/api';
import { useApi } from '../lib/useApi';
import { consultError, contactKeys, isWebLink, parsePrice } from '../data/consult';
import type { ConsultStatus, Contacts, MentorCard, Rating as RatingValue } from '../data/consult';
import { Avatar, Rating, RisingStarPill } from '../components/mentors';
import { useI18n } from '../i18n';
import { formatDate, formatInputDate } from '../i18n/format';
import '../consult.css';

/* Mentor zone: ที่เดียวที่เมนเทอร์จัดการตัวเอง
   ช่องทางติดต่อ เวทีที่รับปรึกษาพร้อมราคา ขอเพิ่มเวทีใหม่ และกดยืนยันการปรึกษา
   ลิงก์ในอีเมลแจ้งเตือนมาที่ /mentor-zone#confirm-<id> หน้านี้เลื่อนไปที่รายการนั้นให้เอง
   สิทธิ์ทั้งหมดตัดสินที่เซิร์ฟเวอร์ หน้านี้แค่ซ่อนสิ่งที่คนที่ไม่ใช่เมนเทอร์ใช้ไม่ได้ */

type Chosen = { slug: string; name: string; closesAt: string; price: number | null; minutes: number | null };
type Open = { slug: string; name: string; org: string; closesAt: string; description: string; sourceUrl: string | null };
type Request = {
  id: string; name: string; url: string; details: string; price: number; minutes: number;
  status: 'pending' | 'approved' | 'rejected'; reason: string; createdAt: string;
};
type Waiting = { id: string; status: ConsultStatus; claimedAt: string | null; createdAt: string; student: string };
type Zone = {
  mentor: null | (MentorCard & {
    risingStar: boolean; rating: RatingValue; contacts: Contacts; price: number | null; minutes: number | null;
  });
  competitions: Chosen[];
  available: Open[];
  requests: Request[];
  consultations: Waiting[];
};

const EMAIL = /^\S+@\S+\.\S+$/;
const PAGE = 8;

type Reload = () => void;

/* ---------- การปรึกษาที่รอยืนยัน ---------- */

function ConfirmSection({ items, reload }: { items: Waiting[]; reload: Reload }) {
  const { t, lang } = useI18n();
  const s = t.mentorZone;
  const { hash } = useLocation();
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // มาจากลิงก์ในอีเมล: เลื่อนไปหารายการนั้นและย้ายโฟกัสไปที่มัน
  useEffect(() => {
    if (!hash.startsWith('#confirm-')) return;
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
  }, [hash, items.length]);

  async function confirm(id: string) {
    setBusy(id);
    setMessage('');
    setFailed(false);
    try {
      await post(`/consult/${id}/confirm`, {});
      setMessage(s.confirmedDone);
      reload();
      titleRef.current?.focus();
    } catch (failure) {
      setFailed(true);
      setMessage(consultError(failure, t, 'mentor'));
    } finally {
      setBusy('');
    }
  }

  // ที่ต้องกดก่อนอยู่บนสุด
  const sorted = [...items].sort((a, b) => Number(b.status === 'claimed') - Number(a.status === 'claimed'));

  return <section className="panel cx-section" aria-labelledby="confirm-title">
    <h2 id="confirm-title" tabIndex={-1} ref={titleRef}>{s.confirmTitle}</h2>
    <p className="cx-lead">{s.confirmLead}</p>
    <p className={failed ? 'cx-message cx-message--error' : 'cx-message cx-message--ok'} role={failed ? 'alert' : 'status'}>{message}</p>
    {sorted.length === 0 ? <p className="cx-empty">{s.confirmEmpty}</p> : <ul className="cx-list" aria-label={s.listLabel}>
      {sorted.map((item) => {
        const claimed = item.status === 'claimed';
        const isTarget = hash === `#confirm-${item.id}`;
        return <li key={item.id} id={`confirm-${item.id}`} tabIndex={-1} className={isTarget ? 'cx-waiting is-target' : 'cx-waiting'}>
          <div>
            <p>{claimed
              ? s.claimedOn(item.student, formatDate(item.claimedAt ?? item.createdAt, lang))
              : s.openedOn(item.student, formatDate(item.createdAt, lang))}</p>
            {!claimed && <p className="cx-hint">{s.waitingStudent}</p>}
          </div>
          {claimed && <button type="button" className="primary-button cx-button" disabled={busy !== ''}
            aria-label={s.confirmAria(item.student)} onClick={() => { void confirm(item.id); }}>
            {busy === item.id ? s.confirming : s.confirm}
          </button>}
        </li>;
      })}
    </ul>}
  </section>;
}

/* ---------- ช่องทางติดต่อ ---------- */

function ContactsSection({ contacts, reload }: { contacts: Contacts; reload: Reload }) {
  const { t } = useI18n();
  const s = t.mentorZone;
  const [values, setValues] = useState<Contacts>(contacts);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof Contacts, value: string) => { setValues((current) => ({ ...current, [key]: value })); setMessage(''); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = Object.fromEntries(contactKeys.map((key) => [key, values[key].trim()])) as Contacts;
    let problem = '';
    if (!contactKeys.some((key) => trimmed[key])) problem = s.contactsNeedOne;
    else if (trimmed.email && !EMAIL.test(trimmed.email)) problem = s.contactsBadEmail;
    else if (trimmed.link && !isWebLink(trimmed.link)) problem = s.contactsBadLink;
    if (problem) {
      setFailed(true);
      setMessage(problem);
      firstRef.current?.focus();
      return;
    }
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      await api('/consult/zone/contacts', {
        method: 'PATCH',
        body: JSON.stringify({
          contactEmail: trimmed.email, contactLine: trimmed.line, contactPhone: trimmed.phone,
          contactInstagram: trimmed.instagram, contactLink: trimmed.link,
        }),
      });
      setValues(trimmed);
      setMessage(s.saved);
      reload();
    } catch (failure) {
      setFailed(true);
      setMessage(consultError(failure, t, 'mentor'));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel cx-section" aria-labelledby="contacts-title">
    <h2 id="contacts-title">{s.contactsTitle}</h2>
    <p className="cx-lead">{s.contactsLead}</p>
    <form className="cx-form" onSubmit={(event) => { void submit(event); }} noValidate>
      <div className="cx-grid-2">
        {contactKeys.map((key, index) => <div className="cx-field" key={key}>
          <label htmlFor={`zone-contact-${key}`}>{s.fields[key]}</label>
          <input id={`zone-contact-${key}`} ref={index === 0 ? firstRef : undefined}
            type={key === 'email' ? 'email' : key === 'link' ? 'url' : key === 'phone' ? 'tel' : 'text'}
            autoComplete="off" maxLength={key === 'link' ? 500 : key === 'email' ? 200 : 100}
            value={values[key]} disabled={busy} onChange={(event) => set(key, event.target.value)} />
        </div>)}
      </div>
      <p className={failed ? 'cx-message cx-message--error' : 'cx-message cx-message--ok'} role={failed ? 'alert' : 'status'}>{message}</p>
      <button className="primary-button cx-button" disabled={busy}>{busy ? s.saving : s.save}</button>
    </form>
  </section>;
}

/* ---------- ราคาต่อเวที ---------- */

function PriceFields({ idPrefix, price, minutes, disabled, onPrice, onMinutes }: {
  idPrefix: string; price: string; minutes: string; disabled: boolean;
  onPrice: (value: string) => void; onMinutes: (value: string) => void;
}) {
  const { t } = useI18n();
  return <div className="cx-price-fields">
    <div className="cx-field">
      <label htmlFor={`${idPrefix}-price`}>{t.price.thb}</label>
      <input id={`${idPrefix}-price`} type="number" inputMode="numeric" min={0} max={100000} step={1}
        value={price} disabled={disabled} onChange={(event) => onPrice(event.target.value)} />
    </div>
    <div className="cx-field">
      <label htmlFor={`${idPrefix}-minutes`}>{t.price.minutes}</label>
      <input id={`${idPrefix}-minutes`} type="number" inputMode="numeric" min={1} max={600} step={1}
        value={minutes} disabled={disabled} onChange={(event) => onMinutes(event.target.value)} />
    </div>
  </div>;
}

const text = (value: number | null) => (value === null ? '' : String(value));

function ChosenRow({ item, onChanged }: { item: Chosen; onChanged: (message: string) => void }) {
  const { t, lang } = useI18n();
  const s = t.mentorZone;
  const uid = useId();
  const [price, setPrice] = useState(text(item.price));
  const [minutes, setMinutes] = useState(text(item.minutes));
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [message, setMessage] = useState('');
  const dirty = price !== text(item.price) || minutes !== text(item.minutes);

  async function save(event: FormEvent) {
    event.preventDefault();
    const parsed = parsePrice(price, minutes);
    if (!parsed) { setMessage(s.priceInvalid); return; }
    setBusy('save');
    setMessage('');
    try {
      await api(`/consult/zone/competitions/${encodeURIComponent(item.slug)}`, { method: 'PUT', body: JSON.stringify(parsed) });
      onChanged(s.saved);
    } catch (failure) {
      setMessage(consultError(failure, t, 'mentor'));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('remove');
    setMessage('');
    try {
      await api(`/consult/zone/competitions/${encodeURIComponent(item.slug)}`, { method: 'DELETE' });
      onChanged(s.removed);
    } catch (failure) {
      setMessage(consultError(failure, t, 'mentor'));
      setBusy(null);
    }
  }

  return <li className="cx-competition">
    <div className="cx-competition__head">
      <Link className="cx-list__title" to={`/competitions/${item.slug}#mentors`}>{item.name}</Link>
      <p className="cx-hint">{s.closes(formatInputDate(item.closesAt.slice(0, 10), lang))} · {t.price.line(item.price, item.minutes)}</p>
    </div>
    <form className="cx-competition__form" onSubmit={(event) => { void save(event); }} noValidate>
      <PriceFields idPrefix={uid} price={price} minutes={minutes} disabled={busy !== null}
        onPrice={(value) => { setPrice(value); setMessage(''); }} onMinutes={(value) => { setMinutes(value); setMessage(''); }} />
      <div className="cx-row">
        <button className="ghost-button cx-button" disabled={busy !== null || !dirty} aria-label={s.saveAria(item.name)}>
          {busy === 'save' ? s.saving : s.save}
        </button>
        <button type="button" className="link-button cx-link cx-link--danger" disabled={busy !== null}
          aria-label={s.removeAria(item.name)} onClick={() => { void remove(); }}>{s.remove}</button>
      </div>
      <p className="cx-message cx-message--error" role="alert">{message}</p>
    </form>
  </li>;
}

function CompetitionsSection({ chosen, available, defaults, reload }: {
  chosen: Chosen[]; available: Open[]; defaults: { price: number | null; minutes: number | null }; reload: Reload;
}) {
  const { t, lang } = useI18n();
  const s = t.mentorZone;
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [message, setMessage] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);

  const done = (note: string) => { setMessage(note); reload(); titleRef.current?.focus(); };
  const taken = new Set(chosen.map((item) => item.slug));
  const needle = query.trim().toLowerCase();
  const matches = available.filter((item) => !taken.has(item.slug)
    && (!needle || item.name.toLowerCase().includes(needle) || item.org.toLowerCase().includes(needle)));
  const open = available.filter((item) => !taken.has(item.slug));

  return <>
    <section className="panel cx-section" aria-labelledby="my-competitions-title">
      <h2 id="my-competitions-title" tabIndex={-1} ref={titleRef}>{s.competitionsTitle}</h2>
      <p className="cx-message cx-message--ok" role="status">{message}</p>
      {chosen.length === 0 ? <p className="cx-empty">{s.competitionsEmpty}</p>
        : <ul className="cx-list cx-list--stack">{chosen.map((item) => <ChosenRow key={item.slug} item={item} onChanged={done} />)}</ul>}
    </section>

    <section className="panel cx-section" aria-labelledby="add-competition-title">
      <h2 id="add-competition-title">{s.addTitle}</h2>
      <p className="cx-lead">{s.addLead}</p>
      {open.length === 0 ? <p className="cx-empty">{s.addEmpty}</p> : <>
        <div className="cx-field cx-search">
          <label htmlFor="zone-search">{s.search}</label>
          <input id="zone-search" type="search" value={query} autoComplete="off"
            onChange={(event) => { setQuery(event.target.value); setLimit(PAGE); }} />
        </div>
        {matches.length === 0 ? <p className="cx-empty">{s.searchNone}</p> : <ul className="cx-list cx-list--stack">
          {matches.slice(0, limit).map((item) => <AddRow key={item.slug} item={item} defaults={defaults} lang={lang} onAdded={done} />)}
        </ul>}
        {matches.length > limit && <p><button type="button" className="ghost-button cx-button" onClick={() => setLimit(limit + PAGE)}>
          {s.showMore(matches.length - limit)}</button></p>}
      </>}
    </section>
  </>;
}

function AddRow({ item, defaults, lang, onAdded }: {
  item: Open; defaults: { price: number | null; minutes: number | null }; lang: 'en' | 'th'; onAdded: (message: string) => void;
}) {
  const { t } = useI18n();
  const s = t.mentorZone;
  const uid = useId();
  const [price, setPrice] = useState(text(defaults.price));
  const [minutes, setMinutes] = useState(text(defaults.minutes));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function add(event: FormEvent) {
    event.preventDefault();
    const parsed = parsePrice(price, minutes);
    if (!parsed) { setMessage(s.priceInvalid); return; }
    setBusy(true);
    setMessage('');
    try {
      await api(`/consult/zone/competitions/${encodeURIComponent(item.slug)}`, { method: 'PUT', body: JSON.stringify(parsed) });
      onAdded(s.added);
    } catch (failure) {
      setMessage(consultError(failure, t, 'mentor'));
      setBusy(false);
    }
  }

  return <li className="cx-competition">
    <div className="cx-competition__head">
      <p className="cx-list__title">{item.name}</p>
      <p className="cx-hint">{s.organizer(item.org)} · {s.closes(formatInputDate(item.closesAt.slice(0, 10), lang))}</p>
      <details className="cx-details">
        <summary>{s.details}</summary>
        <p className="cx-prose">{item.description || s.noDetails}</p>
        {item.sourceUrl && isWebLink(item.sourceUrl) && <p><a href={item.sourceUrl} target="_blank" rel="noreferrer noopener">
          {s.openSource}<ExternalLink size={14} aria-hidden="true" /></a></p>}
      </details>
    </div>
    <form className="cx-competition__form" onSubmit={(event) => { void add(event); }} noValidate>
      <PriceFields idPrefix={uid} price={price} minutes={minutes} disabled={busy}
        onPrice={(value) => { setPrice(value); setMessage(''); }} onMinutes={(value) => { setMinutes(value); setMessage(''); }} />
      <div className="cx-row">
        <button className="primary-button cx-button" disabled={busy} aria-label={s.addAria(item.name)}>{busy ? s.saving : s.add}</button>
      </div>
      <p className="cx-message cx-message--error" role="alert">{message}</p>
    </form>
  </li>;
}

/* ---------- ขอเพิ่มเวทีใหม่ ---------- */

function RequestSection({ requests, defaults, reload }: {
  requests: Request[]; defaults: { price: number | null; minutes: number | null }; reload: Reload;
}) {
  const { t, lang } = useI18n();
  const s = t.mentorZone;
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [details, setDetails] = useState('');
  const [price, setPrice] = useState(text(defaults.price));
  const [minutes, setMinutes] = useState(text(defaults.minutes));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);

  const fail = (note: string, focus?: HTMLElement | null) => { setFailed(true); setMessage(note); focus?.focus(); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parsePrice(price, minutes);
    if (!name.trim()) return fail(s.reqNeedName, nameRef.current);
    if (!isWebLink(url)) return fail(s.reqBadUrl, urlRef.current);
    if (!parsed) return fail(s.priceInvalid);
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      await post('/consult/zone/requests', { name: name.trim(), url: url.trim(), details: details.trim(), ...parsed });
      setName(''); setUrl(''); setDetails('');
      setMessage(s.reqSent);
      reload();
    } catch (failure) {
      // 409 ของฟอร์มนี้แปลว่ามีคำขอรอตรวจครบ 10 รายการแล้ว
      fail(failure instanceof ApiError && failure.status === 409 ? s.reqLimit : consultError(failure, t, 'mentor'));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel cx-section" aria-labelledby="request-title">
    <h2 id="request-title">{s.requestTitle}</h2>
    <p className="cx-lead">{s.requestLead}</p>
    <form className="cx-form" onSubmit={(event) => { void submit(event); }} noValidate>
      <div className="cx-field">
        <label htmlFor="req-name">{s.reqName}</label>
        <input id="req-name" ref={nameRef} maxLength={200} value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="cx-field">
        <label htmlFor="req-url">{s.reqUrl}</label>
        <input id="req-url" ref={urlRef} type="url" maxLength={500} placeholder="https://" value={url} disabled={busy} onChange={(event) => setUrl(event.target.value)} />
      </div>
      <div className="cx-field">
        <label htmlFor="req-details">{s.reqDetails}</label>
        <textarea id="req-details" rows={3} maxLength={2000} value={details} disabled={busy} onChange={(event) => setDetails(event.target.value)} />
      </div>
      <PriceFields idPrefix="req" price={price} minutes={minutes} disabled={busy} onPrice={setPrice} onMinutes={setMinutes} />
      <p className={failed ? 'cx-message cx-message--error' : 'cx-message cx-message--ok'} role={failed ? 'alert' : 'status'}>{message}</p>
      <button className="primary-button cx-button" disabled={busy}>{busy ? s.reqSending : s.reqSubmit}</button>
    </form>

    <h3 className="cx-subhead">{s.requestsTitle}</h3>
    {requests.length === 0 ? <p className="cx-empty">{s.requestsEmpty}</p> : <ul className="cx-list cx-list--stack">
      {requests.map((request) => <li key={request.id} className="cx-request">
        <div>
          <p className="cx-list__title">{isWebLink(request.url)
            ? <a href={request.url} target="_blank" rel="noreferrer noopener">{request.name}<ExternalLink size={14} aria-hidden="true" /></a>
            : request.name}</p>
          <p className="cx-hint">{s.requestedOn(formatDate(request.createdAt, lang))} · {t.price.line(request.price, request.minutes)}</p>
          {request.details && <p className="cx-prose">{request.details}</p>}
          {request.status === 'rejected' && request.reason && <p className="cx-prose">{s.requestReason(request.reason)}</p>}
        </div>
        <span className={`cx-pill cx-pill--req-${request.status}`}>{s.requestStatus[request.status]}</span>
      </li>)}
    </ul>}
  </section>;
}

/* ---------- หน้า ---------- */

export function MentorZone() {
  const { t } = useI18n();
  const s = t.mentorZone;
  const { user, loading: authLoading } = useAuth();
  const { hash } = useLocation();
  const { data, error, loading, reload } = useApi<Zone>(user ? '/consult/zone' : null);

  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);

  if (authLoading) return <main id="main" tabIndex={-1} className="shell page cx-page"><p className="side-note" role="status">{s.loading}</p></main>;
  // เก็บ #confirm-… ไว้ใน next ด้วย เข้าสู่ระบบเสร็จจะได้กลับมาที่รายการจากอีเมลได้
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(`/mentor-zone${hash}`)}`} replace />;

  const mentor = data?.mentor;

  return <main id="main" tabIndex={-1} className="shell page cx-page">
    <header className="cx-page-head">
      <h1>{s.pageTitle}</h1>
      <p className="cx-lead">{s.lead}</p>
    </header>

    {loading && !data && <>
      <p className="sr-only" role="status">{s.loading}</p>
      <div aria-hidden="true"><div className="rs-skeleton rs-skeleton--row" /><div className="rs-skeleton rs-skeleton--row" /><div className="rs-skeleton rs-skeleton--row" /></div>
    </>}

    {error && !data && <div className="cx-state cx-state--error" role="alert">
      <h2>{s.errorTitle}</h2>
      <p>{error}</p>
      <button type="button" className="ghost-button cx-button" onClick={reload}>{s.retry}</button>
    </div>}

    {data && !mentor && <div className="cx-state">
      <h2>{s.notMentorTitle}</h2>
      <p>{s.notMentorText}</p>
      <Link className="primary-button cx-button" to="/mentors/apply">{s.applyCta}</Link>
    </div>}

    {data && mentor && <>
      <section className="cx-me" aria-label={mentor.name}>
        <Avatar initial={mentor.initial} plain={!mentor.risingStar} />
        <div>
          <p className="cx-me__name">{mentor.name}{mentor.risingStar && <RisingStarPill />}</p>
          <p className="cx-hint">{s.ratingThisMonth}: <Rating rating={mentor.rating} /></p>
        </div>
        <Link className="ghost-button cx-button" to={`/mentors/${mentor.id}`}>{s.publicProfile}</Link>
      </section>

      <div className="cx-stack">
        <ConfirmSection items={data.consultations} reload={reload} />
        <ContactsSection contacts={mentor.contacts} reload={reload} />
        <CompetitionsSection chosen={data.competitions} available={data.available} defaults={{ price: mentor.price, minutes: mentor.minutes }} reload={reload} />
        <RequestSection requests={data.requests} defaults={{ price: mentor.price, minutes: mentor.minutes }} reload={reload} />
      </div>
    </>}
  </main>;
}
