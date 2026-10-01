import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Paperclip, Send } from 'lucide-react';
import { ApiError, api, post } from '../lib/api';
import type { ChatMessage } from '../data/consult';
import { useI18n } from '../i18n';
import { formatLocalDateTime } from '../i18n/format';
import '../chat.css';

/* แชตของงานจ้าง (GET/POST /api/chats/:id/…) ห้องเดียวต่อคู่นักเรียนกับเมนเทอร์
   - ถามข้อความใหม่ทุก 4 วินาทีเมื่อแท็บมองเห็นอยู่ ด้วย ?after=<id ล่าสุด> ยังไม่มี websocket
   - ส่งแบบ optimistic: ข้อความขึ้นทันทีเป็น "กำลังส่ง" ถ้าล้มจะค้างเป็น "ยังไม่ได้ส่ง" กดลองอีกครั้งด้วย clientId เดิม
     เซิร์ฟเวอร์จึงรู้ว่าเป็นข้อความเดียวกัน ไม่ซ้ำสองอัน
   - ไฟล์ตรวจชนิดและขนาดที่เครื่องก่อนส่ง (เซิร์ฟเวอร์ตรวจจากเนื้อไฟล์จริงซ้ำ) ดาวน์โหลดผ่านลิงก์ที่เซิร์ฟเวอร์บังคับ attachment */

const POLL_MS = 4000;
const MAX_FILE = 4 * 1024 * 1024;
const FILE_TYPES = [
  'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const ACCEPT = [...FILE_TYPES, '.pptx', '.docx', '.xlsx'].join(',');

type Detail = { room: { id: string; mentorId: string; role: 'member' | 'mentor' }; mentorName: string; memberName: string };
type Outgoing = { clientId: string; text: string; file?: File; failed: boolean; at: number };
type Page = { messages: ChatMessage[]; hasMore: boolean };

/** ให้หัวเว็บกับรายการงานอ่านจำนวนที่ยังไม่อ่านใหม่ทันที ไม่ต้องรอรอบถามถัดไป */
export const CHAT_CHANGED = 'cw-chat-changed';
const announce = () => window.dispatchEvent(new Event(CHAT_CHANGED));

export function ChatPanel({ roomId }: { roomId: string }) {
  const { t, lang } = useI18n();
  const s = t.chat;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [stale, setStale] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | undefined>();
  const [fileError, setFileError] = useState('');
  const [outbox, setOutbox] = useState<Outgoing[]>([]);
  const [olderBusy, setOlderBusy] = useState(false);
  const [tries, setTries] = useState(0);
  const log = useRef<HTMLDivElement>(null);
  const upload = useRef<HTMLInputElement>(null);
  const list = useRef<ChatMessage[]>([]);
  const atBottom = useRef(true);
  const lastRead = useRef('');
  const live = useRef(true);
  const textId = useId();

  const merge = useCallback((incoming: ChatMessage[]) => {
    setMessages((old) => {
      const map = new Map([...old, ...incoming].map((message) => [message.id, message]));
      const sorted = [...map.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      list.current = sorted;
      return sorted;
    });
  }, []);

  const markRead = useCallback(async () => {
    const last = list.current.at(-1);
    if (!last || !atBottom.current || document.hidden || lastRead.current === last.id) return;
    try {
      await post(`/chats/${roomId}/read`, { messageId: last.id });
      lastRead.current = last.id;
      announce();
    } catch { /* รอบถัดไปลองใหม่ */ }
  }, [roomId]);

  /* โหลดครั้งแรก: รายละเอียดห้องกับข้อความล่าสุด 50 ข้อความ เปลี่ยนห้องแล้วเริ่มใหม่หมด */
  useEffect(() => {
    live.current = true;
    list.current = [];
    lastRead.current = '';
    atBottom.current = true;
    setMessages([]); setOutbox([]); setDetail(null); setError(''); setLoading(true); setStale(false);
    (async () => {
      try {
        const [d, page] = await Promise.all([api<Detail>(`/chats/${roomId}`), api<Page>(`/chats/${roomId}/messages`)]);
        if (!live.current) return;
        setDetail(d);
        setHasMore(page.hasMore);
        merge(page.messages);
      } catch (failure) {
        if (live.current) setError(failure instanceof ApiError ? failure.message : t.errors.unreachable);
      } finally {
        if (live.current) setLoading(false);
      }
    })();
    return () => { live.current = false; };
  }, [roomId, tries, merge, t.errors.unreachable]);

  /* ถามข้อความใหม่เป็นระยะ ไม่ถามตอนแท็บซ่อนอยู่ และไม่ถามซ้อนกัน */
  useEffect(() => {
    if (!detail) return;
    let running = false;
    const tick = async () => {
      if (running || document.hidden) return;
      running = true;
      try {
        const after = list.current.at(-1)?.id;
        const page = await api<Page>(`/chats/${roomId}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`);
        if (!live.current) return;
        if (page.messages.length) merge(page.messages);
        setStale(false);
      } catch { if (live.current) setStale(true); }
      running = false;
    };
    const timer = setInterval(() => { void tick(); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) void tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [detail, roomId, merge]);

  // ข้อความใหม่: เลื่อนลงล่างถ้าผู้ใช้อยู่ล่างสุดอยู่แล้ว แล้วบอกเซิร์ฟเวอร์ว่าอ่านแล้ว
  useEffect(() => {
    if (atBottom.current && log.current) log.current.scrollTop = log.current.scrollHeight;
    void markRead();
  }, [messages, outbox, markRead]);

  async function deliver(item: Outgoing) {
    const body = new FormData();
    body.set('clientId', item.clientId);
    body.set('text', item.text);
    if (item.file) body.set('file', item.file);
    try {
      const response = await fetch(`/api/chats/${roomId}/messages`, { method: 'POST', body, credentials: 'same-origin', headers: { 'x-lang': lang } });
      if (!response.ok) throw new Error(String(response.status));
      setOutbox((current) => current.filter((entry) => entry.clientId !== item.clientId));
      const after = list.current.at(-1)?.id;
      const page = await api<Page>(`/chats/${roomId}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`);
      if (live.current && page.messages.length) merge(page.messages);
      announce();
    } catch {
      setOutbox((current) => current.map((entry) => (entry.clientId === item.clientId ? { ...entry, failed: true } : entry)));
    }
  }

  function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() && !file) return;
    const item: Outgoing = { clientId: crypto.randomUUID(), text: text.trim(), file, failed: false, at: Date.now() };
    atBottom.current = true;
    setOutbox((current) => [...current, item]);
    setText('');
    setFile(undefined);
    setFileError('');
    if (upload.current) upload.current.value = '';
    void deliver(item);
  }

  function retry(item: Outgoing) {
    setOutbox((current) => current.map((entry) => (entry.clientId === item.clientId ? { ...entry, failed: false } : entry)));
    void deliver({ ...item, failed: false });
  }

  function pick(chosen: File | undefined) {
    setFileError('');
    if (!chosen) { setFile(undefined); return; }
    if (chosen.size > MAX_FILE) setFileError(s.fileTooBig);
    else if (!FILE_TYPES.includes(chosen.type)) setFileError(s.fileBadType);
    else { setFile(chosen); return; }
    setFile(undefined);
    if (upload.current) upload.current.value = '';
  }

  async function older() {
    const first = list.current[0];
    if (!first) return;
    setOlderBusy(true);
    const before = log.current?.scrollHeight ?? 0;
    try {
      const page = await api<Page>(`/chats/${roomId}/messages?before=${encodeURIComponent(first.id)}`);
      atBottom.current = false;
      merge(page.messages);
      setHasMore(page.hasMore);
      // ข้อความเก่าเพิ่มขึ้นด้านบน ต้องรักษาตำแหน่งที่อ่านอยู่ ไม่ให้เด้ง
      requestAnimationFrame(() => { if (log.current) log.current.scrollTop += log.current.scrollHeight - before; });
    } catch { setStale(true); } finally { setOlderBusy(false); }
  }

  if (loading) return <p className="side-note" role="status">{s.loading}</p>;
  if (error || !detail) return <div className="cx-state cx-state--error" role="alert">
    <h3>{s.errorTitle}</h3>
    <p>{error}</p>
    <button type="button" className="ghost-button cx-button" onClick={() => setTries((count) => count + 1)}>{s.retry}</button>
  </div>;

  const counterpart = detail.room.role === 'member' ? detail.mentorName : detail.memberName;
  const time = (iso: string) => formatLocalDateTime(iso, lang);

  return <section className="chat" aria-label={s.chatWith(counterpart)}>
    <div className="chat__log" ref={log} role="log" aria-label={s.log} aria-live="polite" tabIndex={0}
      onScroll={() => {
        const el = log.current!;
        atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        void markRead();
      }}>
      {hasMore && <button type="button" className="ghost-button cx-button chat__older" disabled={olderBusy} onClick={() => { void older(); }}>
        {olderBusy ? s.loadingOlder : s.loadOlder}
      </button>}
      {messages.length === 0 && outbox.length === 0 && <p className="chat__empty">{s.empty}</p>}
      {messages.map((message) => <article key={message.id} className={message.mine ? 'chat__message is-mine' : 'chat__message'}>
        <span className="chat__sender">{message.mine ? s.you : message.name}</span>
        <div className="chat__bubble">
          {message.body && <p>{message.body}</p>}
          {message.fileName && <a className="chat__file" href={`/api/chats/${roomId}/files/${message.id}`} download={message.fileName}
            aria-label={s.download(message.fileName)}><Paperclip size={14} aria-hidden="true" /><span>{message.fileName}</span></a>}
        </div>
        <small>{time(message.createdAt)}</small>
      </article>)}
      {outbox.map((item) => <article key={item.clientId} className="chat__message is-mine is-pending">
        <span className="chat__sender">{s.you}</span>
        <div className="chat__bubble">
          {item.text && <p>{item.text}</p>}
          {item.file && <span className="chat__file"><Paperclip size={14} aria-hidden="true" /><span>{item.file.name}</span></span>}
        </div>
        {item.failed
          ? <small className="chat__failed" role="alert">{s.notSent} · {s.sendFailed}{' '}
            <button type="button" className="link-button cx-link" onClick={() => retry(item)}>{s.retrySend}</button></small>
          : <small>{s.sending}</small>}
      </article>)}
    </div>
    {stale && <p className="cx-message cx-message--error" role="status">{s.connectionLost}</p>}

    <form className="chat__composer" onSubmit={send}>
      <label htmlFor={textId} className="sr-only">{s.messageLabel}</label>
      <textarea id={textId} rows={2} maxLength={4000} value={text} placeholder={s.messagePlaceholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) event.currentTarget.form?.requestSubmit(); }} />
      <div className="chat__tools">
        <label className="ghost-button cx-button chat__attach">
          <Paperclip size={16} aria-hidden="true" />{s.attach}
          <input ref={upload} type="file" accept={ACCEPT} onChange={(event) => pick(event.target.files?.[0])} />
        </label>
        <button className="primary-button cx-button" disabled={!text.trim() && !file}><Send size={16} aria-hidden="true" />{s.send}</button>
      </div>
      {file && <p className="chat__chosen"><Paperclip size={14} aria-hidden="true" /><span>{file.name}</span>
        <button type="button" className="link-button cx-link cx-link--quiet" onClick={() => { pick(undefined); if (upload.current) upload.current.value = ''; }}>{s.removeFile}</button></p>}
      <p className="cx-hint">{s.fileNote}</p>
      <p className="cx-message cx-message--error" role="alert">{fileError}</p>
    </form>
  </section>;
}
