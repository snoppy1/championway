import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { ApiError, post } from '../lib/api';
import { useI18n } from '../i18n';
import { consultError, priceDraft, pricePayload, priceProblem } from '../data/consult';
import type { Price } from '../data/consult';
import { PriceFields } from './PriceFields';

/* เมนเทอร์ขอรับปรึกษาเวทีที่มีในระบบแต่ยังไม่ได้ตรวจผลงาน (ผู้ใช้ขอ 9 ต.ค. 2569)
   ส่งผลที่ได้ ปี ไฟล์หลักฐาน และราคา เข้าคิวคำขอของทีมงาน อนุมัติแล้วชื่อขึ้นหน้าเวทีทันที
   ใช้ทั้งบนหน้าเวทีและใน Mentor zone */

export type Result = 'winner' | 'finalist' | 'participant';
export const results: Result[] = ['winner', 'finalist', 'participant'];
export const maxEvidence = 5;
const evidenceTypes = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_BYTES = 4 * 1024 * 1024;
export const badEvidence = (file: File) => file.size > MAX_BYTES || !evidenceTypes.includes(file.type);
export const yearProblem = (year: string) => !/^\d{4}$/.test(year) || Number(year) < 2500 || Number(year) > new Date().getFullYear() + 543;

/** อัปโหลดไฟล์ไปที่เก็บก่อน ได้ id กลับมาแนบกับคำขอ */
export async function uploadFile(file: File, failed: (name: string) => string) {
  const body = new FormData();
  body.append('file', file);
  const response = await fetch('/api/files', { method: 'POST', body, credentials: 'same-origin' });
  const result = await response.json().catch(() => ({})) as { file?: { id: string }; error?: string };
  if (!response.ok || !result.file) throw new ApiError(response.status, result.error ?? failed(file.name));
  return result.file.id;
}

let nextKey = 0;
export type PickedFile = { key: string; file: File };

/** เลือกไฟล์หลักฐานได้หลายไฟล์ (สูงสุดห้า) เอาออกทีละไฟล์ได้ */
export function EvidencePicker({ files, disabled, invalid, describedBy, onChange }: {
  files: PickedFile[]; disabled?: boolean; invalid?: boolean; describedBy?: string; onChange: (next: PickedFile[]) => void;
}) {
  const { t } = useI18n();
  const s = t.mentorClaim;
  const uid = useId();
  return <div className="evidence-picker">
    <span className="evidence-picker__label" id={`${uid}-label`}>{s.files}</span>
    {files.length > 0 && <ul className="evidence-picker__list">
      {files.map(({ key, file }) => <li key={key} className={badEvidence(file) ? 'is-invalid' : undefined}>
        <FileText aria-hidden="true" size={16} />
        <span className="evidence-picker__name">{file.name}</span>
        <button type="button" className="evidence-picker__remove" disabled={disabled} aria-label={s.fileRemove(file.name)}
          onClick={() => onChange(files.filter((row) => row.key !== key))}><X aria-hidden="true" size={16} /></button>
      </li>)}
    </ul>}
    {files.length < maxEvidence && <label className={`evidence-picker__button${disabled ? ' is-disabled' : ''}`}>
      <Paperclip aria-hidden="true" size={16} />{files.length ? s.fileAdd : s.fileChoose}
      <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" disabled={disabled} aria-labelledby={`${uid}-label`}
        aria-invalid={invalid || undefined} aria-describedby={`${uid}-hint${describedBy ? ` ${describedBy}` : ''}`}
        onChange={(event) => {
          const picked = [...(event.target.files ?? [])].map((file) => ({ key: `ev-${++nextKey}`, file }));
          // เลือกไฟล์เดิมซ้ำได้อีกครั้งหลังเอาออก
          event.target.value = '';
          onChange([...files, ...picked].slice(0, maxEvidence));
        }} />
    </label>}
    {!files.length && <span className="evidence-picker__none">{s.fileNone}</span>}
    <small id={`${uid}-hint`} className="evidence-picker__hint">{s.filesHint}</small>
  </div>;
}

export function ClaimForm({ slug, name, onSent, onCancel }: {
  slug: string; name: string; onSent: (message: string) => void; onCancel?: () => void;
}) {
  const { t } = useI18n();
  const s = t.mentorClaim;
  const uid = useId();
  const [result, setResult] = useState<Result | ''>('');
  const [year, setYear] = useState('');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [price, setPrice] = useState<Price>(priceDraft(null));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  const fail = (note: string, selector?: string) => {
    setMessage(note);
    if (selector) formRef.current?.querySelector<HTMLElement>(selector)?.focus();
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!result) return fail(s.errors.result, `#${CSS.escape(uid)}-result`);
    if (yearProblem(year)) return fail(s.errors.year, `#${CSS.escape(uid)}-year`);
    if (!files.length) return fail(s.errors.files, 'input[type="file"]');
    if (files.some(({ file }) => badEvidence(file))) return fail(s.errors.fileBad, 'input[type="file"]');
    const problem = priceProblem(price);
    if (problem) return fail(t.price.errors[problem], 'input[type="radio"]');
    setBusy(true);
    setMessage('');
    try {
      const evidenceFileIds: string[] = [];
      for (const { file } of files) evidenceFileIds.push(await uploadFile(file, s.errors.upload));
      await post('/consult/zone/claims', { slug, result, year, evidenceFileIds, ...pricePayload(price) });
      onSent(s.sent);
    } catch (failure) {
      setMessage(consultError(failure, t, 'mentor'));
      setBusy(false);
    }
  }

  return <form ref={formRef} className="cx-form mentor-claim" aria-label={s.claimTitle(name)} onSubmit={(event) => { void submit(event); }} noValidate>
    <div className="cx-price-fields">
      <div className="cx-field">
        <label htmlFor={`${uid}-result`}>{s.result}</label>
        <select id={`${uid}-result`} value={result} disabled={busy} onChange={(event) => { setResult(event.target.value as Result); setMessage(''); }}>
          <option value="">{s.resultPick}</option>
          {results.map((value) => <option key={value} value={value}>{t.taxonomy.results[value]}</option>)}
        </select>
      </div>
      <div className="cx-field">
        <label htmlFor={`${uid}-year`}>{s.year}</label>
        <input id={`${uid}-year`} inputMode="numeric" maxLength={4} placeholder={s.yearPlaceholder} value={year} disabled={busy}
          onChange={(event) => { setYear(event.target.value.replace(/[^0-9]/g, '')); setMessage(''); }} />
      </div>
    </div>
    <EvidencePicker files={files} disabled={busy} onChange={(next) => { setFiles(next); setMessage(''); }} />
    <div className="cx-field">
      <span className="evidence-picker__label">{s.price}</span>
      <PriceFields idPrefix={uid} value={price} disabled={busy} label={s.price} onChange={(next) => { setPrice(next); setMessage(''); }} />
    </div>
    <p className="cx-message cx-message--error" role="alert">{message}</p>
    <div className="cx-row">
      <button className="primary-button cx-button" disabled={busy}>{busy ? s.sending : s.send}</button>
      {onCancel && <button type="button" className="link-button cx-link cx-link--quiet" disabled={busy} onClick={onCancel}>{s.cancel}</button>}
    </div>
  </form>;
}
