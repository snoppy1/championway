import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MessageCircle, Paperclip, Send, Users, Video } from 'lucide-react';
import { useAuth } from '../data/auth';
import { api, post, ApiError } from '../lib/api';
import '../chat.css';

type Room = { id: string; title: string; context: string; status: string; ownerId: string; mentorUserId: string; meetingUrl: string; meetingAt: string | null };
type Member = { id: string; name: string; readAt: string | null };
type Invite = { id: string; title?: string; email?: string; expiresAt: string };
type Message = { id: string; senderId: string; name: string; body: string; fileName: string | null; fileMime: string | null; createdAt: string };
type Detail = { room: Room; members: Member[]; invites: Invite[] };
type Inbox = { rooms: Room[]; invites: Invite[]; requests: { id: string; title: string; context: string }[] };
const statusLabel: Record<string, string> = { pending: 'รอเมนเทอร์รับคำขอ', active: 'เมนเทอร์เข้ากลุ่มแล้ว', declined: 'เมนเทอร์ปฏิเสธคำขอ' };
const errorText = (e: unknown) => e instanceof Error ? e.message : 'เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง';
const date = (s: string) => new Date(s).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

export function Chats() {
  const { user, loading } = useAuth();
  const { id } = useParams();
  if (loading) return <main id="main" className="shell page">กำลังโหลดบัญชี…</main>;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(id ? `/chats/${id}` : '/chats')}`} replace />;
  return id ? <ChatRoom key={id} id={id} /> : <ChatInbox />;
}

function ChatInbox() {
  const [data, setData] = useState<Inbox>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const load = () => api<Inbox>('/chats').then(setData).catch(e => setError(errorText(e)));
  useEffect(() => { document.title = 'แชตของฉัน — ChampionWays'; void load(); const timer = setInterval(() => { if (!document.hidden) void load(); }, 5000); return () => clearInterval(timer); }, []);
  async function act(path: string, body: unknown) { setBusy(true); setError(''); try { await post(path, body); await load(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  return <main id="main" tabIndex={-1} className="shell page chat-page"><div className="chat-heading"><div><p className="eyebrow">YOUR TEAM SPACE</p><h1>แชตของฉัน</h1><p>คุยกับทีม เก็บไฟล์ และนัดพบเมนเทอร์ในที่เดียว</p></div><Link className="ghost-button" to="/mentors">หาเมนเทอร์</Link></div><p role="alert" className="chat-error">{error}</p>
    {!!data?.requests.length && <section className="panel"><h2>คำขอให้คุณเป็นเมนเทอร์</h2>{data.requests.map(r => <div className="chat-invite" key={r.id}><h3>{r.title}</h3><p>{r.context}</p><label className="chat-check"><input type="checkbox" checked={!!checks[r.id]} onChange={e => setChecks({ ...checks, [r.id]: e.target.checked })} />ฉันไม่ได้เป็นกรรมการตัดสินทีมนี้ และจะให้คำปรึกษาโดยไม่ทำงานแทน</label><div className="chat-buttons"><button disabled={busy} className="primary-button" onClick={() => void act(`/chats/requests/${r.id}`, { accept: true, noConflict: !!checks[r.id] })}>รับคำขอและเข้ากลุ่ม</button><button disabled={busy} className="ghost-button" onClick={() => void act(`/chats/requests/${r.id}`, { accept: false })}>ปฏิเสธ</button></div></div>)}</section>}
    {!!data?.invites.length && <section className="panel"><h2>คำเชิญเข้ากลุ่ม</h2><p>คำเชิญผูกกับอีเมลนี้ ต้องยืนยันอีเมลผ่าน Google ก่อนรับคำเชิญ</p>{data.invites.map(i => <div className="chat-invite" key={i.id}><h3>{i.title}</h3><small>หมดอายุ {date(i.expiresAt)}</small><button className="primary-button" disabled={busy} onClick={() => void act(`/chats/invites/${i.id}/accept`, {})}>ยอมรับคำเชิญ</button></div>)}</section>}
    <section className="chat-room-list" aria-label="กลุ่มของฉัน">{data?.rooms.map(r => <Link to={`/chats/${r.id}`} className="chat-room-card" key={r.id}><span className="chat-room-icon"><MessageCircle aria-hidden="true" /></span><div><h2>{r.title}</h2><p>{statusLabel[r.status]}</p></div><span aria-hidden="true">→</span></Link>)}{data && !data.rooms.length && <div className="empty-state"><MessageCircle aria-hidden="true" /><h2>ยังไม่มีกลุ่มสนทนา</h2><p>เลือกเมนเทอร์เพื่อเริ่มคำขอคุย หรือรับคำเชิญจากเจ้าของทีม</p></div>}{!data && !error && <p role="status">กำลังโหลดกลุ่ม…</p>}</section>
  </main>;
}

export function NewChat() {
  const { user, loading } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [context, setContext] = useState(params.get('context') ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading) return <main id="main" className="shell page">กำลังโหลด…</main>;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(`/chats/new?${params}`)}`} replace />;
  async function create(e: FormEvent) { e.preventDefault(); setBusy(true); setError(''); try { const r = await post<{ id: string }>('/chats', { mentorId: params.get('mentor'), title, context }); navigate(`/chats/${r.id}`); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } }
  return <main id="main" tabIndex={-1} className="shell page chat-page"><Link to="/mentors">← กลับไปเลือกเมนเทอร์</Link><div className="chat-create panel"><p className="eyebrow">START A CONVERSATION</p><h1>สร้างกลุ่มคุยกับเมนเทอร์</h1><p>คุณจะเป็นเจ้าของกลุ่ม และเป็นคนเดียวที่เชิญสมาชิกทีมได้ เมนเทอร์จะเห็นโจทย์ก่อนตัดสินใจรับคำขอ</p><form onSubmit={create}><label>ชื่อกลุ่ม<input required maxLength={80} value={title} onChange={e => setTitle(e.target.value)} placeholder="เช่น ทีม Next Step · เตรียม Pitch" /></label><label>เวทีและสิ่งที่อยากให้ช่วย<textarea required maxLength={1500} value={context} onChange={e => setContext(e.target.value)} placeholder="บอกเวทีที่เตรียมอยู่ ปัญหาที่ติด และผลลัพธ์ที่อยากได้" /></label><p className="notice">เป็นการส่งคำขอคุย ยังไม่ยืนยันคิวหรือเรียกเก็บเงิน</p><p role="alert" className="chat-error">{error}</p><button className="primary-button" disabled={busy}>{busy ? 'กำลังสร้างกลุ่ม…' : 'สร้างกลุ่มและส่งคำขอ'}</button></form></div></main>;
}

function ChatRoom({ id }: { id: string }) {
  const { user } = useAuth();
  const [detail, setDetail] = useState<Detail>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File>();
  const [email, setEmail] = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [meetingAt, setMeetingAt] = useState('');
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
    } catch (e) { if (live.current) { setError(errorText(e)); if (e instanceof ApiError && [401,403,404].includes(e.status)) { setDetail(undefined); setMessages([]); messageRef.current = []; } } }
  }
  useEffect(() => { live.current = true; let running = false; const tick = async () => { if (running || document.hidden) return; running = true; await refresh(); running = false; }; void tick(); const timer = setInterval(() => void tick(), 3000); return () => { live.current = false; clearInterval(timer); }; }, [id]);
  useEffect(() => { if (atBottom.current && log.current) log.current.scrollTop = log.current.scrollHeight; void markRead(); }, [messages]);
  async function act(path: string, body: unknown, method = 'POST') { setBusy(true); setError(''); try { await api(path, { method, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) }); await refresh(); return true; } catch (e) { setError(errorText(e)); return false; } finally { setBusy(false); } }
  async function send(e: FormEvent) {
    e.preventDefault(); if (!text.trim() && !file) return; setBusy(true); setError('');
    const body = new FormData(); body.set('text', text); body.set('clientId', retryId); if (file) body.set('file', file);
    try { const response = await fetch(`/api/chats/${id}/messages`, { method: 'POST', body, credentials: 'same-origin' }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'ส่งไม่สำเร็จ'); setText(''); setFile(undefined); if (upload.current) upload.current.value = ''; setRetryId(crypto.randomUUID()); atBottom.current = true; await refresh(); } catch (e) { setError(`${errorText(e)} — ข้อความยังอยู่ กดส่งเพื่อลองใหม่ได้`); } finally { setBusy(false); }
  }
  async function older() { setMoreBusy(true); const height = log.current?.scrollHeight ?? 0; try { const data = await api<{ messages: Message[]; hasMore: boolean }>(`/chats/${id}/messages?before=${messages[0].id}`); atBottom.current = false; merge(data.messages); setHasMore(data.hasMore); requestAnimationFrame(() => { if (log.current) log.current.scrollTop += log.current.scrollHeight - height; }); } catch (e) { setError(errorText(e)); } finally { setMoreBusy(false); } }
  const owner = detail?.room.ownerId === user!.id;
  return <main id="main" tabIndex={-1} className="shell page chat-page"><Link to="/chats" className="chat-back">← กลุ่มทั้งหมด</Link><p role="alert" className="chat-error">{error}</p>{!detail ? <p role="status">{error ? 'กลับไปหน้ากลุ่มเพื่อตรวจสิทธิ์หรือคำเชิญของคุณ' : 'กำลังโหลดห้องสนทนา…'}</p> : <>
    <header className="chat-heading"><div><p className="eyebrow">TEAM CONVERSATION</p><h1>{detail.room.title}</h1><p>{statusLabel[detail.room.status]} · {detail.members.length} สมาชิก</p></div><a className="ghost-button" href="#chat-members"><Users size={16} aria-hidden="true" /> สมาชิกกลุ่ม</a></header>
    <div className="chat-layout"><section className="chat-conversation" aria-label="ห้องสนทนา"><div className="chat-pinned"><strong>โจทย์ของทีม</strong><p>{detail.room.context}</p></div>{detail.room.meetingUrl && <div className="chat-meeting"><Video aria-hidden="true" /><div><strong>นัดคุยกับเมนเทอร์</strong><p>{date(detail.room.meetingAt!)}</p></div><a href={detail.room.meetingUrl} target="_blank" rel="noopener noreferrer" className="primary-button">เข้าร่วมคอล ↗</a></div>}
      <div className="chat-log" ref={log} role="log" aria-label="ข้อความในกลุ่ม" aria-live="polite" onScroll={() => { const el = log.current!; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; void markRead(); }}>{hasMore && <button className="ghost-button" disabled={moreBusy} onClick={() => void older()}>โหลดข้อความก่อนหน้า</button>}{!messages.length && <div className="chat-welcome"><MessageCircle size={32} aria-hidden="true" /><h2>เริ่มบทสนทนาของทีม</h2><p>แนะนำทีม หรือส่งโจทย์ที่อยากให้เมนเทอร์ช่วยดู</p></div>}{messages.map(m => <article className={`chat-message ${m.senderId === user!.id ? 'mine' : ''}`} key={m.id}><span className="chat-sender">{m.senderId === user!.id ? 'คุณ' : m.name}</span><div className="chat-bubble">{m.body && <p>{m.body}</p>}{m.fileName && <a href={`/api/chats/${id}/files/${m.id}`} target="_blank" rel="noopener noreferrer"><Paperclip size={14} aria-hidden="true" /> {m.fileName}</a>}</div><small>{date(m.createdAt)}{m.senderId === user!.id && ` · อ่านแล้ว ${detail.members.filter(member => member.id !== user!.id && member.readAt && new Date(member.readAt) >= new Date(m.createdAt)).length}`}</small></article>)}</div>
      <form className="chat-composer" onSubmit={send}><label htmlFor="chat-text" className="sr-only">ข้อความ</label><textarea id="chat-text" maxLength={4000} rows={2} disabled={busy || detail.room.status === 'declined'} value={text} onChange={e => { setText(e.target.value); setRetryId(crypto.randomUUID()); }} placeholder="พิมพ์ข้อความถึงทีม…" /><div className="chat-composer-actions"><label className="chat-file"><Paperclip size={18} aria-hidden="true" /><span>แนบไฟล์</span><input ref={upload} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" disabled={busy || detail.room.status === 'declined'} onChange={e => { const f = e.target.files?.[0]; if (f && f.size > 2 * 1024 * 1024) { setError('ไฟล์ต้องไม่เกิน 2 MB'); e.target.value = ''; setFile(undefined); } else { setFile(f); setRetryId(crypto.randomUUID()); } }} /></label><small>รูปภาพ / PDF ≤ 2 MB</small><button className="primary-button" disabled={busy || (!text.trim() && !file) || detail.room.status === 'declined'}><Send size={16} aria-hidden="true" />{busy ? 'กำลังส่ง…' : 'ส่ง'}</button></div>{file && <p className="chat-selected-file">{file.name} <button type="button" onClick={() => { setFile(undefined); if (upload.current) upload.current.value = ''; setRetryId(crypto.randomUUID()); }}>นำไฟล์ออก</button></p>}</form>
    </section><aside className="chat-sidebar"><section id="chat-members" className="panel"><h2>สมาชิกกลุ่ม</h2><ul>{detail.members.map(m => <li key={m.id}><div><strong>{m.name}</strong><small>{m.id === detail.room.ownerId ? 'เจ้าของกลุ่ม / ผู้ติดต่อจ้าง' : m.id === detail.room.mentorUserId ? 'เมนเทอร์' : 'สมาชิกทีม'}</small></div>{owner && ![detail.room.ownerId, detail.room.mentorUserId].includes(m.id) && <button className="link-button" onClick={() => { if (window.confirm(`นำ ${m.name} ออกจากกลุ่ม?`)) void act(`/chats/${id}/members/${m.id}`, {}, 'DELETE'); }} disabled={busy}>นำออก</button>}</li>)}</ul>{owner ? <form onSubmit={async e => { e.preventDefault(); if (await act(`/chats/${id}/invites`, { email })) { setEmail(''); setNotice('สร้างคำเชิญแล้ว ผู้รับจะเห็นในหน้าแชตเมื่อเข้าสู่ระบบด้วยอีเมลนี้ ไม่มีการส่งอีเมลอัตโนมัติ'); } }}><label>อีเมลสมาชิกที่ต้องการเชิญ<input type="email" required value={email} onChange={e => setEmail(e.target.value)} /></label><button className="ghost-button" disabled={busy}>เชิญสมาชิก</button><p role="status">{notice}</p></form> : <p className="chat-muted">เจ้าของกลุ่มเป็นผู้เพิ่มสมาชิกเท่านั้น</p>}{owner && detail.invites.map(i => <div className="chat-invite" key={i.id}><p>{i.email}</p><small>หมดอายุ {date(i.expiresAt)}</small><button disabled={busy} className="link-button" onClick={() => void act(`/chats/${id}/invites/${i.id}`, {}, 'DELETE')}>ยกเลิกคำเชิญ</button></div>)}</section>
    {detail.room.status === 'active' && (owner || detail.room.mentorUserId === user!.id) && <section className="panel"><h2>นัดหมายวิดีโอคอล</h2><p>ใช้ห้อง Meet หรือ Zoom ของคุณ แล้ววางลิงก์ให้ทีมเข้าร่วม</p><form onSubmit={e => { e.preventDefault(); void act(`/chats/${id}/meeting`, { url: meetingUrl, at: new Date(meetingAt).toISOString() }); }}><label>ลิงก์ Google Meet / Zoom<input type="url" required value={meetingUrl} onChange={e => setMeetingUrl(e.target.value)} placeholder="https://meet.google.com/…" /></label><label>วันเวลานัด (ตามเวลาในเครื่อง)<input type="datetime-local" required value={meetingAt} onChange={e => setMeetingAt(e.target.value)} /></label><button className="ghost-button" disabled={busy}>บันทึกนัดหมาย</button></form></section>}<p className="chat-muted">แชตอัปเดตประมาณทุก 3 วินาทีขณะเปิดหน้า · คำขอคุยนี้ยังไม่มีระบบชำระเงิน</p></aside></div>
  </>}</main>;
}
