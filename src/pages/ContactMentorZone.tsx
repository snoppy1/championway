import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../data/auth';
import { api, ApiError, post } from '../lib/api';
import { useApi } from '../lib/useApi';
import { consultError, contactKeys, isWebLink } from '../data/consult';
import type { Contacts, MentorCard, Rating as RatingValue } from '../data/consult';
import { Avatar, Rating, RisingStarPill } from '../components/mentors';
import { ConfirmAction } from '../components/ConsultFlow';
import { Tabs, panelId, tabId } from '../components/Tabs';
import { useI18n } from '../i18n';
import { formatDate } from '../i18n/format';
import { nb } from '../components/nb';
import { CompetitionsSection } from './MentorZone';
import type { Chosen, Open, Request } from './MentorZone';
import '../consult.css';

/* Mentor zone ในโหมดตัวกลาง (จ้างพักไว้): ยืนยันคนที่ให้คำแนะนำ ตั้งช่องทางที่นักเรียนติดต่อ และจัดการเวทีที่รับปรึกษา
   ลิงก์ในอีเมลแจ้งเตือนมาที่ /mentor-zone#confirm-<id> หน้านี้เปิดแท็บยืนยันและเลื่อนไปที่รายการนั้นให้เอง
   ปุ่ม "ไม่ใช่ฉัน" มีขั้นถามซ้ำ เพราะตอบแล้วนักเรียนรีวิวจากครั้งนั้นไม่ได้
   สิทธิ์ทั้งหมดตัดสินที่เซิร์ฟเวอร์ หน้านี้แค่ซ่อนสิ่งที่คนที่ไม่ใช่เมนเทอร์ใช้ไม่ได้ */

type Waiting = { id: string; student: string; competitionName: string | null; claimedAt: string | null };
type Zone = {
  mentor: null | (MentorCard & { risingStar: boolean; rating: RatingValue; price: number | null; minutes: number | null });
  contacts: Contacts;
  confirmations: Waiting[];
  competitions: Chosen[];
  available: Open[];
  requests: Request[];
};
type ZoneTab = 'confirm' | 'contacts' | 'competitions';
const EMAIL = /^\S+@\S+\.\S+$/;

/* ---------- คำขอให้ยืนยัน ---------- */

function ConfirmPanel({ items, reload }: { items: Waiting[]; reload: () => void }) {
  const { t, lang } = useI18n();
  const s = t.contact.zone;
  const { hash } = useLocation();
  const [busy, setBusy] = useState<{ id: string; answer: 'confirm' | 'deny' } | null>(null);
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

  async function answer(id: string, kind: 'confirm' | 'deny') {
    setBusy({ id, answer: kind });
    setMessage('');
    setFailed(false);
    try {
      await post(`/consult/${id}/${kind}`, {});
      setMessage(kind === 'confirm' ? s.confirmedDone : s.notMeDone);
      reload();
      titleRef.current?.focus();
    } catch (failure) {
      setFailed(true);
      // 409 = มีคนตอบไปแล้ว (เช่น กดจากลิงก์ในอีเมลไปก่อน) อ่านรายการใหม่ให้ตรงความจริง
      setMessage(failure instanceof ApiError && failure.status === 409 ? s.changed : consultError(failure, t, 'mentor'));
      if (failure instanceof ApiError && failure.status === 409) reload();
    } finally {
      setBusy(null);
    }
  }

  return <section className={items.length > 0 ? 'panel cx-section cx-section--urgent cx-section--ink' : 'panel cx-section'} aria-labelledby="confirm-title">
    <h2 id="confirm-title" tabIndex={-1} ref={titleRef}>{s.confirmHeading(items.length)}</h2>
    <p className="cx-lead">{nb(items.length > 0 ? s.confirmLead : s.confirmEmpty)}</p>
    <p className={failed ? 'cx-message cx-message--error' : 'cx-message cx-message--ok'} role={failed ? 'alert' : 'status'}>{message}</p>
    {items.length > 0 && <ul className="cx-list cx-list--stack" aria-label={s.listLabel}>
      {items.map((item) => <li key={item.id} id={`confirm-${item.id}`} tabIndex={-1}
        className={hash === `#confirm-${item.id}` ? 'cx-waiting is-target' : 'cx-waiting'}>
        <div>
          <p className="cx-waiting__who">{s.claimedBy(item.student)}</p>
          {/* วันที่อยู่บรรทัดเดียวกับเวที และไม่ตัดกลางวันที่ */}
          <p className="cx-hint">{item.competitionName ? `${s.about(item.competitionName)} · ` : ''}<span className="cx-nowrap">{s.askedOn(formatDate(item.claimedAt ?? new Date().toISOString(), lang))}</span></p>
        </div>
        <div className="cx-row cx-row--pair">
          <button type="button" className="primary-button cx-button" disabled={busy !== null}
            aria-label={s.confirmAria(item.student)} onClick={() => { void answer(item.id, 'confirm'); }}>
            {busy?.id === item.id && busy.answer === 'confirm' ? s.confirming : s.confirm}
          </button>
          <ConfirmAction danger trigger={s.notMe} question={s.notMeAsk(item.student)} yes={s.notMeYes} no={s.notMeNo}
            busyLabel={s.answering} busy={busy?.id === item.id && busy.answer === 'deny'} onConfirm={() => answer(item.id, 'deny')} />
        </div>
      </li>)}
    </ul>}
  </section>;
}

/* ---------- ช่องทางติดต่อ ---------- */

function ContactsPanel({ contacts, reload }: { contacts: Contacts; reload: () => void }) {
  const { t } = useI18n();
  const s = t.contact.zone;
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
    if (!contactKeys.some((key) => trimmed[key])) problem = s.needOne;
    else if (trimmed.email && !EMAIL.test(trimmed.email)) problem = s.badEmail;
    else if (trimmed.link && !isWebLink(trimmed.link)) problem = s.badLink;
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
          <label htmlFor={`contact-${key}`}>{s.fields[key]}</label>
          <input id={`contact-${key}`} ref={index === 0 ? firstRef : undefined} value={values[key]} disabled={busy} autoComplete="off"
            maxLength={key === 'link' ? 500 : 200} placeholder={key === 'link' ? 'https://' : undefined}
            type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} onChange={(event) => set(key, event.target.value)} />
        </div>)}
      </div>
      <p className={failed ? 'cx-message cx-message--error' : 'cx-message cx-message--ok'} role={failed ? 'alert' : 'status'}>{message}</p>
      <button className="primary-button cx-button" disabled={busy}>{busy ? s.saving : s.save}</button>
    </form>
  </section>;
}

export function ContactMentorZone() {
  const { t } = useI18n();
  const s = t.mentorZone;
  const c = t.contact.zone;
  const { user, loading: authLoading } = useAuth();
  const { hash } = useLocation();
  const { data, error, loading, reload } = useApi<Zone>(user ? '/consult/zone' : null);
  const [tab, setTab] = useState<ZoneTab | null>(null);

  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);

  const noChannels = data?.mentor ? !contactKeys.some((key) => data.contacts[key].trim()) : false;
  const waiting = data?.confirmations ?? [];

  // ลิงก์จากอีเมล (#confirm-<id>) เปิดแท็บยืนยันเสมอ แม้เปิดหน้าไว้อยู่แล้ว
  useEffect(() => { if (hash.startsWith('#confirm-')) setTab('confirm'); }, [hash]);

  if (authLoading) return <main id="main" tabIndex={-1} className="shell page cx-page"><p className="side-note" role="status">{s.loading}</p></main>;
  // เก็บ #confirm-… ไว้ใน next ด้วย เข้าสู่ระบบเสร็จจะได้กลับมาที่คำขอจากอีเมลได้
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(`/mentor-zone${hash}`)}`} replace />;

  const mentor = data?.mentor;
  /* แท็บเริ่มต้น (จนกว่าเมนเทอร์จะเลือกเอง): มีคำขอรอ → ยืนยัน · ยังไม่มีช่องทางติดต่อเลย → ช่องทางติดต่อ · นอกนั้นเวทีของฉัน */
  const current: ZoneTab = tab ?? (hash.startsWith('#confirm-') || waiting.length > 0 ? 'confirm' : noChannels ? 'contacts' : 'competitions');

  return <main id="main" tabIndex={-1} className="shell page cx-page cx-page--wide">
    <header className="cx-page-head">
      <h1>{s.pageTitle}</h1>
      <p className="cx-lead">{nb(c.lead)}</p>
    </header>

    {loading && !data && <>
      <p className="sr-only" role="status">{s.loading}</p>
      <div aria-hidden="true"><div className="rs-skeleton rs-skeleton--row" /><div className="rs-skeleton rs-skeleton--row" /></div>
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

      {noChannels && <p className="cx-banner cx-banner--requested" role="note">
        {c.contactsMissing}{' '}
        <button type="button" className="link-button cx-link cx-link--text" onClick={() => setTab('contacts')}>{c.tabContacts}</button>
      </p>}

      <Tabs prefix="zone" label={c.tabsLabel} value={current} onChange={(id) => setTab(id)} tabs={[
        { id: 'confirm' as ZoneTab, label: c.tabConfirm(waiting.length) },
        { id: 'contacts' as ZoneTab, label: c.tabContacts },
        { id: 'competitions' as ZoneTab, label: c.tabCompetitions },
      ]} />

      <div role="tabpanel" id={panelId('zone', 'confirm')} aria-labelledby={tabId('zone', 'confirm')} hidden={current !== 'confirm'} className="cx-zone-panel">
        <ConfirmPanel items={waiting} reload={reload} />
      </div>
      <div role="tabpanel" id={panelId('zone', 'contacts')} aria-labelledby={tabId('zone', 'contacts')} hidden={current !== 'contacts'} className="cx-zone-panel">
        <ContactsPanel contacts={data.contacts} reload={reload} />
      </div>
      <div role="tabpanel" id={panelId('zone', 'competitions')} aria-labelledby={tabId('zone', 'competitions')} hidden={current !== 'competitions'} className="cx-zone-panel">
        <div className="cx-stack">
          <CompetitionsSection chosen={data.competitions} available={data.available} requests={data.requests}
            defaults={{ price: mentor.price, minutes: mentor.minutes }} reload={reload} />
        </div>
      </div>
    </>}
  </main>;
}
