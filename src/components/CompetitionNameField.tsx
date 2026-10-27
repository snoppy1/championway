import { useEffect, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { normalizeName } from '../data/matching';

/* ช่องชื่องานแข่งแบบ combobox ใช้ทั้งใบสมัครเมนเทอร์และแท็บประสบการณ์ใน Mentor zone
   พิมพ์ 2 ตัวขึ้นไปแล้วเสนอชื่อ: งานที่มีหน้าในระบบ (มี slug) และชื่อที่มีในระบบแค่ชื่อ (มี id)
   ค้นไม่เจอชื่อที่ตรงกัน มีตัวเลือก "เพิ่มงานแข่งใหม่" ท้ายรายการ ชื่อใหม่เข้าระบบ (แค่ชื่อ) ตอนส่ง (เจ้าของสั่ง 28 ต.ค. 2569)
   ลูกศรขึ้นลงเลือก Enter ยืนยัน Esc ปิด */

export type NameSuggestion = { id: string | null; slug: string | null; name: string };
/** listed = ชื่อนี้มีในระบบแล้ว (มีหน้า หรือมีแค่ชื่อ) */
export type NameChange = { name: string; slug: string | null; listed: boolean };

export function CompetitionNameField({ className, id, value, label, placeholder, disabled, invalid, describedBy, after, onChange }: {
  className?: string; id: string; value: string; label: ReactNode; placeholder?: string; disabled?: boolean; invalid?: boolean; describedBy?: string;
  /** ข้อความใต้ช่อง (คำแนะนำหรือข้อผิดพลาด) อยู่ใต้รายการที่เสนอ */
  after?: ReactNode;
  onChange: (change: NameChange) => void;
}) {
  const { t } = useI18n();
  const s = t.mentorApply.exp;
  const [items, setItems] = useState<NameSuggestion[]>([]);
  const [active, setActive] = useState(-1);
  const [closed, setClosed] = useState(true);
  const query = value.trim();
  useEffect(() => {
    if (query.length < 2) { setItems([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      api<{ items: NameSuggestion[] }>(`/hackathon-names?q=${encodeURIComponent(query)}`)
        .then((result) => {
          if (cancelled) return;
          setItems(result.items);
          setActive(-1);
          // ชื่อที่พิมพ์ตรงกับชื่อในระบบพอดี ถือว่าเลือกชื่อนั้นแล้ว
          const exact = result.items.find((item) => normalizeName(item.name) === normalizeName(query));
          if (exact) onChange({ name: value, slug: exact.slug, listed: true });
        })
        .catch(() => { if (!cancelled) setItems([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
    // onChange เปลี่ยนทุกครั้งที่ render จึงไม่ใส่ไว้ใน deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  const exact = items.some((item) => normalizeName(item.name) === normalizeName(query));
  const addNew = query.length >= 2 && !exact;
  const count = items.length + (addNew ? 1 : 0);
  const open = !closed && count > 0 && !exact;
  const choose = (item: NameSuggestion | null) => {
    onChange(item ? { name: item.name, slug: item.slug, listed: true } : { name: query, slug: null, listed: false });
    setClosed(true);
  };
  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => (i + 1) % count); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => (i <= 0 ? count - 1 : i - 1)); }
    else if (event.key === 'Enter' && active >= 0) { event.preventDefault(); choose(active < items.length ? items[active] : null); }
    else if (event.key === 'Escape') setClosed(true);
  }
  return <div className={`cn-field${className ? ` ${className}` : ''}`}>
    <label htmlFor={id}>{label}</label>
    <div className="cn-field__box">
      <input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" autoComplete="off"
        aria-activedescendant={open && active >= 0 ? `${id}-option-${active}` : undefined} aria-describedby={describedBy}
        aria-invalid={invalid || undefined} placeholder={placeholder} value={value} maxLength={200} disabled={disabled} onKeyDown={onKey}
        onChange={(event) => { setClosed(false); onChange({ name: event.target.value, slug: null, listed: false }); }}
        onFocus={() => setClosed(false)} onBlur={() => setClosed(true)} />
      {open && <ul id={`${id}-list`} role="listbox" className="cn-field__list" aria-label={s.suggestions}>
        {items.map((item, index) => <li key={item.slug ?? item.id ?? item.name} id={`${id}-option-${index}`} role="option" aria-selected={index === active}
          className={index === active ? 'is-active' : undefined}
          onMouseDown={(event) => { event.preventDefault(); choose(item); }}>{item.name}</li>)}
        {addNew && <li id={`${id}-option-${items.length}`} role="option" aria-selected={active === items.length}
          className={`cn-field__add${active === items.length ? ' is-active' : ''}`}
          onMouseDown={(event) => { event.preventDefault(); choose(null); }}>
          <Plus size={15} aria-hidden="true" />{s.addNew(query)}
        </li>}
      </ul>}
    </div>
    {after}
  </div>;
}
