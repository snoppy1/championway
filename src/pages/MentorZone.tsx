import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink, Search } from 'lucide-react';
import { useAuth } from '../data/auth';
import { api, ApiError, post } from '../lib/api';
import { useApi } from '../lib/useApi';
import { consultError, isWebLink, priceDraft, pricePayload, priceProblem } from '../data/consult';
import { PriceFields, samePrice as same } from '../components/PriceFields';
import { ClaimForm } from '../components/MentorClaim';
import type { Price } from '../data/consult';
import { bankCodes } from '../data/consult';
import type { MentorCard, MentorHire, PayoutAccount, Rating as RatingValue } from '../data/consult';
import { Avatar, Rating, RisingStarPill } from '../components/mentors';
import { CHAT_CHANGED } from '../components/ChatPanel';
import { HireSummary, StatusPill, UnreadBadge } from '../components/hire';
import { HireWorkspace } from '../components/HireWorkspace';
import { Tabs, panelId, tabId } from '../components/Tabs';
import { useI18n } from '../i18n';
import { formatDate, formatInputDate } from '../i18n/format';
import '../consult.css';

/* Mentor zone: ที่เดียวที่เมนเทอร์จัดการตัวเอง
   ตอบคำขอจ้าง (รับ/ปฏิเสธ) แชตกับนักเรียน เวทีที่รับปรึกษาพร้อมราคา และขอเพิ่มเวทีใหม่
   ลิงก์ในอีเมลแจ้งเตือนมาที่ /mentor-zone#hire-<id> หน้านี้เลื่อนไปที่คำขอนั้นให้เอง (ส่วนแชตใช้ #room-<id>)
   สิทธิ์ทั้งหมดตัดสินที่เซิร์ฟเวอร์ หน้านี้แค่ซ่อนสิ่งที่คนที่ไม่ใช่เมนเทอร์ใช้ไม่ได้ */

export type Chosen = { slug: string; name: string; closesAt: string; price: number | null; minutes: number | null; unit: string };
/** เวทีที่เลือกได้: verified = ทีมงานตรวจผลงานของเมนเทอร์ในเวทีนี้แล้ว เพิ่มได้ทันที ไม่อย่างนั้นต้องส่งหลักฐาน */
export type Open = {
  slug: string; name: string; org: string; closesAt: string; description: string; sourceUrl: string | null;
  verified: boolean; claimPending: boolean;
};
export type Request = {
  id: string; name: string; url: string; details: string; price: number; minutes: number | null; unit: string;
  status: 'pending' | 'approved' | 'rejected'; reason: string; createdAt: string;
};
type Zone = {
  mentor: null | (MentorCard & {
    risingStar: boolean; rating: RatingValue; price: number | null; minutes: number | null;
  });
  payoutAccount: PayoutAccount | null;
  competitions: Chosen[];
  available: Open[];
  requests: Request[];
  hires: MentorHire[];
};

const PAGE = 5;

type Reload = () => void;

/* ---------- คำขอจ้าง ---------- */

/* เรื่องเดียวที่เมนเทอร์ต้องรีบทำ จึงอยู่บนสุดและเป็นสีทอง ไม่มีคำขอที่รออยู่ก็ซ่อนทั้งส่วน
   รับงานแล้วห้องแชตเปิดทันที ปฏิเสธต้องมีเหตุผล (นักเรียนได้อ่านทางอีเมล)
   ที่ว่างข้างปุ่มรับงานไว้ให้ขั้นการชำระเงินแทรกระหว่าง "รับ" กับ "เปิดแชต" ได้ภายหลัง */
function RequestCard({ hire, reload, onDone, onAccepted }: { hire: MentorHire; reload: Reload; onDone: (message: string) => void; onAccepted: (id: string) => void }) {
  const { t, lang } = useI18n();
  const s = t.mentorZone;
  const { hash } = useLocation();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLLIElement>(null);
  const reasonId = useId();

  // มาจากลิงก์ในอีเมล: เลื่อนมาที่คำขอนี้และย้ายโฟกัสมาให้
  useEffect(() => {
    if (hash !== `#hire-${hire.id}`) return;
    cardRef.current?.scrollIntoView({ block: 'center' });
    cardRef.current?.focus({ preventScroll: true });
  }, [hash, hire.id]);

  async function accept() {
    setBusy('accept');
    setMessage('');
    try {
      await post(`/consult/${hire.id}/accept`, {});
      onDone(s.acceptedDone);
      reload();
      onAccepted(hire.id);
    } catch (failure) {
      setMessage(consultError(failure, t, 'mentor'));
      setBusy(null);
    }
  }

  async function decline(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) { setMessage(s.declineNeedReason); reasonRef.current?.focus(); return; }
    setBusy('decline');
    setMessage('');
    try {
      await post(`/consult/${hire.id}/decline`, { reason: reason.trim() });
      onDone(s.declinedDone);
      reload();
    } catch (failure) {
      setMessage(consultError(failure, t, 'mentor'));
      setBusy(null);
    }
  }

  return <li id={`hire-${hire.id}`} ref={cardRef} tabIndex={-1} className={hash === `#hire-${hire.id}` ? 'cx-request-card is-target' : 'cx-request-card'}>
    <div className="hw__head">
      <div>
        <h3>{s.hireFrom(hire.student)}</h3>
        <p className="cx-hint">{formatDate(hire.createdAt, lang)}</p>
      </div>
      <StatusPill status={hire.status} />
    </div>
    <HireSummary hire={hire} />
    {!declining
      ? <div className="cx-row">
        <button type="button" className="primary-button cx-button" disabled={busy !== null} aria-label={s.acceptAria(hire.student)}
          onClick={() => { void accept(); }}>{busy === 'accept' ? s.accepting : s.accept}</button>
        <button type="button" className="ghost-button cx-button" disabled={busy !== null} aria-label={s.declineAria(hire.student)}
          onClick={() => { setDeclining(true); requestAnimationFrame(() => reasonRef.current?.focus()); }}>{s.decline}</button>
      </div>
      : <form className="cx-form" onSubmit={(event) => { void decline(event); }} noValidate>
        <div className="cx-field">
          <label htmlFor={reasonId}>{s.declineReasonLabel}</label>
          <textarea id={reasonId} ref={reasonRef} rows={3} maxLength={1000} value={reason} disabled={busy !== null}
            onChange={(event) => { setReason(event.target.value); setMessage(''); }} />
          <p className="cx-hint">{s.declineReasonHint}</p>
        </div>
        <div className="cx-row">
          <button className="ghost-button cx-button cx-button--danger" disabled={busy !== null}>{busy === 'decline' ? s.declining : s.declineSend}</button>
          <button type="button" className="link-button cx-link cx-link--quiet" disabled={busy !== null} onClick={() => { setDeclining(false); setMessage(''); }}>{s.declineBack}</button>
        </div>
      </form>}
    <p className="cx-message cx-message--error" role="alert">{message}</p>
  </li>;
}

function RequestsPanel({ items, reload, onDone, onAccepted, noAccount, onAddAccount }: {
  items: MentorHire[]; reload: Reload; onDone: (message: string) => void; onAccepted: (id: string) => void;
  noAccount: boolean; onAddAccount: () => void;
}) {
  const { t } = useI18n();
  const s = t.mentorZone;
  // ยังไม่มีบัญชีรับเงิน: เตือนตรงนี้เพราะรับงานแล้วนักเรียนจ่ายเงิน เราต้องมีที่โอนให้
  const banner = noAccount && <p className="cx-banner cx-banner--requested">
    {t.payout.banner}{' '}<button type="button" className="link-button cx-link cx-link--text" onClick={onAddAccount}>{t.payout.bannerLink}</button>
  </p>;
  // มีคำขอรออยู่เป็นสีทอง (เรื่องเดียวที่ต้องรีบทำ) ไม่มีก็เป็นข้อความเรียบ ๆ
  if (items.length === 0) return <>{banner}<p className="cx-empty">{s.hiresEmpty}</p></>;
  return <>{banner}<section className="cx-section cx-section--urgent cx-section--flat" aria-label={s.hiresListLabel}>
    <p className="cx-lead">{s.hiresLead}</p>
    <ul className="cx-list cx-list--stack">
      {items.map((hire) => <RequestCard key={hire.id} hire={hire} reload={reload} onDone={onDone} onAccepted={onAccepted} />)}
    </ul>
  </section></>;
}

/* ---------- งานและแชต ---------- */

/** สถานะเงินของงานนี้ฝั่งเมนเทอร์: รอจ่าย → ถือไว้ → ถึงกำหนดจ่าย → โอนแล้ว (หรือพักไว้เพราะแจ้งปัญหา / คืนเงิน) */
function MoneyLine({ hire }: { hire: MentorHire }) {
  const { t, lang } = useI18n();
  const m = t.payout.money;
  const amount = (value: number) => t.price.total(value);
  let text: string | null = null;
  if (hire.status === 'accepted') text = m.waiting;
  else if (hire.status === 'paid') text = hire.disputedAt || hire.payout?.status === 'held' ? m.problem : m.held(amount(hire.payout?.amount ?? hire.price));
  else if (hire.status === 'completed') {
    const payout = hire.payout;
    if (payout?.status === 'paid') text = m.sent(amount(payout.amount), payout.paidAt ? formatDate(payout.paidAt, lang) : '');
    else if (payout?.status === 'cancelled') text = m.refunded;
    else text = m.due(amount(payout?.amount ?? hire.price));
  }
  return text ? <p className="cx-money" data-money={hire.status}>{text}</p> : null;
}

function ChatsPanel({ items }: { items: MentorHire[] }) {
  const { t } = useI18n();
  const s = t.mentorZone;
  const noteFor = (hire: MentorHire) => {
    switch (hire.status) {
      case 'accepted': return s.noteAccepted;
      case 'paid': return hire.disputedAt ? s.noteDisputed : s.notePaid;
      case 'declined': return s.noteDeclined;
      case 'cancelled': return s.noteCancelled;
      case 'completed': return s.noteCompleted;
      default: return null;
    }
  };
  if (items.length === 0) return <p className="cx-empty">{s.chatsEmpty}</p>;
  return <HireWorkspace
    items={items}
    nameOf={(hire) => hire.student}
    initialOf={(hire) => hire.student.slice(0, 1).toUpperCase()}
    noteFor={noteFor}
    renderActions={(hire) => <MoneyLine hire={hire} />}
    labels={{ list: s.chatsListLabel, back: s.backToList, detail: s.detailLabel, chat: s.chatTitle, noChat: (status) => (status === 'accepted' ? s.noChatPay : s.noChatYet) }}
    closedNote={t.consulting.chatClosedNote}
  />;
}

/* ---------- เงินของเมนเทอร์ ---------- */

const DAY = 86_400_000;
/** วันที่คาดว่าระบบจะปล่อยเงินเอง: จบเซสชัน (เวลานัดหรือเวลาจ่าย + ชั่วโมงที่จ้าง) + 3 วัน ตรงกับกติกาของเซิร์ฟเวอร์ (RELEASE_DAYS ใน hire-money.ts) */
const releaseDate = (hire: MentorHire) => new Date(new Date(hire.preferredAt ?? hire.paidAt ?? hire.createdAt).getTime() + hire.minutes * 60_000 + 3 * DAY).toISOString();

type MoneyKind = 'held' | 'problem' | 'due' | 'paid';
/** งานที่มีเงินเข้ามาแล้ว (จ่ายแล้ว) จัดเป็นสี่กลุ่ม: ถือไว้ แจ้งปัญหา รอโอน โอนแล้ว งานที่คืนเงินไม่นับ */
function moneyKind(hire: MentorHire): MoneyKind | null {
  if (hire.status === 'paid') return hire.disputedAt || hire.payout?.status === 'held' ? 'problem' : 'held';
  if (hire.status === 'completed') {
    if (hire.payout?.status === 'paid') return 'paid';
    if (hire.payout?.status === 'cancelled') return null;
    return 'due';
  }
  return null;
}

/** ตัวเลขสามช่องเรียงแถวเดียว (ถือไว้ / รอโอน / โอนแล้ว) แล้วรายการต่องาน: ชื่อนักเรียน เวที ยอด สถานะ และวันที่ */
function MoneySection({ hires }: { hires: MentorHire[] }) {
  const { t, lang } = useI18n();
  const s = t.payout;
  const rows = hires.map((hire) => ({ hire, kind: moneyKind(hire) })).filter((row): row is { hire: MentorHire; kind: MoneyKind } => row.kind !== null);
  const sum = (kinds: MoneyKind[]) => rows.filter((row) => kinds.includes(row.kind)).reduce((total, row) => total + (row.hire.payout?.amount ?? row.hire.price), 0);
  const figures = [
    { id: 'held', label: s.figHeld, hint: s.figHeldHint, value: sum(['held', 'problem']) },
    { id: 'due', label: s.figDue, hint: s.figDueHint, value: sum(['due']) },
    { id: 'paid', label: s.figPaid, hint: s.figPaidHint, value: sum(['paid']) },
  ];
  const dateLine = (hire: MentorHire, kind: MoneyKind) => {
    if (kind === 'held') return s.expected(formatDate(releaseDate(hire), lang));
    if (kind === 'problem') return s.waitingTeam;
    if (kind === 'due') return s.waitingTransfer;
    return s.sentOn(hire.payout?.paidAt ? formatDate(hire.payout.paidAt, lang) : '', hire.payout?.reference ?? '');
  };
  return <section className="panel cx-section" aria-labelledby="money-title">
    <h2 id="money-title">{s.moneyTitle}</h2>
    <p className="cx-lead">{s.moneyLead}</p>
    <dl className="cx-figures">
      {figures.map((figure) => <div key={figure.id} className={`cx-figure cx-figure--${figure.id}`}>
        <dt>{figure.label}</dt>
        <dd>{t.price.total(figure.value)}</dd>
        <dd className="cx-figure__hint">{figure.hint}</dd>
      </div>)}
    </dl>
    {rows.length === 0
      ? <p className="cx-empty">{s.listEmpty}</p>
      : <ul className="cx-money-list" aria-label={s.listLabel}>
        {rows.map(({ hire, kind }) => <li key={hire.id} className="cx-money-row">
          <div className="cx-money-row__who">
            <p className="cx-money-row__name">{hire.student}</p>
            {hire.competition && <p className="cx-hint">{hire.competition.name}</p>}
          </div>
          <p className="cx-money-row__amount">{t.price.total(hire.payout?.amount ?? hire.price)}</p>
          <div className="cx-money-row__state">
            <span className={`cx-pill cx-pill--money-${kind}`}>{s.rowStatus[kind]}</span>
            <p className="cx-hint">{dateLine(hire, kind)}</p>
          </div>
        </li>)}
      </ul>}
  </section>;
}

/* ---------- บัญชีรับเงิน ---------- */

/* เมนเทอร์กรอกชื่อบัญชี ธนาคาร และเลขบัญชี เซิร์ฟเวอร์เข้ารหัสเลขบัญชีและไม่ส่งกลับมาอีก (เห็นแค่ 4 ตัวท้าย)
   แก้บัญชีแล้วต้องตรวจใหม่ ฟอร์มจึงเปิดเมื่อกด "เปลี่ยนบัญชี" ไม่แสดงเลขเดิมให้แก้ */
function PayoutPanel({ account, reload }: { account: PayoutAccount | null; reload: Reload }) {
  const { t } = useI18n();
  const s = t.payout;
  const [editing, setEditing] = useState(account === null);
  const [name, setName] = useState('');
  const [bank, setBank] = useState('');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const bankRef = useRef<HTMLSelectElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);

  const fail = (note: string, focus?: HTMLElement | null) => { setFailed(true); setMessage(note); focus?.focus(); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) return fail(s.needName, nameRef.current);
    if (!bank) return fail(s.needBank, bankRef.current);
    if (!/^\d{10,15}$/.test(number.replace(/[\s-]/g, ''))) return fail(s.needNumber, numberRef.current);
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      await api('/consult/zone/payout-account', { method: 'PUT', body: JSON.stringify({ accountName: name.trim(), bankCode: bank, accountNumber: number }) });
      setName(''); setBank(''); setNumber('');
      setEditing(false);
      setMessage(s.saved);
      reload();
    } catch (failure) {
      fail(failure instanceof ApiError && failure.status === 409 ? s.unavailable : consultError(failure, t, 'mentor'));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel cx-section cx-section--small" aria-labelledby="payout-title">
    <h2 id="payout-title">{s.title}</h2>
    <p className="cx-lead">{s.lead}</p>
    {account && <div className="cx-account">
      <p className="cx-account__label">{s.current}</p>
      <p className="cx-account__name">{account.accountName}</p>
      <p>{s.masked(s.banks[account.bankCode] ?? account.bankCode, account.last4)}</p>
      <p className={account.status === 'failed' ? 'cx-pill cx-pill--cancelled' : account.status === 'verified' ? 'cx-pill cx-pill--confirmed' : 'cx-pill cx-pill--requested'}>{s.status[account.status]}</p>
      {/* คำอธิบายสถานะอยู่ใต้ป้ายในการ์ด (เดิมเป็นข้อความแยกว่า "บันทึกแล้ว เราจะตรวจ…") */}
      {(s.statusHelp[account.status] ?? '') !== '' && <p className="cx-hint">{s.statusHelp[account.status]}</p>}
    </div>}
    <p className={failed ? 'cx-message cx-message--error' : 'cx-message cx-message--ok'} role={failed ? 'alert' : 'status'}>{message}</p>
    {account && !editing && <button type="button" className="ghost-button cx-button" onClick={() => { setEditing(true); setMessage(''); }}>{s.change}</button>}
    {editing && <form className="cx-form" onSubmit={(event) => { void submit(event); }} noValidate>
      <div className="cx-field">
        <label htmlFor="payout-name">{s.accountName}</label>
        <input id="payout-name" ref={nameRef} maxLength={120} autoComplete="off" value={name} disabled={busy} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="cx-field">
        <label htmlFor="payout-bank">{s.bank}</label>
        <select id="payout-bank" ref={bankRef} value={bank} disabled={busy} onChange={(event) => setBank(event.target.value)}>
          <option value="">{s.bankPlaceholder}</option>
          {bankCodes.map((code) => <option key={code} value={code}>{s.banks[code]}</option>)}
        </select>
      </div>
      <div className="cx-field">
        <label htmlFor="payout-number">{s.accountNumber}</label>
        <input id="payout-number" ref={numberRef} inputMode="numeric" maxLength={20} autoComplete="off" value={number} disabled={busy}
          aria-describedby="payout-number-hint" onChange={(event) => setNumber(event.target.value)} />
        <p className="cx-hint" id="payout-number-hint">{s.accountNumberHint}</p>
      </div>
      <div className="cx-row">
        <button className="primary-button cx-button" disabled={busy}>{busy ? s.saving : s.save}</button>
        {account && <button type="button" className="link-button cx-link" disabled={busy} onClick={() => { setEditing(false); setMessage(''); }}>{s.cancelChange}</button>}
      </div>
    </form>}
  </section>;
}

/* ---------- ราคาต่อเวที ---------- */

function ChosenRow({ item, onChanged }: { item: Chosen; onChanged: (message: string) => void }) {
  const { t, lang } = useI18n();
  const s = t.mentorZone;
  const uid = useId();
  const saved = priceDraft(item.price, item.unit);
  const [price, setPrice] = useState(saved);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState('');
  const dirty = !same(price, saved);
  const askRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    const problem = priceProblem(price);
    if (problem) { setMessage(t.price.errors[problem]); return; }
    setBusy('save');
    setMessage('');
    try {
      await api(`/consult/zone/competitions/${encodeURIComponent(item.slug)}`, { method: 'PUT', body: JSON.stringify(pricePayload(price)) });
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
    <div className="cx-competition__top">
      <div className="cx-competition__head">
        <Link className="cx-list__title" to={`/competitions/${item.slug}#mentors`}>{item.name}</Link>
        <p className="cx-hint">{s.closes(formatInputDate(item.closesAt.slice(0, 10), lang))} · {t.price.line(item.price, item.minutes, item.unit)}</p>
      </div>
      {/* ลบเป็นปุ่มข้อความเงียบมุมขวาบน และถามก่อนลบ ไม่ให้กดพลาดแล้วหายไปเลย */}
      {!asking && <button type="button" ref={openRef} className="link-button cx-link cx-link--quiet" disabled={busy !== null}
        aria-label={s.removeAria(item.name)} onClick={() => { setAsking(true); requestAnimationFrame(() => askRef.current?.focus()); }}>{s.remove}</button>}
    </div>
    {asking && <div className="cx-confirm" role="group" aria-label={s.removeAsk(item.name)}>
      <p>{s.removeAsk(item.name)}</p>
      <div className="cx-row">
        <button type="button" className="ghost-button cx-button cx-button--danger" disabled={busy !== null} onClick={() => { void remove(); }}>{s.removeYes}</button>
        <button type="button" ref={askRef} className="ghost-button cx-button" disabled={busy !== null}
          onClick={() => { setAsking(false); requestAnimationFrame(() => openRef.current?.focus()); }}>{s.removeNo}</button>
      </div>
    </div>}
    <form className="cx-competition__form" onSubmit={(event) => { void save(event); }} noValidate>
      <PriceFields idPrefix={uid} value={price} disabled={busy !== null} label={t.price.modeLabel(item.name)}
        onChange={(next) => { setPrice(next); setMessage(''); }} />
      <button className="ghost-button cx-button" disabled={busy !== null || !dirty} aria-label={s.saveAria(item.name)}>
        {busy === 'save' ? s.saving : s.save}
      </button>
      <p className="cx-message cx-message--error cx-competition__message" role="alert">{message}</p>
    </form>
  </li>;
}

export function CompetitionsSection({ chosen, available, requests, reload }: {
  chosen: Chosen[]; available: Open[]; requests: Request[]; reload: Reload;
}) {
  const { t, lang } = useI18n();
  const s = t.mentorZone;
  const c = t.mentorClaim;
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [message, setMessage] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);

  const done = (note: string) => { setMessage(note); reload(); titleRef.current?.focus(); };
  const taken = new Set(chosen.map((item) => item.slug));
  const needle = query.trim().toLowerCase();
  // เวทีที่ตรวจผลงานแล้วขึ้นก่อน (เพิ่มได้ทันที) แล้วตามด้วยเวทีอื่นที่ต้องส่งหลักฐาน
  const open = available.filter((item) => !taken.has(item.slug)).sort((a, b) => Number(b.verified) - Number(a.verified));
  const matches = open.filter((item) => !needle || item.name.toLowerCase().includes(needle) || item.org.toLowerCase().includes(needle));

  return <>
    <section className="panel cx-section" aria-labelledby="my-competitions-title">
      <h2 id="my-competitions-title" tabIndex={-1} ref={titleRef}>{s.competitionsTitle}</h2>
      <p className="cx-message cx-message--ok" role="status">{message}</p>
      {chosen.length === 0 ? <p className="cx-empty">{s.competitionsEmpty}</p>
        : <ul className="cx-list cx-list--stack">{chosen.map((item) => <ChosenRow key={item.slug} item={item} onChanged={done} />)}</ul>}
    </section>

    <section className="panel cx-section" aria-labelledby="add-competition-title">
      <h2 id="add-competition-title">{c.listTitle}</h2>
      <p className="cx-lead">{c.listLead}</p>
      {open.length === 0 ? <p className="cx-empty">{c.empty}</p> : <>
        <div className="search-field cx-search">
          <Search size={18} aria-hidden="true" />
          <label className="sr-only" htmlFor="zone-search">{c.search}</label>
          <input id="zone-search" type="search" value={query} autoComplete="off" placeholder={c.searchPlaceholder}
            onChange={(event) => { setQuery(event.target.value); setLimit(PAGE); }} />
        </div>
        {matches.length === 0 ? <p className="cx-empty">{c.searchNone}</p> : <ul className="cx-list cx-list--stack">
          {matches.slice(0, limit).map((item) => <AddRow key={item.slug} item={item} lang={lang} onAdded={done} />)}
        </ul>}
        {matches.length > limit && <p><button type="button" className="ghost-button cx-button" onClick={() => setLimit(limit + PAGE)}>
          {s.showMore(matches.length - limit)}</button></p>}
      </>}
      {/* เวทีที่ยังไม่มีในระบบ: ฟอร์มเต็มแบบเดียวกับผู้จัด (โปสเตอร์ วันที่ รางวัล) เข้าคิวงานแข่งของแอดมินพร้อมป้าย Mentor request */}
      <p><Link className="cx-link cx-link--text" to="/mentor-zone/new-competition">{c.newCompetition}</Link></p>
    </section>

    {requests.length > 0 && <RequestList requests={requests} />}
  </>;
}

function AddRow({ item, lang, onAdded }: {
  item: Open; lang: 'en' | 'th'; onAdded: (message: string) => void;
}) {
  const { t } = useI18n();
  const s = t.mentorZone;
  const c = t.mentorClaim;
  const uid = useId();
  const [picking, setPicking] = useState(false);
  const [price, setPrice] = useState<Price>(priceDraft(null));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const priceRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const close = () => { setPicking(false); requestAnimationFrame(() => openRef.current?.focus()); };

  async function add(event: FormEvent) {
    event.preventDefault();
    const problem = priceProblem(price);
    if (problem) { setMessage(t.price.errors[problem]); return; }
    setBusy(true);
    setMessage('');
    try {
      await api(`/consult/zone/competitions/${encodeURIComponent(item.slug)}`, { method: 'PUT', body: JSON.stringify(pricePayload(price)) });
      onAdded(s.added);
    } catch (failure) {
      setMessage(consultError(failure, t, 'mentor'));
      setBusy(false);
    }
  }

  return <li className="cx-competition">
    <div className="cx-competition__top">
      <div className="cx-competition__head">
        <p className="cx-list__title">{item.name}
          {item.verified && <span className="cx-pill cx-pill--req-approved">{c.checked}</span>}
          {item.claimPending && <span className="cx-pill cx-pill--req-pending">{c.pending}</span>}
        </p>
        <p className="cx-hint">{s.organizer(item.org)} · {s.closes(formatInputDate(item.closesAt.slice(0, 10), lang))}</p>
        <details className="cx-details">
          <summary>{s.details}</summary>
          <p className="cx-prose">{item.description || s.noDetails}</p>
          {item.sourceUrl && isWebLink(item.sourceUrl) && <p><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
            {s.openSource}<ExternalLink size={14} aria-hidden="true" /></a></p>}
        </details>
        {/* ดูหน้าเวทีเต็มในแท็บใหม่ ฟอร์มที่กรอกค้างไว้ในหน้านี้ไม่หาย */}
        <p><a className="cx-link cx-link--text" href={`/competitions/${encodeURIComponent(item.slug)}`} target="_blank" rel="noopener"
          aria-label={c.viewAria(item.name)}>{c.view}<ExternalLink size={14} aria-hidden="true" /></a></p>
      </div>
      {!picking && !item.claimPending && <button type="button" ref={openRef} className="ghost-button cx-button"
        aria-label={item.verified ? s.addAria(item.name) : c.sendEvidenceAria(item.name)}
        onClick={() => { setPicking(true); requestAnimationFrame(() => priceRef.current?.querySelector('input')?.focus()); }}>
        {item.verified ? s.add : c.sendEvidence}</button>}
    </div>
    {/* ราคาถามหลังเลือกเวทีแล้วเท่านั้น ในแถวเดียวกัน ไม่ต้องมีการ์ดกรอกราคาซ้ำทุกเวที */}
    {picking && item.verified && <form className="cx-competition__form" onSubmit={(event) => { void add(event); }} noValidate>
      <div ref={priceRef}>
        <PriceFields idPrefix={uid} value={price} disabled={busy} label={t.price.modeLabel(item.name)}
          onChange={(next) => { setPrice(next); setMessage(''); }} />
      </div>
      <button className="primary-button cx-button" disabled={busy}>{busy ? s.saving : s.addConfirm}</button>
      <button type="button" className="link-button cx-link cx-link--quiet" disabled={busy} onClick={close}>{s.addCancel}</button>
      <p className="cx-message cx-message--error cx-competition__message" role="alert">{message}</p>
    </form>}
    {picking && !item.verified && <div ref={priceRef}><ClaimForm slug={item.slug} name={item.name} onSent={onAdded} onCancel={close} /></div>}
  </li>;
}

function RequestList({ requests }: { requests: Request[] }) {
  const { t, lang } = useI18n();
  const s = t.mentorZone;
  return <section className="panel cx-section" aria-labelledby="requests-title">
    <h2 id="requests-title">{s.requestsTitle}</h2>
    <ul className="cx-list cx-list--stack">
      {requests.map((request) => <li key={request.id} className="cx-request">
        <div>
          <p className="cx-list__title">{isWebLink(request.url)
            ? <a href={request.url} target="_blank" rel="noopener noreferrer">{request.name}<ExternalLink size={14} aria-hidden="true" /></a>
            : request.name}</p>
          <p className="cx-hint">{s.requestedOn(formatDate(request.createdAt, lang))} · {t.price.line(request.price, request.minutes, request.unit)}</p>
          {request.details && <p className="cx-prose">{request.details}</p>}
          {request.status === 'rejected' && request.reason && <p className="cx-prose">{s.requestReason(request.reason)}</p>}
        </div>
        <span className={`cx-pill cx-pill--req-${request.status}`}>{s.requestStatus[request.status]}</span>
      </li>)}
    </ul>
  </section>;
}

/* ---------- หน้า ---------- */

type ZoneTab = 'requests' | 'chats' | 'payouts' | 'competitions';

export function HireMentorZone() {
  const { t } = useI18n();
  const s = t.mentorZone;
  const { user, loading: authLoading } = useAuth();
  const { hash } = useLocation();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useApi<Zone>(user ? '/consult/zone' : null);
  const [tab, setTab] = useState<ZoneTab | null>(null);
  const [notice, setNotice] = useState('');
  // เพิ่งกดรับงานที่ข้อมูลยังไม่โหลดใหม่ ให้ถือว่าอยู่ฝั่งแชตแล้ว ไม่งั้นลิงก์ลึกจะดึงกลับไปแท็บคำขอ
  const accepted = useRef(new Set<string>());
  // ข้อความใหม่ในแชตหรืออ่านแล้ว จำนวนที่ยังไม่อ่านบนรายการต้องเปลี่ยนตาม
  useEffect(() => {
    window.addEventListener(CHAT_CHANGED, reload);
    return () => window.removeEventListener(CHAT_CHANGED, reload);
  }, [reload]);

  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);
  // นักเรียนจ่ายเงินในอีกแท็บหรืออีกเครื่อง แชตเปิดเอง หน้านี้จึงอ่านใหม่เป็นระยะตอนแท็บมองเห็น
  useEffect(() => {
    const timer = setInterval(() => { if (!document.hidden) reload(); }, 20_000);
    return () => clearInterval(timer);
  }, [reload]);

  const hires = data?.hires;
  const requested = (hires ?? []).filter((hire) => hire.status === 'requested');
  const rest = (hires ?? []).filter((hire) => hire.status !== 'requested');

  /* แท็บเริ่มต้น: มีคำขอรอก็เปิดคำขอ ไม่มีแต่มีงานก็เปิดงานและแชต นอกนั้นเปิดเวที
     ลิงก์ลึกชนะค่าเริ่มต้น: #hire-<id> ไปแท็บคำขอถ้างานยังรออยู่ ไม่อย่างนั้นไปแท็บแชต #room-<id> ไปแท็บแชตเสมอ */
  useEffect(() => {
    if (!hires) return;
    // มาจากกล่องรับปรึกษาบนหน้าเวที
    if (hash === '#competitions') { setTab('competitions'); return; }
    const match = /^#(room|hire)-(.+)$/.exec(hash);
    if (match) {
      const found = hires.find((hire) => (match[1] === 'room' ? hire.roomId : hire.id) === match[2]);
      if (found) { setTab(found.status === 'requested' && !accepted.current.has(found.id) ? 'requests' as ZoneTab : 'chats'); return; }
    }
    setTab((current) => current ?? (requested.length ? 'requests' as ZoneTab : rest.length ? 'chats' : 'competitions'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash, hires === undefined]);

  if (authLoading) return <main id="main" tabIndex={-1} className="shell page cx-page"><p className="side-note" role="status">{s.loading}</p></main>;
  // เก็บ #hire-… ไว้ใน next ด้วย เข้าสู่ระบบเสร็จจะได้กลับมาที่คำขอจากอีเมลได้
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(`/mentor-zone${hash}`)}`} replace />;

  const mentor = data?.mentor;
  const current: ZoneTab = tab ?? 'chats';
  const unreadChats = rest.reduce((sum, hire) => sum + hire.unread, 0);

  return <main id="main" tabIndex={-1} className="shell page cx-page cx-page--wide">
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
        <Avatar initial={mentor.initial} plain={!mentor.risingStar} photoUrl={mentor.photoUrl} />
        <div>
          <p className="cx-me__name">{mentor.name}{mentor.risingStar && <RisingStarPill />}</p>
          <p className="cx-hint">{s.ratingThisMonth}: <Rating rating={mentor.rating} /></p>
        </div>
        <Link className="ghost-button cx-button" to={`/mentors/${mentor.id}`}>{s.publicProfile}</Link>
      </section>

      <Tabs prefix="zone" label={s.tabsLabel} value={current} onChange={(id) => setTab(id)} tabs={[
        { id: 'requests' as ZoneTab, label: s.tabRequests(requested.length) },
        { id: 'chats' as ZoneTab, label: <>{s.tabChats}{unreadChats > 0 && <UnreadBadge count={unreadChats} />}</> },
        { id: 'payouts' as ZoneTab, label: t.payout.tab },
        { id: 'competitions' as ZoneTab, label: s.tabCompetitions },
      ]} />
      <p className="cx-message cx-message--ok" role="status">{notice}</p>

      <div role="tabpanel" id={panelId('zone', 'requests')} aria-labelledby={tabId('zone', 'requests')} hidden={current !== 'requests'} className="cx-zone-panel">
        <RequestsPanel items={requested} reload={reload} onDone={setNotice} noAccount={data.payoutAccount === null} onAddAccount={() => setTab('payouts')}
          onAccepted={(id) => { accepted.current.add(id); setTab('chats'); navigate({ hash: `#hire-${id}` }, { replace: true }); }} />
      </div>
      <div role="tabpanel" id={panelId('zone', 'chats')} aria-labelledby={tabId('zone', 'chats')} hidden={current !== 'chats'} className="cx-zone-panel">
        <ChatsPanel items={rest} />
      </div>
      <div role="tabpanel" id={panelId('zone', 'payouts')} aria-labelledby={tabId('zone', 'payouts')} hidden={current !== 'payouts'} className="cx-zone-panel">
        <div className="cx-stack">
          <MoneySection hires={data.hires} />
          <PayoutPanel account={data.payoutAccount} reload={reload} />
        </div>
      </div>
      <div role="tabpanel" id={panelId('zone', 'competitions')} aria-labelledby={tabId('zone', 'competitions')} hidden={current !== 'competitions'} className="cx-zone-panel">
        <div className="cx-stack">
          <CompetitionsSection chosen={data.competitions} available={data.available} requests={data.requests} reload={reload} />
        </div>
      </div>
    </>}
  </main>;
}
