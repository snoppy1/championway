import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { api, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import {
  countries, formats, genders, helpsWith, languages, learnerLevels, modes, replyHoursOptions, sessionLengths, skillGroups, skillLevels, teachingStyles,
} from '../data/matching';
import type { MentorProfileV2, Section, SkillGroup, SkillLevel, SkillTag } from '../data/matching';
import '../consult.css';

/* โปรไฟล์เมนเทอร์แบบใหม่ (spec docs/superpowers/specs/2026-10-13-mentor-matching-design.md)
   แท็บ "โปรไฟล์" ใน Mentor zone กรอกหมวด A, B, D, E หมวด C อยู่แท็บประสบการณ์ หมวด F คำนวณเอง
   เซิร์ฟเวอร์ตรวจทุกค่าซ้ำ ฟอร์มนี้แค่ช่วยเลือกจากรายการ */

type Payload = { profile: MentorProfileV2; missing: Section[]; complete: boolean };

/** แถบเตือนบนหัว Mentor zone เมื่อยังกรอกไม่ครบ ปุ่มพาไปแท็บที่ต้องกรอก */
export function ProfileBanner({ missing, onOpen }: { missing: Section[]; onOpen: (tab: 'profile' | 'experiences') => void }) {
  const { t } = useI18n();
  const s = t.mentorProfileV2;
  if (!missing.length) return null;
  const onlyExperience = missing.length === 1 && missing[0] === 'C';
  return <div className="cx-banner cx-banner--requested pv2-banner" role="status">
    <strong>{s.bannerTitle}</strong>
    <p>{s.bannerText(missing.map((key) => s.sectionNames[key]).join(', '))}</p>
    <button type="button" className="link-button cx-link cx-link--text" onClick={() => onOpen(onlyExperience ? 'experiences' : 'profile')}>
      {onlyExperience ? s.experiencesTab : s.tab}
    </button>
  </div>;
}

function Checks<T extends string | number>({ legend, options, value, label, disabled, onChange }: {
  legend: string; options: readonly T[]; value: readonly T[]; label: (id: T) => string; disabled: boolean; onChange: (next: T[]) => void;
}) {
  return <fieldset className="pv2-checks" disabled={disabled}>
    <legend>{legend}</legend>
    <div className="pv2-chips">
      {options.map((id) => <label key={String(id)} className="pv2-chip">
        <input type="checkbox" checked={value.includes(id)}
          onChange={(event) => onChange(event.target.checked ? [...value, id] : value.filter((item) => item !== id))} />
        <span>{label(id)}</span>
      </label>)}
    </div>
  </fieldset>;
}

/* ช่องของแต่ละหมวด ใช้ทั้งแท็บโปรไฟล์ใน Mentor zone และใบสมัครเมนเทอร์ (ข้อมูลชุดเดียวกัน ตรวจด้วยกฎเดียวกันที่เซิร์ฟเวอร์) */
export type ProfileSetter = <K extends keyof MentorProfileV2>(key: K, value: MentorProfileV2[K]) => void;
type FieldsProps = { draft: MentorProfileV2; set: ProfileSetter; busy: boolean };

/** หมวด A */
export function BasicFields({ draft, set, busy }: FieldsProps) {
  const { t } = useI18n();
  const s = t.mentorProfileV2;
  return <>
    <div className="cx-field">
      <label htmlFor="pv2-headline">{s.headline} *</label>
      <input id="pv2-headline" value={draft.headline} maxLength={80} aria-describedby="pv2-headline-hint" onChange={(e) => set('headline', e.target.value)} />
      <small id="pv2-headline-hint" className="cx-hint">{s.headlineHint}</small>
    </div>
    <div className="cx-grid-2">
      <div className="cx-field">
        <label htmlFor="pv2-country">{s.country} *</label>
        <select id="pv2-country" value={draft.country} onChange={(e) => set('country', e.target.value)}>
          <option value="">—</option>
          {countries.map((code) => <option key={code} value={code}>{s.countries[code]}</option>)}
        </select>
      </div>
      <div className="cx-field">
        <label htmlFor="pv2-tz">{s.timeZone}</label>
        <input id="pv2-tz" value={draft.timeZone} maxLength={60} onChange={(e) => set('timeZone', e.target.value)} />
      </div>
    </div>
    <Checks legend={`${s.languages} *`} options={languages} value={draft.languages} disabled={busy} label={(id) => s.languageNames[id]} onChange={(v) => set('languages', v)} />
    <div className="cx-field">
      <label htmlFor="pv2-background">{s.background} *</label>
      <input id="pv2-background" value={draft.background} maxLength={200} placeholder={s.backgroundPlaceholder} onChange={(e) => set('background', e.target.value)} />
    </div>
    <div className="cx-field">
      <label htmlFor="pv2-gender">{s.gender}</label>
      <select id="pv2-gender" value={draft.gender ?? ''} aria-describedby="pv2-gender-hint"
        onChange={(e) => set('gender', (e.target.value || null) as MentorProfileV2['gender'])}>
        <option value="">{s.genderNone}</option>
        {genders.map((g) => <option key={g} value={g}>{s.genderNames[g]}</option>)}
      </select>
      <small id="pv2-gender-hint" className="cx-hint">{s.genderHint}</small>
    </div>
  </>;
}

/** หมวด B */
export function SkillFields({ draft, set }: FieldsProps) {
  const { t } = useI18n();
  const s = t.mentorProfileV2;
  const levelOf = (tag: SkillTag) => draft.skills.find((skill) => skill.tag === tag)?.level ?? '';
  const setLevel = (tag: SkillTag, level: SkillLevel | '') => set('skills', level
    ? [...draft.skills.filter((skill) => skill.tag !== tag), { tag, level }]
    : draft.skills.filter((skill) => skill.tag !== tag));
  return <>
    <p className="cx-hint">{s.skillsHint}</p>
    {(Object.keys(skillGroups) as SkillGroup[]).map((group) => <div key={group} className="pv2-skill-group">
      <h3>{s.skillGroups[group]}</h3>
      <div className="pv2-skills">
        {(skillGroups[group] as readonly SkillTag[]).map((tag) => <div key={tag} className="pv2-skill">
          <label htmlFor={`pv2-skill-${tag}`}>{s.skillNames[tag]}</label>
          <select id={`pv2-skill-${tag}`} aria-label={s.skillLevel(s.skillNames[tag])} value={levelOf(tag)}
            onChange={(e) => setLevel(tag, e.target.value as SkillLevel | '')}>
            <option value="">{s.notSelected}</option>
            {skillLevels.map((level) => <option key={level} value={level}>{s.levelNames[level]}</option>)}
          </select>
        </div>)}
      </div>
    </div>)}
  </>;
}

/** หมวด D */
export function MentoringFields({ draft, set, busy }: FieldsProps) {
  const { t } = useI18n();
  const s = t.mentorProfileV2;
  return <>
    <Checks legend={`${s.helpsWith} *`} options={helpsWith} value={draft.helpsWith} disabled={busy} label={(id) => s.helpsWithNames[id]} onChange={(v) => set('helpsWith', v)} />
    <Checks legend={`${s.learnerLevels} *`} options={learnerLevels} value={draft.learnerLevels} disabled={busy} label={(id) => s.learnerLevelNames[id]} onChange={(v) => set('learnerLevels', v)} />
    <Checks legend={`${s.teachingStyles} *`} options={teachingStyles} value={draft.teachingStyles} disabled={busy} label={(id) => s.teachingStyleNames[id]} onChange={(v) => set('teachingStyles', v)} />
    <Checks legend={`${s.formats} *`} options={formats} value={draft.formats} disabled={busy} label={(id) => s.formatNames[id]} onChange={(v) => set('formats', v)} />
    <div className="cx-field">
      <label htmlFor="pv2-deliverables">{s.deliverables}</label>
      <textarea id="pv2-deliverables" rows={3} value={draft.deliverables} maxLength={500} onChange={(e) => set('deliverables', e.target.value)} />
    </div>
  </>;
}

/** หมวด E ใบสมัครไม่มีปุ่มรับคำขอ (เปิดเองหลังอนุมัติ ค่าเริ่มต้นเปิด) */
export function AvailabilityFields({ draft, set, busy, accepting = true }: FieldsProps & { accepting?: boolean }) {
  const { t } = useI18n();
  const s = t.mentorProfileV2;
  const setSlot = (index: number, patch: Partial<MentorProfileV2['availability'][number]>) =>
    set('availability', draft.availability.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  return <>
    <div className="pv2-slots" role="group" aria-label={s.availability}>
      <p className="pv2-label">{s.availability} *</p>
      {draft.availability.map((slot, index) => <div key={index} className="pv2-slot">
        <div className="cx-field">
          <label htmlFor={`pv2-day-${index}`}>{s.day}</label>
          <select id={`pv2-day-${index}`} value={slot.day} onChange={(e) => setSlot(index, { day: Number(e.target.value) })}>
            {s.days.map((name, day) => <option key={name} value={day}>{name}</option>)}
          </select>
        </div>
        <div className="cx-field">
          <label htmlFor={`pv2-from-${index}`}>{s.from}</label>
          <input id={`pv2-from-${index}`} type="time" value={slot.from} onChange={(e) => setSlot(index, { from: e.target.value })} />
        </div>
        <div className="cx-field">
          <label htmlFor={`pv2-to-${index}`}>{s.to}</label>
          <input id={`pv2-to-${index}`} type="time" value={slot.to} onChange={(e) => setSlot(index, { to: e.target.value })} />
        </div>
        <button type="button" className="ghost-button pv2-icon" aria-label={s.removeSlot(s.days[slot.day])}
          onClick={() => set('availability', draft.availability.filter((_, i) => i !== index))}><X size={16} aria-hidden="true" /></button>
      </div>)}
      <button type="button" className="ghost-button cx-button" onClick={() => set('availability', [...draft.availability, { day: 6, from: '09:00', to: '12:00' }])}>
        <Plus size={16} aria-hidden="true" />{s.addSlot}
      </button>
    </div>
    <div className="cx-grid-2">
      <div className="cx-field">
        <label htmlFor="pv2-per-week">{s.sessionsPerWeek} *</label>
        <input id="pv2-per-week" type="number" inputMode="numeric" min={1} max={20} value={draft.sessionsPerWeek ?? ''}
          onChange={(e) => set('sessionsPerWeek', e.target.value ? Number(e.target.value) : null)} />
      </div>
      <div className="cx-field">
        <label htmlFor="pv2-reply">{s.replyHours} *</label>
        <select id="pv2-reply" value={draft.replyHours ?? ''} onChange={(e) => set('replyHours', e.target.value ? Number(e.target.value) : null)}>
          <option value="">—</option>
          {replyHoursOptions.map((hours) => <option key={hours} value={hours}>{s.replyOptions[hours]}</option>)}
        </select>
      </div>
      <div className="cx-field">
        <label htmlFor="pv2-mode">{s.mode} *</label>
        <select id="pv2-mode" value={draft.mode ?? ''} onChange={(e) => set('mode', (e.target.value || null) as MentorProfileV2['mode'])}>
          <option value="">—</option>
          {modes.map((mode) => <option key={mode} value={mode}>{s.modeNames[mode]}</option>)}
        </select>
      </div>
    </div>
    <Checks legend={`${s.sessionMinutes} *`} options={sessionLengths} value={draft.sessionMinutes as (typeof sessionLengths)[number][]} disabled={busy}
      label={(n) => s.minutes(n)} onChange={(v) => set('sessionMinutes', v)} />
    {accepting && <label className="pv2-toggle"><input type="checkbox" checked={draft.acceptingRequests} onChange={(e) => set('acceptingRequests', e.target.checked)} />{s.acceptingRequests}</label>}
    <label className="pv2-toggle"><input type="checkbox" checked={draft.acceptsUrgent} onChange={(e) => set('acceptsUrgent', e.target.checked)} />{s.acceptsUrgent}</label>
  </>;
}

/** โปรไฟล์ว่างสำหรับใบสมัครใหม่ */
export const emptyProfile = (): MentorProfileV2 => ({
  headline: '', country: '', timeZone: 'Asia/Bangkok', languages: [], background: '', gender: null, skills: [],
  helpsWith: [], learnerLevels: [], teachingStyles: [], formats: [], deliverables: '',
  availability: [], sessionsPerWeek: null, sessionMinutes: [], acceptingRequests: true, replyHours: null, acceptsUrgent: false, mode: null,
});

export function ProfileEditor({ onSaved }: { onSaved: () => void }) {
  const { t } = useI18n();
  const s = t.mentorProfileV2;
  const { data, error } = useApi<Payload>('/consult/zone/profile');
  const [draft, setDraft] = useState<MentorProfileV2 | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => { if (data && !draft) setDraft(data.profile); }, [data, draft]);

  if (!draft) return <p className={error ? 'cx-message cx-message--error' : 'side-note'} role={error ? 'alert' : 'status'}>{error || s.loading}</p>;

  const set: ProfileSetter = (key, value) => { setMessage(''); setDraft({ ...draft, [key]: value }); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const saved = await api<Payload>('/consult/zone/profile', { method: 'PUT', body: JSON.stringify(draft) });
      setDraft(saved.profile);
      setMessage(s.saved);
      onSaved();
    } catch (failure) {
      setFailed(true);
      setMessage(failure instanceof ApiError ? failure.message : s.errors.network);
    } finally {
      setBusy(false);
    }
  }

  const props = { draft, set, busy };
  return <section className="panel cx-section" aria-labelledby="pv2-title">
    <h2 id="pv2-title">{s.tab}</h2>
    <form className="cx-form pv2-form" aria-label={s.tab} onSubmit={(event) => { void submit(event); }} noValidate>
      <fieldset className="pv2-section" disabled={busy}>
        <legend>{s.sectionNames.A}</legend>
        <BasicFields {...props} />
      </fieldset>
      <fieldset className="pv2-section" disabled={busy}>
        <legend>{s.sectionNames.B}</legend>
        <SkillFields {...props} />
      </fieldset>
      <fieldset className="pv2-section" disabled={busy}>
        <legend>{s.sectionNames.D}</legend>
        <MentoringFields {...props} />
      </fieldset>
      <fieldset className="pv2-section" disabled={busy}>
        <legend>{s.sectionNames.E}</legend>
        <AvailabilityFields {...props} />
      </fieldset>

      <p className={failed ? 'cx-message cx-message--error' : 'cx-message cx-message--ok'} role={failed ? 'alert' : 'status'}>{message}</p>
      <button className="primary-button cx-button" disabled={busy}>{busy ? s.saving : s.save}</button>
    </form>
  </section>;
}
