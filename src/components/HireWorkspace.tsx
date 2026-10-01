import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { HireBase } from '../data/consult';
import { useI18n } from '../i18n';
import { formatDate } from '../i18n/format';
import { ChatPanel } from './ChatPanel';
import { HireSteps, HireSummary, StatusPill, UnreadBadge } from './hire';
import { Avatar } from './mentors';
import '../chat.css';

/* พื้นที่ทำงานของงานจ้าง: รายการงานทางซ้าย รายละเอียดกับแชตทางขวา (จอแคบ: รายการแล้วค่อยเข้าไปดูทีละงาน)
   ใช้ทั้ง Consulting ของนักเรียนและ Mentor zone ของเมนเทอร์ สิ่งที่ต่างกันมีสองอย่างคือชื่อที่แสดงกับปุ่มที่กดได้ (renderActions)
   ลิงก์ลึก: #room-<id ห้อง> หรือ #hire-<id งาน> เลือกงานนั้นให้เอง
   ที่ว่างใต้สรุปงานก่อนแชตไว้ให้ขั้นชำระเงินกับปุ่ม "เข้าห้องวิดีโอ" เติมทีหลังโดยไม่ต้องจัดหน้าใหม่ */

export type Labels = { list: string; back: string; detail: (name: string) => string; chat: string; noChat: string };

export function HireWorkspace<T extends HireBase>({ items, nameOf, initialOf, reviewedOf, noteFor, renderActions, labels, closedNote }: {
  items: T[];
  nameOf: (item: T) => string;
  initialOf: (item: T) => string;
  reviewedOf?: (item: T) => boolean;
  /** ข้อความบอกสถานะของงานนี้ตามบทบาท (ฝั่งนักเรียนกับเมนเทอร์ใช้คนละคำ) */
  noteFor: (item: T) => string | null;
  renderActions: (item: T) => ReactNode;
  labels: Labels;
  closedNote: string;
}) {
  const { lang } = useI18n();
  const { hash } = useLocation();
  const [selected, setSelected] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  // ลิงก์ลึกจากอีเมลหรือจากหน้าอื่น
  useEffect(() => {
    const match = /^#(room|hire)-(.+)$/.exec(hash);
    if (!match) return;
    const found = items.find((item) => (match[1] === 'room' ? item.roomId : item.id) === match[2]);
    if (found) setSelected(found.id);
  }, [hash, items]);

  // จอกว้างเลือกงานแรกให้เลย ไม่ปล่อยให้ขวามือว่าง จอแคบเริ่มที่รายการ
  useEffect(() => {
    if (selected || !items.length) return;
    if (window.matchMedia('(min-width: 901px)').matches) setSelected(items[0].id);
  }, [items, selected]);

  const current = items.find((item) => item.id === selected) ?? null;
  function choose(id: string) {
    setSelected(id);
    requestAnimationFrame(() => detailRef.current?.focus({ preventScroll: false }));
  }
  const note = current ? noteFor(current) : null;

  return <div className={current ? 'hw is-detail' : 'hw'}>
    <ul className="hw__list" aria-label={labels.list}>
      {items.map((item) => <li key={item.id}>
        <button type="button" className="hw__row" aria-current={item.id === selected} onClick={() => choose(item.id)}>
          <Avatar initial={initialOf(item)} plain />
          <span>
            <span className="hw__name">{nameOf(item)}</span>
            <span className="hw__meta">{item.competition ? `${item.competition.name} · ` : ''}{formatDate(item.createdAt, lang)}</span>
          </span>
          <span className="hw__side">
            <StatusPill status={item.status} reviewed={reviewedOf?.(item) ?? false} />
            <UnreadBadge count={item.unread} />
          </span>
        </button>
      </li>)}
    </ul>

    <div className="hw__detail" ref={detailRef} tabIndex={-1} aria-label={current ? labels.detail(nameOf(current)) : undefined}>
      {current && <>
        <button type="button" className="link-button cx-link hw__back" onClick={() => setSelected(null)}>
          <ArrowLeft size={16} aria-hidden="true" />{labels.back}
        </button>
        <section className="panel" aria-label={labels.detail(nameOf(current))}>
          <div className="hw__head">
            <h2>{nameOf(current)}</h2>
            <StatusPill status={current.status} reviewed={reviewedOf?.(current) ?? false} />
          </div>
          <HireSteps status={current.status === 'declined' || current.status === 'cancelled' ? null : current.status} />
          <HireSummary hire={current} />
          {note && <p className="cx-flow-note">{note}</p>}
          <div className="cx-flow">{renderActions(current)}</div>
        </section>
        <section className="panel hw__chat" aria-label={labels.chat}>
          <h3>{labels.chat}</h3>
          {current.roomId
            ? <>
              {(current.status === 'completed' || current.status === 'cancelled') && <p className="cx-hint">{closedNote}</p>}
              <ChatPanel key={current.roomId} roomId={current.roomId} />
            </>
            : <p className="hw__empty-chat">{labels.noChat}</p>}
        </section>
      </>}
    </div>
  </div>;
}
