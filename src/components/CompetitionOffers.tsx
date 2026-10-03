import { Fragment, useEffect, useId, useMemo, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronUp, ExternalLink, Search, X } from 'lucide-react';
import { categoryIds } from '../data/competitions';
import type { CategoryId } from '../data/competitions';
import { useI18n } from '../i18n';
import { formatInputDate } from '../i18n/format';

/* เลือกงานที่จะรับปรึกษาพร้อมราคาของแต่ละงาน (ผู้ใช้ตัดสิน 4 ต.ค. 2569: ไม่มีราคากลาง ราคาขึ้นกับงาน)
   งานเยอะได้: ค้นหาด้วยชื่อหรือผู้จัด กรองตามหมวด แล้วแสดงเป็นกลุ่มตามหมวดหลักของงาน
   กลุ่มพับไว้ก่อน (เห็นชื่อหมวด จำนวนงาน และจำนวนที่เลือก) ค้นหาหรือเลือกหมวดแล้วกางให้เอง
   ติ๊กงานแล้วการ์ดขยายให้ใส่ราคากับจำนวนนาที หรือติ๊ก "ข้ามไว้ก่อน" ไปใส่ใน Mentor zone */

export type OpenCompetition = {
  slug: string; name: string; org: string; closesAt: string; type: string; region: string;
  teamMin: number; teamMax: number; categories: string[]; levels: string[];
};
export type Offer = { price: string; minutes: string; skip: boolean };
export type Offers = Record<string, Offer>;

const GROUP_PAGE = 6;
const whole = (text: string, min: number, max: number) => /^\d+$/.test(text) && Number(text) >= min && Number(text) <= max;
const priceOk = (text: string) => whole(text, 0, 100000);
const minutesOk = (text: string) => whole(text, 1, 600);
const OTHER = 'other';

export function CompetitionOffers({ items, offers, onChange, invalid }: {
  items: OpenCompetition[];
  offers: Offers;
  onChange: (next: Offers) => void;
  /** slug ของงานที่ราคายังไม่ถูกต้อง ไว้ทำกรอบแดง */
  invalid: string[];
}) {
  const { t, lang } = useI18n();
  const s = t.mentorApply.picker;
  const uid = useId();
  const [query, setQuery] = useState('');
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<string[]>([]);

  const groupOf = (item: OpenCompetition) => item.categories[0] ?? OTHER;
  const label = (id: string) => (id === OTHER ? s.otherCategory : t.taxonomy.categories[id as CategoryId] ?? id);
  const present = useMemo(() => {
    const ids = new Set(items.map(groupOf));
    return [...categoryIds.filter((id) => ids.has(id)), ...(ids.has(OTHER) ? [OTHER] : [])];
  }, [items]);

  // ราคาไม่ผ่าน: กางกลุ่มของงานนั้นให้เห็นกรอบแดงและพาไปช่องราคาได้
  useEffect(() => {
    if (!invalid.length) return;
    const need = items.filter((item) => invalid.includes(item.slug)).map(groupOf);
    setExpanded((current) => [...new Set([...current, ...need])]);
  }, [invalid]);

  const needle = query.trim().toLowerCase();
  const visible = items.filter((item) => !needle || `${item.name} ${item.org}`.toLowerCase().includes(needle));
  const groups = present.map((id) => ({ id, items: visible.filter((item) => groupOf(item) === id) })).filter((group) => group.items.length);
  const chosen = items.filter((item) => offers[item.slug]);

  const toggle = (slug: string, on: boolean) => {
    const next = { ...offers };
    if (on) next[slug] = { price: '', minutes: '', skip: false };
    else delete next[slug];
    onChange(next);
  };
  const update = (slug: string, patch: Partial<Offer>) => onChange({ ...offers, [slug]: { ...offers[slug], ...patch } });

  const meta = (item: OpenCompetition) => [
    item.org,
    s.closes(formatInputDate(item.closesAt.slice(0, 10), lang)),
    t.taxonomy.types[item.type as keyof typeof t.taxonomy.types] ?? item.type,
    item.levels.map((level) => t.taxonomy.levels[level as keyof typeof t.taxonomy.levels] ?? level).join(', '),
    item.teamMax <= 1 ? s.solo : s.team(item.teamMin, item.teamMax),
  ].filter(Boolean);

  return <div className="offers">
    {chosen.length > 0 && <div className="offers-chosen" aria-label={s.chosenLabel}>
      {chosen.map((item) => <span className="offers-chip" key={item.slug}>
        <span>{item.name}</span>
        <button type="button" className="offers-chip__remove" aria-label={s.remove(item.name)} onClick={() => toggle(item.slug, false)}>
          <X aria-hidden="true" size={16} />
        </button>
      </span>)}
    </div>}

    <div className="offers-tools">
      <label className="offers-search" htmlFor={`${uid}-q`}>
        <span className="sr-only">{s.search}</span>
        <Search aria-hidden="true" size={16} />
        <input id={`${uid}-q`} type="search" value={query} placeholder={s.searchPlaceholder} onChange={(event) => setQuery(event.target.value)} />
      </label>
    </div>

    {groups.length === 0 && <p className="muted offers-empty" role="status">{s.noMatch}</p>}
    {groups.map((group) => {
      const limit = limits[group.id] ?? GROUP_PAGE;
      const picked = group.items.filter((item) => offers[item.slug]).length;
      const isOpen = Boolean(needle) || expanded.includes(group.id);
      const listId = `${uid}-${group.id}-list`;
      return <section className="offers-group" key={group.id}>
        <h4>
          <button type="button" className="offers-group__toggle" aria-expanded={isOpen} aria-controls={listId}
            disabled={Boolean(needle)}
            onClick={() => setExpanded(isOpen ? expanded.filter((id) => id !== group.id) : [...expanded, group.id])}>
            <span className="offers-group__title">
              <span className="offers-group__name">{label(group.id)}</span>
              <span className="count">{s.groupCount(group.items.length)}</span>
            </span>
            {picked > 0 && <span className="offers-group__picked">{s.pickedCount(picked)}</span>}
            {isOpen ? <ChevronUp aria-hidden="true" size={18} className="offers-group__chevron" />
              : <ChevronDown aria-hidden="true" size={18} className="offers-group__chevron" />}
          </button>
        </h4>
        {isOpen && <><ul className="offers-list" id={listId}>
          {group.items.slice(0, limit).map((item) => {
            const offer = offers[item.slug];
            const id = `${uid}-${item.slug}`;
            const bad = invalid.includes(item.slug);
            return <li key={item.slug} className={`offer${offer ? ' is-on' : ''}${bad ? ' is-invalid' : ''}`}>
              <div className="offer-head">
                <input id={id} type="checkbox" checked={Boolean(offer)}
                  onChange={(event) => toggle(item.slug, event.target.checked)} />
                {/* ทั้งชื่อและรายละเอียดกดติ๊กได้ พื้นที่กดบนมือถือจึงใหญ่ */}
                <label htmlFor={id} className="offer-text">
                  <span className="offer-name">{item.name}</span>
                  {/* แต่ละส่วนไม่ตัดกลางคำ เช่น "ทีม 2–4 คน" อยู่บรรทัดเดียวกันเสมอ */}
                  <span className="offer-meta">{meta(item).map((part, index, all) => <Fragment key={index}>{index > 0 && ' '}<span>{part}{index < all.length - 1 && ' ·'}</span></Fragment>)}</span>
                </label>
                <a className="offer-link" href={`/competitions/${encodeURIComponent(item.slug)}`} target="_blank" rel="noreferrer"
                  aria-label={s.details(item.name)}><ExternalLink aria-hidden="true" size={16} /></a>
              </div>
              {offer && <div className="offer-price">
                <div className="offer-mode" role="radiogroup" aria-label={s.modeLabel(item.name)}>
                  <label className={`offer-mode__option${!offer.skip ? ' is-on' : ''}`}>
                    <input type="radio" name={`${id}-mode`} checked={!offer.skip} onChange={() => update(item.slug, { skip: false })} />
                    {!offer.skip && <Check aria-hidden="true" size={16} />}<span>{s.setNow}</span>
                  </label>
                  <label className={`offer-mode__option${offer.skip ? ' is-on' : ''}`}>
                    <input type="radio" name={`${id}-mode`} checked={offer.skip} onChange={() => update(item.slug, { skip: true })} />
                    {offer.skip && <Check aria-hidden="true" size={16} />}<span>{s.setLater}</span>
                  </label>
                </div>
                {offer.skip
                  ? <p className="offer-later">{s.laterNote}</p>
                  : <>
                    <div className="offer-rate">
                      <label className="sr-only" htmlFor={`${id}-price`}>{s.price}</label>
                      <input id={`${id}-price`} className="offer-rate__input" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={offer.price}
                        aria-invalid={bad && !priceOk(offer.price)} aria-describedby={bad ? `${id}-error` : undefined}
                        onChange={(event) => update(item.slug, { price: event.target.value.replace(/[^0-9]/g, '') })} />
                      <span aria-hidden="true">{s.thbPer}</span>
                      <label className="sr-only" htmlFor={`${id}-minutes`}>{s.minutes}</label>
                      <input id={`${id}-minutes`} className="offer-rate__input" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={offer.minutes}
                        aria-invalid={bad && !minutesOk(offer.minutes)} aria-describedby={bad ? `${id}-error` : undefined}
                        onChange={(event) => update(item.slug, { minutes: event.target.value.replace(/[^0-9]/g, '') })} />
                      <span aria-hidden="true">{s.minUnit}</span>
                    </div>
                    {bad && <p className="offer-error" id={`${id}-error`}><AlertCircle aria-hidden="true" size={16} />
                      {!priceOk(offer.price) && !minutesOk(offer.minutes) ? s.errorBoth : !priceOk(offer.price) ? s.errorPrice : s.errorMinutes}</p>}
                  </>}
              </div>}
            </li>;
          })}
        </ul>
        {group.items.length > limit && <button type="button" className="offers-more"
          onClick={() => setLimits({ ...limits, [group.id]: limit + GROUP_PAGE })}>{s.more(group.items.length - limit, label(group.id))}</button>}
        </>}
      </section>;
    })}
  </div>;
}
