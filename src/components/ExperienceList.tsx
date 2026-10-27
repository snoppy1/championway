import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useI18n } from '../i18n';
import { api, ApiError, post } from '../lib/api';
import { CompetitionNameField } from './CompetitionNameField';
import { useApi } from '../lib/useApi';
import { experienceKinds, experienceResults, teamRoles } from '../data/matching';
import type { ExperienceKind, ExperienceResult, TeamRole } from '../data/matching';
import type { Messages } from '../i18n/en';
import '../consult.css';

/* โปรไฟล์เมนเทอร์แบบใหม่ หมวด C (spec docs/superpowers/specs/2026-10-13-mentor-matching-design.md)
   แท็บ "ประสบการณ์" ใน Mentor zone: เพิ่มได้หลายงาน ชื่องานเลือกจากรายการหรือพิมพ์เอง (ชื่อใหม่เข้ารายการเติมคำให้คนถัดไป)
   รายการใหม่รอทีมงานตรวจลิงก์หลักฐาน ลบได้เฉพาะที่ยังไม่ผ่านการตรวจ */

export type ExperienceRow = {
  id: string; name: string; competitionSlug: string | null; year: string; kind: ExperienceKind; result: ExperienceResult; detail: string;
  role: TeamRole; roleOther: string; responsibility: string; evidenceUrl: string; lessons: string;
  status: 'pending' | 'verified' | 'rejected'; reason: string; createdAt: string;
};
type Draft = {
  name: string; slug: string; year: string; kind: ExperienceKind | ''; result: ExperienceResult | ''; detail: string;
  role: TeamRole | ''; roleOther: string; responsibility: string; evidenceUrl: string; lessons: string;
};
const blank: Draft = { name: '', slug: '', year: '', kind: '', result: '', detail: '', role: '', roleOther: '', responsibility: '', evidenceUrl: '', lessons: '' };

/** บรรทัดสรุป: ประเภท · ผล (รายละเอียด) · บทบาท แถวที่ย้ายมาจากระบบเดิมไม่มีบทบาท (other ว่าง) จึงไม่แสดงบทบาท */
export function experienceLine(row: Pick<ExperienceRow, 'kind' | 'result' | 'detail' | 'role' | 'roleOther'>, s: Messages['mentorProfileV2']) {
  const role = row.role === 'other' ? row.roleOther : s.roleNames[row.role];
  return [s.kindNames[row.kind], `${s.resultNames[row.result]}${row.detail ? ` (${row.detail})` : ''}`, role].filter(Boolean).join(' · ');
}

export function ExperienceList({ onChanged }: { onChanged: () => void }) {
  const { t } = useI18n();
  const s = t.mentorProfileV2;
  const uid = useId();
  const { data, error, reload } = useApi<{ items: ExperienceRow[] }>('/consult/zone/experiences');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(blank);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [notice, setNotice] = useState('');
  const set = (patch: Partial<Draft>) => { setProblem(''); setDraft((current) => ({ ...current, ...patch })); };

  /** ตรวจก่อนส่งด้วยข้อความตามภาษาที่เลือก (ข้อความจากเซิร์ฟเวอร์เป็นภาษาไทยอย่างเดียว) */
  function check() {
    if (!draft.name.trim() || !draft.year || !draft.kind || !draft.result || !draft.role || !draft.responsibility.trim() || !draft.evidenceUrl.trim()) return s.errors.required;
    if (!/^25\d\d$/.test(draft.year)) return s.errors.year;
    if (draft.result === 'winner' && !draft.detail.trim()) return s.errors.awardRequired;
    if (draft.result === 'other' && !draft.detail.trim()) return s.errors.resultOther;
    if (draft.role === 'other' && !draft.roleOther.trim()) return s.errors.roleOther;
    if (!/^https:\/\/\S+$/i.test(draft.evidenceUrl.trim())) return s.errors.https;
    return '';
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found = check();
    if (found) { setProblem(found); return; }
    setBusy(true);
    try {
      await post('/consult/zone/experiences', {
        competitionSlug: draft.slug || undefined, name: draft.slug ? '' : draft.name.trim(), year: draft.year, kind: draft.kind, result: draft.result,
        detail: draft.result === 'winner' || draft.result === 'other' ? draft.detail.trim() : '',
        role: draft.role, roleOther: draft.role === 'other' ? draft.roleOther.trim() : '',
        responsibility: draft.responsibility.trim(), evidenceUrl: draft.evidenceUrl.trim(), lessons: draft.lessons.trim(),
      });
      setDraft(blank);
      setAdding(false);
      setNotice(s.experienceSent);
      reload();
      onChanged();
    } catch (failure) {
      setProblem(failure instanceof ApiError ? failure.message : s.errors.network);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: ExperienceRow) {
    setNotice('');
    try {
      await api(`/consult/zone/experiences/${encodeURIComponent(row.id)}`, { method: 'DELETE' });
    } catch (failure) {
      setNotice(failure instanceof ApiError ? failure.message : s.errors.network);
    }
    reload();
    onChanged();
  }

  const detailLabel = draft.result === 'winner' ? s.resultDetail : s.resultOther;
  return <section className="panel cx-section" aria-labelledby="pv2-exp-title">
    <h2 id="pv2-exp-title">{s.experiencesTitle}</h2>
    <p className="cx-lead">{s.experiencesLead}</p>
    <p className="cx-message cx-message--ok" role="status">{notice}</p>
    {error && !data && <p className="cx-message cx-message--error" role="alert">{error}</p>}
    {data && data.items.length === 0 && <p className="cx-empty">{s.experiencesEmpty}</p>}
    {data && data.items.length > 0 && <ul className="cx-list">
      {data.items.map((row) => <li key={row.id}>
        <div>
          <p className="cx-list__title">{row.name} · {row.year}
            <span className={`cx-pill pv2-status is-${row.status}`}>{s.statusNames[row.status]}</span></p>
          <p className="cx-hint">{experienceLine(row, s)}</p>
          {row.status === 'rejected' && row.reason && <p className="cx-message cx-message--error">{row.reason}</p>}
        </div>
        {row.status !== 'verified' && <button type="button" className="ghost-button pv2-icon" aria-label={s.removeExperience(row.name)}
          onClick={() => { void remove(row); }}><Trash2 size={16} aria-hidden="true" /></button>}
      </li>)}
    </ul>}

    {!adding && <button type="button" className="primary-button cx-button" onClick={() => { setNotice(''); setAdding(true); }}>{s.addExperience}</button>}
    {adding && <form className="cx-form pv2-exp-form" aria-label={s.addExperience} onSubmit={(event) => { void submit(event); }} noValidate>
      <CompetitionNameField className="cx-field" id={`${uid}-name`} value={draft.name} label={`${s.competitionName} *`} disabled={busy} describedBy={`${uid}-name-hint`}
        after={<small id={`${uid}-name-hint`} className="cx-hint">{s.competitionNameHint}</small>}
        onChange={({ name, slug }) => set({ name, slug: slug ?? '' })} />
      <div className="cx-grid-2">
        <div className="cx-field">
          <label htmlFor="exp-year">{s.year} *</label>
          <input id="exp-year" inputMode="numeric" maxLength={4} placeholder="2567" value={draft.year} disabled={busy}
            onChange={(e) => set({ year: e.target.value.replace(/\D/g, '') })} />
        </div>
        <div className="cx-field">
          <label htmlFor="exp-kind">{s.kind} *</label>
          <select id="exp-kind" value={draft.kind} disabled={busy} onChange={(e) => set({ kind: e.target.value as ExperienceKind })}>
            <option value="">—</option>
            {experienceKinds.map((kind) => <option key={kind} value={kind}>{s.kindNames[kind]}</option>)}
          </select>
        </div>
        <div className="cx-field">
          <label htmlFor="exp-result">{s.result} *</label>
          <select id="exp-result" value={draft.result} disabled={busy} onChange={(e) => set({ result: e.target.value as ExperienceResult })}>
            <option value="">—</option>
            {experienceResults.map((result) => <option key={result} value={result}>{s.resultNames[result]}</option>)}
          </select>
        </div>
        {(draft.result === 'winner' || draft.result === 'other') && <div className="cx-field">
          <label htmlFor="exp-detail">{detailLabel} *</label>
          <input id="exp-detail" value={draft.detail} maxLength={200} disabled={busy} onChange={(e) => set({ detail: e.target.value })} />
        </div>}
        <div className="cx-field">
          <label htmlFor="exp-role">{s.role} *</label>
          <select id="exp-role" value={draft.role} disabled={busy} onChange={(e) => set({ role: e.target.value as TeamRole })}>
            <option value="">—</option>
            {teamRoles.map((role) => <option key={role} value={role}>{s.roleNames[role]}</option>)}
          </select>
        </div>
        {draft.role === 'other' && <div className="cx-field">
          <label htmlFor="exp-role-other">{s.roleOther} *</label>
          <input id="exp-role-other" value={draft.roleOther} maxLength={80} disabled={busy} onChange={(e) => set({ roleOther: e.target.value })} />
        </div>}
      </div>
      <div className="cx-field">
        <label htmlFor="exp-responsibility">{s.responsibility} *</label>
        <textarea id="exp-responsibility" rows={3} value={draft.responsibility} maxLength={1000} disabled={busy} onChange={(e) => set({ responsibility: e.target.value })} />
      </div>
      <div className="cx-field">
        <label htmlFor="exp-evidence">{s.evidenceUrl} *</label>
        <input id="exp-evidence" type="url" inputMode="url" placeholder="https://" value={draft.evidenceUrl} maxLength={500} disabled={busy}
          aria-describedby="exp-evidence-hint" onChange={(e) => set({ evidenceUrl: e.target.value })} />
        <small id="exp-evidence-hint" className="cx-hint">{s.evidenceHint}</small>
      </div>
      <div className="cx-field">
        <label htmlFor="exp-lessons">{s.lessons}</label>
        <textarea id="exp-lessons" rows={3} value={draft.lessons} maxLength={1000} disabled={busy} onChange={(e) => set({ lessons: e.target.value })} />
      </div>
      <p className="cx-message cx-message--error" role="alert">{problem}</p>
      <div className="pv2-actions">
        <button className="primary-button cx-button" disabled={busy}>{s.sendExperience}</button>
        <button type="button" className="ghost-button cx-button" disabled={busy} onClick={() => { setAdding(false); setDraft(blank); setProblem(''); }}>{s.cancel}</button>
      </div>
    </form>}
  </section>;
}
