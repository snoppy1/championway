import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { post } from '../lib/api';
import { consultError, contactHref, contactKeys } from '../data/consult';
import type { ContactStatus, Contacts } from '../data/consult';
import { useI18n } from '../i18n';
import { ContactFlow } from './ContactFlow';
import { ContactSteps } from './hire';
import { nb } from './nb';
import { VerifyEmailNotice } from './VerifyEmailNotice';
import '../consult.css';

/* กล่อง "ติดต่อเมนเทอร์" บนโปรไฟล์เมนเทอร์ (โหมดตัวกลาง: เว็บแค่ให้ทั้งสองฝั่งติดต่อกัน คุยกันนอกเว็บ)
   ยังไม่เข้าสู่ระบบ → ชวนเข้าสู่ระบบ · ยังไม่ยืนยันอีเมล → ยืนยันก่อน · โปรไฟล์ของตัวเอง → ไปแก้ช่องทางในโซนเมนเทอร์
   กดติดต่อแล้วเห็นช่องทางทั้งห้า (ช่องว่างเป็น "-") แล้วเดินตามขั้นตอนจนรีวิว
   ช่องทางติดต่อเซิร์ฟเวอร์ส่งมาเฉพาะคนที่ยืนยันอีเมลแล้วและเคยกดติดต่อกับเมนเทอร์คนนี้ หน้านี้ไม่ได้เดาเอง */

export type ContactPanelData = {
  mentor: { id: string };
  competitions: { slug: string; name: string }[];
  viewer: null | { signedIn: boolean; emailVerified: boolean; isSelf: boolean };
  hire: null | { id: string; status: string; reviewed: boolean };
  contacts: Contacts | null;
};

function ContactList({ contacts }: { contacts: Contacts }) {
  const { t } = useI18n();
  const s = t.contact.profile;
  return <section aria-labelledby="channels-title">
    <h3 id="channels-title" tabIndex={-1}>{s.channelsTitle}</h3>
    <dl className="cx-contacts">
      {contactKeys.map((key) => {
        const value = contacts[key].trim();
        const href = contactHref(key, value);
        // ช่องที่ว่างแสดงเป็น "-" ตามที่ผู้ใช้สั่ง ค่าที่กรอกแล้วกดได้ทุกช่อง (ประกอบลิงก์จากค่าที่พิมพ์เอง ผ่าน contactHref)
        let content;
        if (!value) content = <><span className="cx-contacts__empty" aria-hidden="true">-</span><span className="sr-only">{s.notProvided}</span></>;
        else if (!href) content = value;
        else if (key === 'link') content = <a className="cx-contacts__ext" href={href} target="_blank" rel="noopener noreferrer"><span>{value}</span><ExternalLink size={14} aria-hidden="true" /></a>;
        else if (key === 'email' || key === 'phone') content = <a href={href}>{value}</a>;
        else content = <a href={href} target="_blank" rel="noopener noreferrer">{value}</a>;
        return <div key={key}><dt>{s.channels[key]}</dt><dd>{content}</dd></div>;
      })}
    </dl>
  </section>;
}

function ContactForm({ mentorId, competitions, initial, again, onDone }: {
  mentorId: string; competitions: ContactPanelData['competitions']; initial: string; again: boolean; onDone: () => Promise<void>;
}) {
  const { t } = useI18n();
  const s = t.contact.profile;
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
      {busy ? s.contacting : again ? t.contact.contactAgain : s.cta}
    </button>
  </form>;
}

export function ContactPanel({ data, competition, reload }: { data: ContactPanelData; competition: string; reload: () => Promise<void> }) {
  const { t } = useI18n();
  const s = t.contact.profile;
  const { viewer, hire, contacts, mentor } = data;
  const status = (hire?.status ?? null) as ContactStatus | null;
  const next = `/mentors/${mentor.id}${competition ? `?competition=${encodeURIComponent(competition)}` : ''}`;
  const initial = data.competitions.some((item) => item.slug === competition) ? competition : '';
  // ติดต่อใหม่ได้เมื่อรอบก่อนจบแล้ว: ยกเลิก ถูกปฏิเสธ หรือยืนยันและรีวิวแล้ว
  const canContactAgain = status === 'cancelled' || status === 'denied' || (status === 'completed' && Boolean(hire?.reviewed));

  // กดติดต่อแล้วปุ่มหายไป โฟกัสต้องไปอยู่ที่ช่องทางติดต่อที่เพิ่งขึ้นมา ไม่ใช่หลุดไปที่หน้าเปล่า
  const lastStatus = useRef(status);
  useEffect(() => {
    if (status === 'contacted' && lastStatus.current !== 'contacted') document.getElementById('channels-title')?.focus();
    lastStatus.current = status;
  }, [status]);

  let body;
  if (!viewer) {
    body = <>
      <p>{s.signInText}</p>
      <p><Link className="primary-button cx-button" to={`/signin?next=${encodeURIComponent(next)}`}>{s.signIn}</Link></p>
    </>;
  } else if (viewer.isSelf) {
    body = <>
      <p>{nb(s.ownText)}</p>
      <p><Link className="ghost-button cx-button" to="/mentor-zone">{s.ownLink}</Link></p>
    </>;
  } else if (!viewer.emailVerified) {
    body = <VerifyEmailNotice />;
  } else {
    body = <>
      <ContactSteps compact status={status === 'denied' || status === 'cancelled' ? null : status} reviewed={Boolean(hire?.reviewed)} />
      {contacts && <ContactList contacts={contacts} />}
      {hire && status && <ContactFlow contact={{ id: hire.id, status, reviewed: hire.reviewed }} onChange={reload} />}
      {(!hire || canContactAgain) && <ContactForm mentorId={mentor.id} competitions={data.competitions} initial={initial} again={Boolean(hire)} onDone={reload} />}
    </>;
  }

  return <section className="panel cx-contact" aria-labelledby="contact-title">
    <h2 id="contact-title">{s.title}</h2>
    {!hire && <p className="cx-lead">{nb(s.intro)}</p>}
    {body}
  </section>;
}
