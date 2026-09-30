import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { MessageCircle, Paperclip, Send, Users } from 'lucide-react';
import { useAuth } from '../data/auth';
import { api, post, ApiError } from '../lib/api';
import { useI18n } from '../i18n';
import { formatDateTime, formatLocalDateTime } from '../i18n/format';
import '../chat.css';

type Room = { id: string; title: string; context: string; status: string; ownerId: string; mentorUserId: string };
type Member = { id: string; name: string; readAt: string | null };
type Invite = { id: string; title?: string; email?: string; expiresAt: string };
type Message = { id: string; senderId: string; name: string; body: string; fileName: string | null; fileMime: string | null; createdAt: string };
type Appointment = { id: string; title: string; context: string; eventName: string; startsAt: string; endsAt: string; status: string };
type Detail = { room: Room; members: Member[]; invites: Invite[]; appointments: Appointment[] };
type Inbox = { rooms: Room[]; invites: Invite[] };
/* กลุ่มเกิดจากนัดที่เมนเทอร์รับแล้วเท่านั้น จึงเป็น active ตั้งแต่แรก
   สองสถานะที่เหลือไว้อ่านห้องเก่าที่สร้างก่อนเปลี่ยนเส้นทาง */
const errorText = (e: unknown, fallback: string) => e instanceof Error ? e.message : fallback;

function Appointments({ detail }: { detail: Detail }) {
  const { t, lang } = useI18n();
  const s = t.chats;
  const appointments = detail.appointments ?? [];
  const next = appointments.find(item => item.status === 'confirmed');
  const history = appointments.filter(item => item.id !== next?.id);
  const render = (item: Appointment) => <article key={item.id}>
    <strong>{item.title} · {item.eventName}</strong>
    <p>{formatDateTime(item.startsAt, lang)} – {formatDateTime(item.endsAt, lang)} {t.journey.thaiTimeNote}</p>
    <p>{s.appointmentStatus[item.status] ?? item.status}</p>
    <p className="appointment-context">{item.context}</p>
  </article>;
  return <section className="chat-pinned" aria-label={s.appointmentsLabel}>
    <h2>{next ? s.upcoming : s.groupAppointments}</h2>
    {next && render(next)}
    {!!history.length && <details><summary>{s.history(history.length)}</summary>{history.map(render)}</details>}
    {!appointments.length && <><strong>{s.teamBrief}</strong><p className="appointment-context">{detail.room.context}</p><p>{s.noAppointments}</p></>}
    <small>{s.appointmentNote}</small>
  </section>;
}

export function Chats() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const { id } = useParams();
  if (loading) return <main id="main" className="shell page">{t.chats.loadingAccount}</main>;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(id ? `/chats/${id}` : '/chats')}`} replace />;
  return id ? <ChatRoom key={id} id={id} /> : <ChatInbox />;
}

function ChatInbox() {
  const { t, lang } = useI18n();
  const s = t.chats;
  const [data, setData] = useState<Inbox>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api<Inbox>('/chats').then(setData).catch(e => setError(errorText(e, s.connectFailed)));
  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 5000); return () => clearInterval(timer); }, []);
  async function act(path: string, body: unknown) { setBusy(true); setError(''); try { await post(path, body); await load(); } catch (e) { setError(errorText(e, s.connectFailed)); } finally { setBusy(false); } }
  return <main id="main" tabIndex={-1} className="shell page chat-page"><div className="chat-heading"><div><p className="eyebrow">{s.eyebrow}</p><h1>{s.pageTitle}</h1><p>{s.lead}</p></div><Link className="ghost-button" to="/explore">{s.findCta}</Link></div><p role="alert" className="chat-error">{error}</p>
    {!!data?.invites.length && <section className="panel"><h2>{s.invitesTitle}</h2><p>{s.invitesNote}</p>{data.invites.map(i => <div className="chat-invite" key={i.id}><h3>{i.title}</h3><small>{s.expires(formatLocalDateTime(i.expiresAt, lang))}</small><button className="primary-button" disabled={busy} onClick={() => void act(`/chats/invites/${i.id}/accept`, {})}>{s.accept}</button></div>)}</section>}
    <section className="chat-room-list" aria-label={s.groupsLabel}>{data?.rooms.map(r => <Link to={`/chats/${r.id}`} className="chat-room-card" key={r.id}><span className="chat-room-icon"><MessageCircle aria-hidden="true" /></span><div><h2>{r.title}</h2><p>{s.roomStatus[r.status]}</p></div><span aria-hidden="true">→</span></Link>)}{data && !data.rooms.length && <div className="empty-state"><MessageCircle aria-hidden="true" /><h2>{s.noGroups}</h2><p>{s.noGroupsText}</p></div>}{!data && !error && <p role="status">{s.loadingGroups}</p>}</section>
  </main>;
}

function ChatRoom({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const s = t.chats;
  const { user } = useAuth();
  const [detail, setDetail] = useState<Detail>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File>();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [retryId, setRetryId] = useState(() => crypto.randomUUID());
  const log = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const lastRead = useRef('');
  const atBottom = useRef(true);
  const messageRef = useRef<Message[]>([]);
  const live = useRef(true);
  const merge = (incoming: Message[]) => setMessages(old => { const map = new Map([...old, ...incoming].map(m => [m.id, m])); const list = [...map.values()].sort((a,b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)); messageRef.current = list; return list; });
  async function markRead() {
    const last = messageRef.current.at(-1);
    if (!last || !atBottom.current || document.hidden || lastRead.current === last.id) return;
    try { await post(`/chats/${id}/read`, { messageId: last.id }); lastRead.current = last.id; } catch { /* Retry after the next refresh. */ }
  }
  async function refresh() {
    try {
      const after = messageRef.current.at(-1)?.id;
      const [d, m] = await Promise.all([api<Detail>(`/chats/${id}`), api<{ messages: Message[]; hasMore: boolean }>(`/chats/${id}/messages${after ? `?after=${after}` : ''}`)]);
      if (!live.current) return;
      setDetail(d); document.title = `${d.room.title} — ChampionWays`;
      if (!messageRef.current.length) setHasMore(m.hasMore);
      merge(m.messages);
    } catch (e) { if (live.current) { setError(errorText(e, s.connectFailed)); if (e instanceof ApiError && [401,403,404].includes(e.status)) { setDetail(undefined); setMessages([]); messageRef.current = []; } } }
  }
  useEffect(() => { live.current = true; let running = false; const tick = async () => { if (running || document.hidden) return; running = true; await refresh(); running = false; }; void tick(); const timer = setInterval(() => void tick(), 3000); return () => { live.current = false; clearInterval(timer); }; }, [id]);
  useEffect(() => { if (atBottom.current && log.current) log.current.scrollTop = log.current.scrollHeight; void markRead(); }, [messages]);
  async function act(path: string, body: unknown, method = 'POST') { setBusy(true); setError(''); try { await api(path, { method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }); await refresh(); return true; } catch (e) { setError(errorText(e, s.connectFailed)); return false; } finally { setBusy(false); } }
  async function send(e: FormEvent) {
    e.preventDefault(); if (!text.trim() && !file) return; setBusy(true); setError('');
    const body = new FormData(); body.set('text', text); body.set('clientId', retryId); if (file) body.set('file', file);
    try { const response = await fetch(`/api/chats/${id}/messages`, { method: 'POST', body, credentials: 'same-origin' }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? s.sendFailed); setText(''); setFile(undefined); if (upload.current) upload.current.value = ''; setRetryId(crypto.randomUUID()); atBottom.current = true; await refresh(); } catch (e) { setError(s.retryHint(errorText(e, s.connectFailed))); } finally { setBusy(false); }
  }
  async function older() { setMoreBusy(true); const height = log.current?.scrollHeight ?? 0; try { const data = await api<{ messages: Message[]; hasMore: boolean }>(`/chats/${id}/messages?before=${messages[0].id}`); atBottom.current = false; merge(data.messages); setHasMore(data.hasMore); requestAnimationFrame(() => { if (log.current) log.current.scrollTop += log.current.scrollHeight - height; }); } catch (e) { setError(errorText(e, s.connectFailed)); } finally { setMoreBusy(false); } }
  const owner = detail?.room.ownerId === user!.id;
  return <main id="main" tabIndex={-1} className="shell page chat-page"><Link to="/chats" className="chat-back">{s.back}</Link><p role="alert" className="chat-error">{error}</p>{!detail ? <p role="status">{error ? s.recover : s.loadingRoom}</p> : <>
    <header className="chat-heading"><div><p className="eyebrow">{s.roomEyebrow}</p><h1>{detail.room.title}</h1><p>{s.roomStatus[detail.room.status]} · {s.memberCount(detail.members.length)}</p></div><a className="ghost-button" href="#chat-members"><Users size={16} aria-hidden="true" /> {s.membersButton}</a></header>
    <div className="chat-layout"><section className="chat-conversation" aria-label={s.conversation}><Appointments detail={detail} />      <div className="chat-log" ref={log} role="log" aria-label={s.log} aria-live="polite" onScroll={() => { const el = log.current!; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; void markRead(); }}>{hasMore && <button className="ghost-button" disabled={moreBusy} onClick={() => void older()}>{s.loadOlder}</button>}{!messages.length && <div className="chat-welcome"><MessageCircle size={32} aria-hidden="true" /><h2>{s.welcomeTitle}</h2><p>{s.welcomeText}</p></div>}{messages.map(m => <article className={`chat-message ${m.senderId === user!.id ? 'mine' : ''}`} key={m.id}><span className="chat-sender">{m.senderId === user!.id ? s.you : m.name}</span><div className="chat-bubble">{m.body && <p>{m.body}</p>}{m.fileName && <a href={`/api/chats/${id}/files/${m.id}`} target="_blank" rel="noopener noreferrer"><Paperclip size={14} aria-hidden="true" /> {m.fileName}</a>}</div><small>{formatLocalDateTime(m.createdAt, lang)}{m.senderId === user!.id && s.readBy(detail.members.filter(member => member.id !== user!.id && member.readAt && new Date(member.readAt) >= new Date(m.createdAt)).length)}</small></article>)}</div>
      <form className="chat-composer" onSubmit={send}><label htmlFor="chat-text" className="sr-only">{s.messageLabel}</label><textarea id="chat-text" maxLength={4000} rows={2} disabled={busy || detail.room.status === 'declined'} value={text} onChange={e => { setText(e.target.value); setRetryId(crypto.randomUUID()); }} placeholder={s.messagePlaceholder} /><div className="chat-composer-actions"><label className="chat-file"><Paperclip size={18} aria-hidden="true" /><span>{s.attach}</span><input ref={upload} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" disabled={busy || detail.room.status === 'declined'} onChange={e => { const f = e.target.files?.[0]; if (f && f.size > 2 * 1024 * 1024) { setError(s.fileTooBig); e.target.value = ''; setFile(undefined); } else { setFile(f); setRetryId(crypto.randomUUID()); } }} /></label><small>{s.fileNote}</small><button className="primary-button" disabled={busy || (!text.trim() && !file) || detail.room.status === 'declined'}><Send size={16} aria-hidden="true" />{busy ? s.sending : s.send}</button></div>{file && <p className="chat-selected-file">{file.name} <button type="button" onClick={() => { setFile(undefined); if (upload.current) upload.current.value = ''; setRetryId(crypto.randomUUID()); }}>{s.removeFile}</button></p>}</form>
    </section><aside className="chat-sidebar"><section id="chat-members" className="panel"><h2>{s.membersTitle}</h2><ul>{detail.members.map(m => <li key={m.id}><div><strong>{m.name}</strong><small>{m.id === detail.room.ownerId ? s.roleOwner : m.id === detail.room.mentorUserId ? s.roleMentor : s.roleMember}</small></div>{owner && ![detail.room.ownerId, detail.room.mentorUserId].includes(m.id) && <button className="link-button" onClick={() => { if (window.confirm(s.removeMemberConfirm(m.name))) void act(`/chats/${id}/members/${m.id}`, {}, 'DELETE'); }} disabled={busy}>{s.removeMember}</button>}</li>)}</ul>{owner ? <form onSubmit={async e => { e.preventDefault(); if (await act(`/chats/${id}/invites`, { email })) { setEmail(''); setNotice(s.inviteCreated); } }}><label>{s.inviteEmail}<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label><button className="ghost-button" disabled={busy}>{s.inviteMember}</button><p role="status">{notice}</p></form> : <p className="chat-muted">{s.ownerOnly}</p>}{owner && detail.invites.map(i => <div className="chat-invite" key={i.id}><p>{i.email}</p><small>{s.expires(formatLocalDateTime(i.expiresAt, lang))}</small><button disabled={busy} className="link-button" onClick={() => void act(`/chats/${id}/invites/${i.id}`, {}, 'DELETE')}>{s.cancelInvite}</button></div>)}</section>
    <section className="panel"><h2>{s.timeTitle}</h2><p className="chat-muted">{s.timeBefore}<Link to="/profile">{s.timeLink}</Link>{s.timeAfter}</p></section><p className="chat-muted">{s.pollNote}</p></aside></div>
  </>}</main>;
}
