import { Fragment, useId } from 'react';
import { AlertCircle, Check, CircleCheck, ExternalLink, FileText, Info, Paperclip, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { formatInputDate } from '../i18n/format';
import { priceProblem } from '../data/consult';
import type { Price } from '../data/consult';
import { experienceKinds, experienceResults, teamRoles } from '../data/matching';
import type { ExperienceKind, ExperienceResult, TeamRole } from '../data/matching';

/* ใบสมัครเมนเทอร์ ขั้นประสบการณ์แข่งขัน (ผู้ใช้ตัดสิน 4 ต.ค. 2569 ปรับ 21 ต.ค. 2569 ให้ตรงกับประสบการณ์ใน Mentor zone)
   กี่รายการก็ได้ แต่ละรายการบอกงานแข่ง ประเภท ปี ผล บทบาท สิ่งที่รับผิดชอบ หลักฐาน และบทเรียน (ไม่บังคับ)
   ผลอะไรก็ได้ ไม่ต้องได้รางวัล หลักฐานเป็นไฟล์ (สูงสุดห้าไฟล์) หรือลิงก์ https อย่างใดอย่างหนึ่งก็พอ
   ราคาเป็นราคาเดียวต่อเมนเทอร์ อยู่ขั้นเวลาและราคา ไม่ผูกกับงานแข่ง
   ปัญหาของแต่ละช่องแสดงใต้ช่องนั้นในการ์ด ไม่ใช่ข้อความรวมข้อเดียว (design-critic 4 ต.ค. 2569) */

export type Result = ExperienceResult;
export const results = experienceResults;
/** ไฟล์หลักฐานหนึ่งไฟล์ ไฟล์ใหม่ยังไม่ได้อัปโหลด (มี file) ไฟล์ที่แนบไว้ในใบเดิมตอนแก้ใบ (มี id) */
export type Proof = { key: string; name: string; file?: File; id?: string };
export const maxProofs = 5;
export type Experience = {
  id: number; name: string; slug: string | null; kind: ExperienceKind | ''; result: Result | ''; detail: string; year: string;
  role: TeamRole | ''; roleOther: string; responsibility: string; lessons: string; url: string; proofs: Proof[];
  /** การ์ดที่กรอกครบแล้วพับเหลือบรรทัดเดียว หน้าจะได้ไม่ยาวเกินเมื่อมีหลายเวที */
  open: boolean;
};
export type KnownCompetition = {
  slug: string; name: string; org: string; closesAt: string; type: string; teamMin: number; teamMax: number; levels: string[];
};
/** หาเวทีในระบบจากชื่อที่พิมพ์ (ไม่สนตัวพิมพ์เล็กใหญ่และช่องว่างหัวท้าย) */
export const matchCompetition = (known: KnownCompetition[], name: string) =>
  known.find((row) => row.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null;
export { priceProblem };
export type { Price };

export type ExperienceProblem = 'name' | 'kind' | 'result' | 'detail' | 'year' | 'role' | 'roleOther' | 'responsibility' | 'proof' | 'url' | 'file';
const evidenceTypes = ['application/pdf', 'image/jpeg', 'image/png'];
/** การ์ดใหม่ว่าง ๆ */
export const blankExperience = (id: number): Experience => ({
  id, name: '', slug: null, kind: '', result: '', detail: '', year: '', role: '', roleOther: '', responsibility: '', lessons: '', url: '', proofs: [], open: true,
});
/** อะไรในการ์ดนี้ยังไม่ครบหรือไม่ถูก ว่าง = ครบแล้ว (กฎเดียวกับเซิร์ฟเวอร์) */
export function experienceProblems(item: Experience): ExperienceProblem[] {
  const problems: ExperienceProblem[] = [];
  const thisYear = new Date().getFullYear() + 543;
  if (!item.name.trim()) problems.push('name');
  if (!item.kind) problems.push('kind');
  if (!item.result) problems.push('result');
  if ((item.result === 'winner' || item.result === 'other') && !item.detail.trim()) problems.push('detail');
  if (!/^\d{4}$/.test(item.year) || Number(item.year) < 2500 || Number(item.year) > thisYear) problems.push('year');
  if (!item.role) problems.push('role');
  if (item.role === 'other' && !item.roleOther.trim()) problems.push('roleOther');
  if (!item.responsibility.trim()) problems.push('responsibility');
  if (!item.proofs.length && !item.url.trim()) problems.push('proof');
  if (item.url.trim() && !/^https:\/\/\S+$/i.test(item.url.trim())) problems.push('url');
  if (item.proofs.some(({ file }) => file && (file.size > 4 * 1024 * 1024 || !evidenceTypes.includes(file.type)))) problems.push('file');
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

function CompetitionInfo({ competition }: { competition: KnownCompetition }) {
  const { t, lang } = useI18n();
  const s = t.mentorApply.exp;
  const facts = [
    competition.org,
    s.closes(formatInputDate(competition.closesAt.slice(0, 10), lang)),
    t.taxonomy.types[competition.type as keyof typeof t.taxonomy.types] ?? competition.type,
    competition.levels.map((level) => t.taxonomy.levels[level as keyof typeof t.taxonomy.levels] ?? level).join(', '),
    competition.teamMax <= 1 ? s.solo : s.team(competition.teamMin, competition.teamMax),
  ].filter(Boolean);
  return <div className="exp-info">
    <p className="exp-info__name">{competition.name}</p>
    {/* แต่ละข้อไม่ตัดกลางคำ ตัดบรรทัดได้เฉพาะระหว่างข้อ */}
    <p className="exp-info__facts">{facts.map((fact, index) => <Fragment key={index}>{index > 0 && ' '}<span>{fact}{index < facts.length - 1 && ' ·'}</span></Fragment>)}</p>
    <a className="exp-info__link" href={`/competitions/${encodeURIComponent(competition.slug)}`} target="_blank" rel="noreferrer">
      {s.openDetails}<ExternalLink aria-hidden="true" size={14} />
    </a>
  </div>;
}

let nextProof = 0;

function FieldError({ id, text }: { id: string; text: string }) {
  return <p className="offer-error exp-error" id={id}><AlertCircle aria-hidden="true" size={16} />{text}</p>;
}

export function ExperienceCard({ index, item, known, listId, problems, onChange, onRemove, onDone }: {
  index: number; item: Experience; known: KnownCompetition[]; listId: string; problems: ExperienceProblem[];
  onChange: (patch: Partial<Experience>) => void; onRemove: () => void; onDone: () => void;
}) {
  const { t } = useI18n();
  const s = t.mentorApply.exp;
  const v = t.mentorProfileV2;
  const uid = useId();
  const match = (name: string) => matchCompetition(known, name);
  const inSystem = Boolean(item.slug);
  const found = item.slug ? known.find((row) => row.slug === item.slug) ?? null : null;
  const year = new Date().getFullYear() + 543;
  const has = (problem: ExperienceProblem) => problems.includes(problem);
  const remove = <button className="plain exp-remove" type="button" aria-label={s.removeAria(index + 1)} onClick={onRemove}>{s.remove}</button>;

  if (!item.open) {
    return <div className="award exp exp--folded">
      <div className="exp-summary">
        <span className="exp-summary__text">
          <strong>{item.name}</strong>
          <span>{[item.kind && v.kindNames[item.kind], item.year, item.result && v.resultNames[item.result], item.role && v.roleNames[item.role]].filter(Boolean).join(' · ')}</span>
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
          onChange({ name: event.target.value, slug: found?.slug ?? null });
        }} />
    </label>
    {has('name') && <FieldError id={`${uid}-name-error`} text={s.errors.name} />}
    <p className={`exp-match${inSystem ? ' is-known' : ''}`} id={`${uid}-name-hint`}>
      {item.name.trim()
        ? inSystem ? <><CircleCheck aria-hidden="true" size={16} />{s.inSystem}</> : <><Info aria-hidden="true" size={16} />{s.notInSystem}</>
        : s.competitionHint}
    </p>
    {/* เวทีที่จับคู่ได้ แสดงรายละเอียดให้แน่ใจว่าเลือกถูกเวที (ชื่อคล้ายกันได้) พร้อมลิงก์เปิดหน้าเวทีในแท็บใหม่ */}
    {found && <CompetitionInfo competition={found} />}
    <div className="grid exp-grid">
      <div className="exp-field">
        <label className="exp-label" htmlFor={`${uid}-kind`}>{s.kind}</label>
        <select id={`${uid}-kind`} value={item.kind} aria-invalid={has('kind') || undefined} aria-describedby={has('kind') ? `${uid}-kind-error` : undefined}
          onChange={(event) => onChange({ kind: event.target.value as ExperienceKind })}>
          <option value="">{s.pick}</option>
          {experienceKinds.map((kind) => <option key={kind} value={kind}>{v.kindNames[kind]}</option>)}
        </select>
        {has('kind') && <FieldError id={`${uid}-kind-error`} text={s.errors.kind} />}
      </div>
      <div>
        <label>{s.year}<input inputMode="numeric" maxLength={4} value={item.year} placeholder={s.yearPlaceholder}
          aria-invalid={has('year') || undefined} aria-describedby={has('year') ? `${uid}-year-error` : undefined}
          onChange={(event) => onChange({ year: event.target.value.replace(/[^0-9]/g, '') })} /></label>
        {has('year') && <FieldError id={`${uid}-year-error`} text={s.errors.year(year)} />}
      </div>
    </div>
    <div className="exp-field">
      <span className="exp-label">{s.result}</span>
      <Segmented name={`${uid}-result`} label={s.result} value={item.result} invalid={has('result')}
        describedBy={has('result') ? `${uid}-result-error` : undefined}
        options={results.map((value) => ({ value, label: v.resultNames[value] }))} onChange={(result) => onChange({ result })} />
      {has('result') && <FieldError id={`${uid}-result-error`} text={s.errors.result} />}
    </div>
    <div className="exp-field">
      <label className="exp-label" htmlFor={`${uid}-detail`}>{item.result === 'winner' ? s.detailAward : item.result === 'other' ? s.detailOther : s.detail}</label>
      <input id={`${uid}-detail`} maxLength={200} value={item.detail} placeholder={s.detailPlaceholder}
        aria-invalid={has('detail') || undefined} aria-describedby={has('detail') ? `${uid}-detail-error` : undefined}
        onChange={(event) => onChange({ detail: event.target.value })} />
      {has('detail') && <FieldError id={`${uid}-detail-error`} text={item.result === 'winner' ? s.errors.detailAward : s.errors.detailOther} />}
    </div>
    <div className="grid exp-grid">
      <div className="exp-field">
        <label className="exp-label" htmlFor={`${uid}-role`}>{s.role}</label>
        <select id={`${uid}-role`} value={item.role} aria-invalid={has('role') || undefined} aria-describedby={has('role') ? `${uid}-role-error` : undefined}
          onChange={(event) => onChange({ role: event.target.value as TeamRole })}>
          <option value="">{s.pick}</option>
          {teamRoles.map((role) => <option key={role} value={role}>{v.roleNames[role]}</option>)}
        </select>
        {has('role') && <FieldError id={`${uid}-role-error`} text={s.errors.role} />}
      </div>
      {item.role === 'other' && <div className="exp-field">
        <label className="exp-label" htmlFor={`${uid}-role-other`}>{s.roleOther}</label>
        <input id={`${uid}-role-other`} maxLength={80} value={item.roleOther}
          aria-invalid={has('roleOther') || undefined} aria-describedby={has('roleOther') ? `${uid}-role-other-error` : undefined}
          onChange={(event) => onChange({ roleOther: event.target.value })} />
        {has('roleOther') && <FieldError id={`${uid}-role-other-error`} text={s.errors.roleOther} />}
      </div>}
    </div>
    <div className="exp-field">
      <label className="exp-label" htmlFor={`${uid}-resp`}>{s.responsibility}</label>
      <textarea id={`${uid}-resp`} maxLength={1000} rows={3} value={item.responsibility} placeholder={s.responsibilityPlaceholder}
        aria-invalid={has('responsibility') || undefined} aria-describedby={has('responsibility') ? `${uid}-resp-error` : undefined}
        onChange={(event) => onChange({ responsibility: event.target.value })} />
      {has('responsibility') && <FieldError id={`${uid}-resp-error`} text={s.errors.responsibility} />}
    </div>
    <div className="exp-file exp-gap">
      <span className="exp-label" id={`${uid}-file-label`}>{s.file}</span>
      {item.proofs.length > 0 && <ul className="exp-file__list">
        {item.proofs.map((proof) => <li key={proof.key} className={proof.file && (proof.file.size > 4 * 1024 * 1024 || !evidenceTypes.includes(proof.file.type)) ? 'is-invalid' : undefined}>
          <FileText aria-hidden="true" size={16} />
          <span className="exp-file__name">{proof.name}</span>
          <button type="button" className="exp-file__remove" aria-label={s.fileRemove(proof.name)}
            onClick={() => onChange({ proofs: item.proofs.filter((row) => row.key !== proof.key) })}><X aria-hidden="true" size={16} /></button>
        </li>)}
      </ul>}
      {item.proofs.length < maxProofs && <label className="exp-file__button">
        <Paperclip aria-hidden="true" size={16} />{item.proofs.length ? s.fileAdd : s.fileChoose}
        <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" aria-labelledby={`${uid}-file-label`}
          aria-invalid={has('proof') || has('file') || undefined}
          aria-describedby={`${uid}-file-hint${has('proof') || has('file') ? ` ${uid}-file-error` : ''}`}
          onChange={(event) => {
            const picked = [...(event.target.files ?? [])].map((file) => ({ key: `new-${++nextProof}`, name: file.name, file }));
            // เลือกไฟล์เดิมซ้ำได้อีกครั้งหลังลบออก
            event.target.value = '';
            onChange({ proofs: [...item.proofs, ...picked].slice(0, maxProofs) });
          }} />
      </label>}
      {!item.proofs.length && <span className="exp-file__name">{s.fileNone}</span>}
      <small id={`${uid}-file-hint`}>{s.fileHint}</small>
    </div>
    {(has('proof') || has('file')) && <FieldError id={`${uid}-file-error`} text={has('proof') ? s.errors.proof : s.errors.file} />}
    <label className="exp-gap">{s.url}<input type="url" value={item.url} placeholder="https://..."
      aria-invalid={has('url') || undefined} aria-describedby={has('url') ? `${uid}-url-error` : undefined}
      onChange={(event) => onChange({ url: event.target.value })} /></label>
    {has('url') && <FieldError id={`${uid}-url-error`} text={s.errors.badUrl} />}
    <div className="exp-field exp-gap">
      <label className="exp-label" htmlFor={`${uid}-lessons`}>{s.lessons}</label>
      <textarea id={`${uid}-lessons`} maxLength={1000} rows={2} value={item.lessons} onChange={(event) => onChange({ lessons: event.target.value })} />
    </div>
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
