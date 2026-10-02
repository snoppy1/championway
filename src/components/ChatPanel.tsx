import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Download, File as FileIcon, FileSpreadsheet, FileText, Image as ImageIcon, Paperclip, Presentation, Send } from 'lucide-react';
import { ApiError, api, post } from '../lib/api';
import type { ChatMessage } from '../data/consult';
import { useI18n } from '../i18n';
import { formatTime, locales } from '../i18n/format';
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

type Detail = {
  room: { id: string; mentorId: string; role: 'member' | 'mentor' }; mentorName: string; memberName: string;
  hires: { status: string }[];
};
type Outgoing = { clientId: string; text: string; file?: File; failed: boolean; at: number };
type Page = { messages: ChatMessage[]; hasMore: boolean };

const DAY = 'Asia/Bangkok';
const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: DAY }).format(new Date(iso));

/** ชนิดไฟล์จาก mime ใช้เลือกไอคอนกับคำเรียกบนการ์ดไฟล์ */
function kindOf(mime: string | null): 'pdf' | 'image' | 'slides' | 'document' | 'sheet' | 'file' {
  if (!mime) return 'file';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('presentationml')) return 'slides';
  if (mime.includes('wordprocessingml')) return 'document';
  if (mime.includes('spreadsheetml')) return 'sheet';
  return 'file';
}
const kindIcon = { pdf: FileText, image: ImageIcon, slides: Presentation, document: FileText, sheet: FileSpreadsheet, file: FileIcon };

/** ข้อความที่ส่งต่อกันจากคนเดียวกันในวันเดียวกันรวมเป็นกลุ่มเดียว ชื่อผู้ส่งขึ้นที่หัวกลุ่ม (ของเราไม่มีป้ายชื่อ)
    เวลาขึ้นใต้ฟองสุดท้ายของกลุ่ม และมีเส้นบอกวันหนึ่งครั้งต่อวัน */
type Row =
  | { type: 'day'; key: string; label: string }
  | { type: 'group'; key: string; mine: boolean; name: string; items: ChatMessage[] };
function rowsOf(messages: ChatMessage[], dayLabel: (iso: string) => string): Row[] {
  const rows: Row[] = [];
  let lastDay = '';
  for (const message of messages) {
    const day = dayKey(message.createdAt);
    if (day !== lastDay) { rows.push({ type: 'day', key: `day-${day}`, label: dayLabel(message.createdAt) }); lastDay = day; }
    const last = rows.at(-1);
    if (last?.type === 'group' && last.mine === message.mine && last.name === message.name) last.items.push(message);
    else rows.push({ type: 'group', key: message.id, mine: message.mine, name: message.name, items: [message] });
  }
  return rows;
}

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
  const hintId = useId();
  const field = useRef<HTMLTextAreaElement>(null);

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
    if (field.current) field.current.style.height = '';
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

  // เซิร์ฟเวอร์ปฏิเสธการส่ง (409) ถ้าไม่มีงานที่จ่ายเงินแล้วในห้อง จึงปิดช่องพิมพ์พร้อมบอกเหตุผล ไม่ปล่อยให้พิมพ์แล้วส่งไม่ได้
  const canSend = detail.hires.some((hire) => hire.status === 'paid' || hire.status === 'completed');
  const counterpart = detail.room.role === 'member' ? detail.mentorName : detail.memberName;
  const today = dayKey(new Date().toISOString());
  const year = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: DAY, year: 'numeric' }).format(new Date(iso));
  const dayLabel = (iso: string) => dayKey(iso) === today ? s.today : new Intl.DateTimeFormat(locales[lang], {
    day: 'numeric', month: 'short', year: year(iso) === year(new Date().toISOString()) ? undefined : 'numeric', timeZone: DAY,
  }).format(new Date(iso));
  const rows = rowsOf(messages, dayLabel);

  function grow(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, parseFloat(getComputedStyle(el).lineHeight) * 5)}px`;
  }

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
      {rows.map((row) => row.type === 'day'
        ? <p key={row.key} className="chat__day"><span>{row.label}</span></p>
        : <article key={row.key} className={row.mine ? 'chat__group is-mine' : 'chat__group'}>
          {!row.mine && <span className="chat__sender">{row.name}</span>}
          {row.items.map((message) => <div key={message.id} className="chat__bubble">
            {message.body && <p>{message.body}</p>}
            {message.fileName && (() => {
              const kind = kindOf(message.fileMime);
              const Icon = kindIcon[kind];
              return <a className="chat__attachment" href={`/api/chats/${roomId}/files/${message.id}`} download={message.fileName}
                aria-label={s.download(message.fileName)}>
                <span className="chat__attachment-icon"><Icon size={20} aria-hidden="true" /></span>
                <span className="chat__attachment-text"><span className="chat__attachment-name">{message.fileName}</span><span className="chat__attachment-kind">{s.fileKind[kind]}</span></span>
                <span className="chat__attachment-get" aria-hidden="true"><Download size={16} />{s.downloadVerb}</span>
              </a>;
            })()}
          </div>)}
          <small>{formatTime(row.items.at(-1)!.createdAt, lang)}</small>
        </article>)}
      {outbox.map((item) => <article key={item.clientId} className="chat__group is-mine is-pending">
        <div className="chat__bubble">
          {item.text && <p>{item.text}</p>}
          {item.file && <span className="chat__attachment chat__attachment--pending"><span className="chat__attachment-icon"><Paperclip size={18} aria-hidden="true" /></span>
            <span className="chat__attachment-text"><span className="chat__attachment-name">{item.file.name}</span></span></span>}
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
      {!canSend && <p className="cx-note chat__locked" role="status">{s.locked}</p>}
      <div className="chat__field">
        <button type="button" className="chat__clip" title={s.attachHint} aria-label={s.attach} aria-describedby={hintId} disabled={!canSend}
          onClick={() => upload.current?.click()}><Paperclip size={20} aria-hidden="true" /></button>
        <textarea id={textId} ref={field} rows={1} maxLength={4000} value={text} disabled={!canSend} placeholder={s.messagePlaceholder}
          onChange={(event) => { setText(event.target.value); grow(event.target); }}
          onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) event.currentTarget.form?.requestSubmit(); }} />
        <input ref={upload} type="file" className="chat__native" tabIndex={-1} aria-hidden="true" accept={ACCEPT} onChange={(event) => pick(event.target.files?.[0])} />
        <button className="primary-button cx-button chat__send" disabled={!canSend || (!text.trim() && !file)}><Send size={16} aria-hidden="true" />{s.send}</button>
      </div>
      <span id={hintId} className="sr-only">{s.attachHint}</span>
      {file && <p className="chat__chosen"><Paperclip size={14} aria-hidden="true" /><span>{file.name}</span>
        <button type="button" className="link-button cx-link cx-link--quiet" onClick={() => { pick(undefined); if (upload.current) upload.current.value = ''; }}>{s.removeFile}</button></p>}
      <p className="cx-message cx-message--error" role="alert">{fileError}</p>
    </form>
  </section>;
}
