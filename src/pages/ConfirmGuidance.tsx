import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { api, ApiError, post } from '../lib/api';
import { useI18n } from '../i18n';
import { formatDate } from '../i18n/format';
import { keepEnd } from '../components/nb';
import '../consult.css';

/* หน้าที่ลิงก์ในอีเมลของเมนเทอร์เปิด: /confirm?token=… ไม่ต้องเข้าสู่ระบบ
   เปิดหน้านี้เฉย ๆ ไม่เปลี่ยนอะไร (ระบบสแกนลิงก์ของอีเมลเปิดลิงก์ได้) การตอบต้องกดปุ่มในหน้าเว็บ ซึ่งส่ง POST
   สถานะ: ถามได้ (ยืนยัน / ไม่ใช่ พร้อมถามซ้ำ) · ตอบแล้วในหน้านี้ · มีคนตอบไปแล้ว · ลิงก์หมดอายุ · ลิงก์ไม่ถูกต้อง */

type LinkInfo = {
  usable: boolean; maskedEmail: string; expiresAt: string; status: string; expired: boolean; student: string; mentorName: string; competitionName: string | null; claimedAt: string | null;
};
type View = { kind: 'loading' } | { kind: 'invalid' } | { kind: 'error' } | { kind: 'link'; link: LinkInfo };

export function ConfirmGuidance() {
  const { t, lang } = useI18n();
  const s = t.contact.confirmPage;
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [answered, setAnswered] = useState<'yes' | 'no' | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [message, setMessage] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const noRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);

  const load = useCallback(async () => {
    if (token.length < 20) { setView({ kind: 'invalid' }); return; }
    setView({ kind: 'loading' });
    try {
      setView({ kind: 'link', link: await api<LinkInfo>(`/consult/confirm-link?token=${encodeURIComponent(token)}`) });
    } catch (failure) {
      setView({ kind: failure instanceof ApiError && failure.status === 404 ? 'invalid' : 'error' });
    }
  }, [token]);
  useEffect(() => { void load(); }, [load]);

  async function send(answer: 'yes' | 'no') {
    setBusy(answer);
    setMessage('');
    try {
      await post('/consult/confirm-link', { token, answer });
      setAnswered(answer);
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        // ถูกใช้ไปแล้วหรือหมดอายุระหว่างที่เปิดหน้านี้ อ่านสถานะใหม่ให้หน้าบอกตามจริง
        setMessage(s.conflict);
        setAsking(false);
        await load();
      } else {
        setMessage(s.failed);
      }
    } finally {
      setBusy(null);
    }
  }

  let content;
  if (view.kind === 'loading') {
    content = <p className="side-note" role="status">{s.loading}</p>;
  } else if (view.kind === 'invalid') {
    content = <Notice tone="bad" title={s.invalidTitle} text={s.invalidText} headingRef={headingRef} zone />;
  } else if (view.kind === 'error') {
    content = <div className="cx-state cx-state--error" role="alert">
      <h1 ref={headingRef} tabIndex={-1}>{s.pageTitle}</h1>
      <p>{s.failed}</p>
      <button type="button" className="ghost-button cx-button" onClick={() => { void load(); }}>{s.retry}</button>
    </div>;
  } else if (answered) {
    content = answered === 'yes'
      ? <Notice tone="ok" title={s.doneYesTitle} text={s.doneYesText} headingRef={headingRef} />
      : <Notice tone="ok" title={s.doneNoTitle} text={s.doneNoText} headingRef={headingRef} />;
  } else if (view.link.expired && view.link.status === 'claimed') {
    content = <Notice tone="wait" title={s.expiredTitle} text={s.expiredText} headingRef={headingRef} zone />;
  } else if (!view.link.usable) {
    content = <Notice tone="ok" title={s.answeredTitle} text={s.answeredText} headingRef={headingRef} />;
  } else {
    const { link } = view;
    content = <div className="cx-confirm-page">
      <h1 ref={headingRef} tabIndex={-1}>{keepEnd(s.usableTitle(link.student))}</h1>
      {/* ใครขอ เรื่องอะไร เมื่อไร: เมนเทอร์ตัดสินใจได้จากหน้านี้โดยไม่ต้องเปิดที่อื่น */}
      <dl className="cx-confirm-rows">
        <div><dt>{s.rowFor}</dt><dd>{link.mentorName}</dd></div>
        <div><dt>{s.rowCompetition}</dt><dd>{link.competitionName ?? s.rowNone}</dd></div>
        <div><dt>{s.rowDate}</dt><dd>{link.claimedAt ? formatDate(link.claimedAt, lang) : s.rowNone}</dd></div>
      </dl>
      <p className="cx-confirm-page__lead">{s.rightAway}</p>
      {!asking && <div className="cx-row">
        <button type="button" className="primary-button cx-button" disabled={busy !== null} onClick={() => { void send('yes'); }}>
          {busy === 'yes' ? s.sending : s.yes}</button>
        <button type="button" className="ghost-button cx-button" disabled={busy !== null}
          onClick={() => { setAsking(true); setMessage(''); requestAnimationFrame(() => noRef.current?.focus()); }}>{s.no}</button>
      </div>}
      {!asking && <ul className="cx-answers">
        <li><strong>{s.yes}</strong> {s.yesHint(link.student)}</li>
        <li><strong>{s.no}</strong> {s.noHint(link.student)}</li>
      </ul>}
      {asking && <div className="cx-confirm" role="group" aria-labelledby="no-ask">
        <p id="no-ask">{s.noAsk}</p>
        <p className="cx-hint">{s.noAskText}</p>
        <div className="cx-row">
          <button type="button" className="ghost-button cx-button cx-button--danger" disabled={busy !== null} onClick={() => { void send('no'); }}>
            {busy === 'no' ? s.sending : s.noYes}</button>
          <button type="button" ref={noRef} className="ghost-button cx-button" disabled={busy !== null} onClick={() => setAsking(false)}>{s.noBack}</button>
        </div>
      </div>}
      {link.maskedEmail && <p className="cx-hint cx-confirm-page__foot">{s.footnote(link.maskedEmail, formatDate(link.expiresAt, lang))}</p>}
    </div>;
  }

  // ข้อความ "ลิงก์เพิ่งถูกใช้" ต้องอยู่ต่อแม้หน้าเปลี่ยนเป็นสถานะ "ตอบไปแล้ว" ในรอบอ่านใหม่
  return <main id="main" tabIndex={-1} className="shell page cx-page">
    {content}
    <p className="cx-message cx-message--error cx-confirm-message" role="alert">{message}</p>
  </main>;
}

function Notice({ tone, title, text, headingRef, zone = false }: {
  tone: 'ok' | 'bad' | 'wait'; title: string; text: string; headingRef: RefObject<HTMLHeadingElement | null>; zone?: boolean;
}) {
  const { t } = useI18n();
  const Icon = tone === 'ok' ? CircleCheck : tone === 'wait' ? Clock : CircleAlert;
  return <div className="cx-verify" role={tone === 'bad' ? 'alert' : 'status'}>
    <Icon className={`cx-verify__icon${tone === 'ok' ? ' cx-verify__icon--ok' : tone === 'bad' ? ' cx-verify__icon--bad' : ''}`} aria-hidden="true" />
    <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
    <p>{text}</p>
    {zone && <div className="cx-row cx-row--center"><Link className="primary-button cx-button" to="/mentor-zone">{t.contact.confirmPage.toZone}</Link></div>}
  </div>;
}

