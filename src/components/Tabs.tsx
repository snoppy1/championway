import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import '../consult.css';

/* แท็บแบบเข้าถึงได้ (role=tablist) ใช้ใน Mentor zone: ลูกศรซ้ายขวาเลื่อนและย้ายโฟกัส Home/End ไปหัวท้าย
   มีแค่แท็บที่เลือกอยู่ที่ Tab เข้าถึง (roving tabindex) แผงเนื้อหาให้หน้าที่เรียกใช้เป็นคนวาด
   โดยใช้ id ตาม tabId(prefix, id) / panelId(prefix, id) */
export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
export const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

export function Tabs<T extends string>({ tabs, value, onChange, label, prefix }: {
  tabs: { id: T; label: ReactNode }[]; value: T; onChange: (id: T) => void; label: string; prefix: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const listRef = useRef<HTMLDivElement>(null);
  // จอแคบแท็บล้นแล้วเลื่อนได้ ขอบขวาจางลงเมื่อยังมีแท็บซ่อนอยู่ให้รู้ว่าเลื่อนต่อได้ (เห็นแท็บครบแล้วไม่จาง)
  const [more, setMore] = useState(false);
  useEffect(() => {
    const element = listRef.current;
    if (!element) return;
    const measure = () => setMore(element.scrollLeft + element.clientWidth < element.scrollWidth - 2);
    measure();
    element.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => { element.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [tabs.length]);

  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    const index = tabs.findIndex((tab) => tab.id === value);
    const next = event.key === 'ArrowRight' ? tabs[(index + 1) % tabs.length]
      : event.key === 'ArrowLeft' ? tabs[(index - 1 + tabs.length) % tabs.length]
        : event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : null;
    if (!next) return;
    event.preventDefault();
    onChange(next.id);
    refs.current[next.id]?.focus();
  }

  return <div className={more ? 'cx-tabs-wrap has-more' : 'cx-tabs-wrap'}><div className="cx-tabs cx-tabs--scroll" role="tablist" aria-label={label} ref={listRef}>
    {tabs.map((tab) => <button key={tab.id} type="button" role="tab" id={tabId(prefix, tab.id)} aria-controls={panelId(prefix, tab.id)}
      aria-selected={tab.id === value} tabIndex={tab.id === value ? 0 : -1} ref={(element) => { refs.current[tab.id] = element; }}
      className={tab.id === value ? 'tab-button cx-tab active' : 'tab-button cx-tab'} onClick={() => onChange(tab.id)} onKeyDown={onKey}>
      {tab.label}
    </button>)}
  </div></div>;
}
