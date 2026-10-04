import { useId } from 'react';
import { AlertCircle, Check, CircleCheck, Info, Paperclip } from 'lucide-react';
import { useI18n } from '../i18n';
import { priceProblem } from '../data/consult';
import type { Price } from '../data/consult';

/* ใบสมัครเมนเทอร์ (ผู้ใช้ตัดสิน 4 ต.ค. 2569 กับทีม)
   ขั้น 2: ประสบการณ์แข่งขันกี่รายการก็ได้ แต่ละรายการบอกเวที ผล ปี หลักฐาน และติ๊กว่าอยากเป็นเมนเทอร์ของเวทีนั้นไหม
           เป็นเมนเทอร์ได้เฉพาะเวทีที่เคยแข่งเอง (ผลอะไรก็ได้) และต้องเป็นเวทีที่มีในระบบ
   ขั้น 3: ราคาของเวทีที่ติ๊กไว้ เลือก "ฟรี" หรือ "[ราคา] บาท ต่อ [หน่วยที่พิมพ์เอง]"
   ปัญหาของแต่ละช่องแสดงใต้ช่องนั้นในการ์ด ไม่ใช่ข้อความรวมข้อเดียว (design-critic 4 ต.ค. 2569) */

export type Result = 'winner' | 'finalist' | 'participant';
export const results: Result[] = ['winner', 'finalist', 'participant'];
export type Experience = {
  id: number; name: string; slug: string | null; result: Result | ''; detail: string; year: string; url: string; file?: File; mentor: boolean;
  /** การ์ดที่กรอกครบแล้วพับเหลือบรรทัดเดียว หน้าจะได้ไม่ยาวเกินเมื่อมีหลายเวที */
  open: boolean;
};
export type KnownCompetition = { slug: string; name: string; org: string };
/** หาเวทีในระบบจากชื่อที่พิมพ์ (ไม่สนตัวพิมพ์เล็กใหญ่และช่องว่างหัวท้าย) */
export const matchCompetition = (known: KnownCompetition[], name: string) =>
  known.find((row) => row.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null;
export { priceProblem };
export type { Price };

export type ExperienceProblem = 'name' | 'result' | 'year' | 'proof' | 'file';
const evidenceTypes = ['application/pdf', 'image/jpeg', 'image/png'];
/** อะไรในการ์ดนี้ยังไม่ครบหรือไม่ถูก ว่าง = ครบแล้ว */
export function experienceProblems(item: Experience): ExperienceProblem[] {
  const problems: ExperienceProblem[] = [];
  const thisYear = new Date().getFullYear() + 543;
  if (!item.name.trim()) problems.push('name');
  if (!item.result) problems.push('result');
  if (!/^\d{4}$/.test(item.year) || Number(item.year) < 2500 || Number(item.year) > thisYear) problems.push('year');
  if (!item.url.trim() && !item.file) problems.push('proof');
  else if (item.url.trim() && !/^https?:\/\//i.test(item.url.trim())) problems.push('proof');
  if (item.file && (item.file.size > 10 * 1024 * 1024 || !evidenceTypes.includes(item.file.type))) problems.push('file');
  return problems;
}

/** ตัวเลือกแบบปุ่มติดกัน (เหมือนแท็บ) ใช้ทั้งผลการแข่งและ ฟรี/คิดเงิน */
function Segmented<T extends string>({ name, label, value, options, invalid, describedBy, onChange }: {
  name: string; label: string; value: T | ''; options: { value: T; label: string }[]; invalid?: boolean; describedBy?: string;
  onChange: (value: T) => void;
}) {
  return <div className={`offer-mode${invalid ? ' is-invalid' : ''}`} role="radiogroup" aria-label={label} aria-invalid={invalid || undefined}
    aria-describedby={describedBy}>
    {options.map((option) => <label key={option.value} className={`offer-mode__option${value === option.value ? ' is-on' : ''}`}>
      <input type="radio" name={name} checked={value === option.value} onChange={() => onChange(option.value)} />
      {value === option.value && <Check aria-hidden="true" size={16} />}<span>{option.label}</span>
    </label>)}
  </div>;
}

function FieldError({ id, text }: { id: string; text: string }) {
  return <p className="offer-error exp-error" id={id}><AlertCircle aria-hidden="true" size={16} />{text}</p>;
}

export function ExperienceCard({ index, item, known, listId, problems, onChange, onRemove, onDone }: {
  index: number; item: Experience; known: KnownCompetition[]; listId: string; problems: ExperienceProblem[];
  onChange: (patch: Partial<Experience>) => void; onRemove: () => void; onDone: () => void;
}) {
  const { t } = useI18n();
  const s = t.mentorApply.exp;
  const uid = useId();
  const match = (name: string) => matchCompetition(known, name);
  const inSystem = Boolean(item.slug);
  const year = new Date().getFullYear() + 543;
  const has = (problem: ExperienceProblem) => problems.includes(problem);
  const remove = <button className="plain exp-remove" type="button" aria-label={s.removeAria(index + 1)} onClick={onRemove}>{s.remove}</button>;

  if (!item.open) {
    return <div className="award exp exp--folded">
      <div className="exp-summary">
        <span className="exp-summary__text">
          <strong>{item.name}</strong>
          <span>{[item.result && t.taxonomy.results[item.result], item.year].filter(Boolean).join(' · ')}</span>
          {item.mentor && inSystem && <span className="exp-summary__tag">{s.mentorTag}</span>}
        </span>
        <span className="exp-summary__actions">
          <button className="plain" type="button" aria-label={s.editAria(item.name)} onClick={() => onChange({ open: true })}>{s.edit}</button>
          {remove}
        </span>
      </div>
    </div>;
  }

  return <div className={`award exp${problems.length ? ' is-invalid' : ''}`}>
    <div className="award-header">
      <h4>{s.heading(index + 1)}</h4>
      {remove}
    </div>
    <label htmlFor={`${uid}-name`}>{s.competition}
      <input id={`${uid}-name`} list={listId} maxLength={200} value={item.name} autoComplete="off" placeholder={s.competitionPlaceholder}
        aria-invalid={has('name') || undefined} aria-describedby={`${uid}-name-hint${has('name') ? ` ${uid}-name-error` : ''}`}
        onChange={(event) => {
          const found = match(event.target.value);
          onChange({ name: event.target.value, slug: found?.slug ?? null, mentor: found ? item.mentor : false });
        }} />
    </label>
    {has('name') && <FieldError id={`${uid}-name-error`} text={s.errors.name} />}
    <p className={`exp-match${inSystem ? ' is-known' : ''}`} id={`${uid}-name-hint`}>
      {item.name.trim()
        ? inSystem ? <><CircleCheck aria-hidden="true" size={16} />{s.inSystem}</> : <><Info aria-hidden="true" size={16} />{s.notInSystem}</>
        : s.competitionHint}
    </p>
    <div className="exp-field">
      <span className="exp-label">{s.result}</span>
      <Segmented name={`${uid}-result`} label={s.result} value={item.result} invalid={has('result')}
        describedBy={has('result') ? `${uid}-result-error` : undefined}
        options={results.map((value) => ({ value, label: t.taxonomy.results[value] }))} onChange={(result) => onChange({ result })} />
      {has('result') && <FieldError id={`${uid}-result-error`} text={s.errors.result} />}
    </div>
    <div className="grid exp-grid">
      <label>{s.detail}<input maxLength={200} value={item.detail} placeholder={s.detailPlaceholder} onChange={(event) => onChange({ detail: event.target.value })} /></label>
      <div>
        <label>{s.year}<input inputMode="numeric" maxLength={4} value={item.year} placeholder={s.yearPlaceholder}
          aria-invalid={has('year') || undefined} aria-describedby={has('year') ? `${uid}-year-error` : undefined}
          onChange={(event) => onChange({ year: event.target.value.replace(/[^0-9]/g, '') })} /></label>
        {has('year') && <FieldError id={`${uid}-year-error`} text={s.errors.year(year)} />}
      </div>
    </div>
    <label className="exp-gap">{s.url}<input type="url" value={item.url} placeholder="https://..."
      aria-invalid={has('proof') || undefined} aria-describedby={has('proof') ? `${uid}-proof-error` : undefined}
      onChange={(event) => onChange({ url: event.target.value })} /></label>
    <div className="exp-file">
      <span className="exp-label" id={`${uid}-file-label`}>{s.file}</span>
      <label className="exp-file__button">
        <Paperclip aria-hidden="true" size={16} />{item.file ? s.fileChange : s.fileChoose}
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" aria-labelledby={`${uid}-file-label`} aria-describedby={`${uid}-file-hint`}
          onChange={(event) => onChange({ file: event.target.files?.[0] })} />
      </label>
      <span className="exp-file__name">{item.file ? item.file.name : s.fileNone}</span>
      <small id={`${uid}-file-hint`}>{s.fileHint}</small>
    </div>
    {has('proof') && <FieldError id={`${uid}-proof-error`} text={item.url.trim() ? s.errors.badUrl : s.errors.proof} />}
    {has('file') && <FieldError id={`${uid}-file-error`} text={s.errors.file} />}
    <label className={`check exp-mentor${inSystem ? '' : ' is-disabled'}`}>
      <input type="checkbox" checked={item.mentor} disabled={!inSystem} onChange={(event) => onChange({ mentor: event.target.checked })} />
      <span><strong>{s.mentor}</strong><small>{inSystem ? s.mentorHint : s.mentorNeedsSystem}</small></span>
    </label>
    <button type="button" className="exp-done" onClick={onDone}>{s.done}</button>
  </div>;
}

export function PriceCard({ name, price, invalid, onChange }: {
  name: string; price: Price | undefined; invalid: boolean; onChange: (next: Price) => void;
}) {
  const { t } = useI18n();
  const s = t.mentorApply.pricing;
  const uid = useId();
  const value = price ?? { mode: '', price: '', unit: '' };
  const problem = invalid ? priceProblem(value) : null;
  return <li className={`offer is-on${problem ? ' is-invalid' : ''}`}>
    <div className="offer-head"><span className="offer-name">{name}</span></div>
    <div className="offer-price">
      <Segmented name={`${uid}-mode`} label={s.modeLabel(name)} value={value.mode}
        options={[{ value: 'free', label: s.free }, { value: 'paid', label: s.paid }]}
        onChange={(mode) => onChange({ ...value, mode })} />
      {value.mode === 'paid' && <div className="offer-rate">
        <label className="sr-only" htmlFor={`${uid}-price`}>{s.amount}</label>
        <input id={`${uid}-price`} className="offer-rate__input" inputMode="numeric" pattern="[0-9]*" autoComplete="off" value={value.price}
          aria-invalid={problem === 'price' || problem === 'both'} aria-describedby={problem ? `${uid}-error` : undefined}
          onChange={(event) => onChange({ ...value, price: event.target.value.replace(/[^0-9]/g, '') })} />
        <span aria-hidden="true">{s.thb}</span>
        {/* "ต่อ" อยู่หน้าช่องหน่วยเสมอ บนมือถือช่องหน่วยขึ้นบรรทัดใหม่พร้อมคำนี้ */}
        <span className="offer-rate__per">
          <span aria-hidden="true">{s.per}</span>
          <label className="sr-only" htmlFor={`${uid}-unit`}>{s.unit}</label>
          <input id={`${uid}-unit`} className="offer-rate__input offer-rate__unit" maxLength={40} autoComplete="off" value={value.unit}
            placeholder={s.unitPlaceholder} aria-invalid={problem === 'unit' || problem === 'both'} aria-describedby={problem ? `${uid}-error` : undefined}
            onChange={(event) => onChange({ ...value, unit: event.target.value })} />
        </span>
      </div>}
      {problem && <p className="offer-error" id={`${uid}-error`}><AlertCircle aria-hidden="true" size={16} />{s.errors[problem]}</p>}
    </div>
  </li>;
}
