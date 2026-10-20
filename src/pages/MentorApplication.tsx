import { useEffect, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ClipboardCheck, Eye, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { occupationValues } from '../data/stored-values';
import type { OccupationId } from '../data/stored-values';
import { occupationLabel } from '../data/profile';
import { useAuth } from '../data/auth';
import { ApiError, api, post } from '../lib/api';
import { useApi } from '../lib/useApi';
import { isWebLink } from '../data/consult';
import { missingSections } from '../data/matching';
import type { MentorProfileV2, Section } from '../data/matching';
import { ExperienceCard, PriceCard, blankExperience, experienceProblems, matchCompetition, priceProblem } from '../components/ApplyExperience';
import type { Experience, KnownCompetition, Price, Result } from '../components/ApplyExperience';
import { AvailabilityFields, BasicFields, MentoringFields, SkillFields, emptyProfile } from '../components/ProfileEditor';
import type { ProfileSetter } from '../components/ProfileEditor';
import { useI18n } from '../i18n';
import '../form.css';
import '../consult.css';

/* ใบสมัครเมนเทอร์ 6 ขั้น (spec 2026-10-13 ตัดสิน 21 ต.ค. 2569: ต่อเติมจากฟอร์มเดิม ไม่ออกแบบใหม่)
   0 ข้อมูลผู้สมัคร + โปรไฟล์หมวด A · 1 ทักษะ (B) · 2 ประสบการณ์แข่งขัน (C) · 3 วิธีที่ช่วย (D)
   4 เวลา (E) ราคาเดียวต่อเมนเทอร์ และช่องทางติดต่อ · 5 ตรวจและส่ง
   ช่องโปรไฟล์ใช้ชุดเดียวกับแท็บโปรไฟล์ใน Mentor zone อนุมัติแล้วเมนเทอร์ครบทุกหมวดและถูกจับคู่ได้ทันที
   ติดต่อกันนอกเว็บ เว็บไม่เก็บเงิน แก้ทุกอย่างได้ภายหลังใน Mentor zone */
const applicantStatuses: OccupationId[] = ['university', 'working', 'other'];
type Field = 'first' | 'last' | 'nickname' | 'email' | 'occupation' | 'organization' | 'role' | 'experience' | 'portfolio' | 'best' | 'cannot'
  | 'contactEmail' | 'contactLine' | 'contactPhone' | 'contactInstagram' | 'contactLink';
const empty: Record<Field, string> = { first: '', last: '', nickname: '', email: '', occupation: '', organization: '', role: '', experience: '', portfolio: '', best: '', cannot: '', contactEmail: '', contactLine: '', contactPhone: '', contactInstagram: '', contactLink: '' };

type ConsentKey = 'accuracy' | 'guidanceOnly' | 'replies' | 'noJudging' | 'payment';
/** Every box starts unticked and all of them are required before the sample submit. */
const consentKeys: ConsentKey[] = ['accuracy', 'guidanceOnly', 'replies', 'noJudging', 'payment'];
const noConsent: Record<ConsentKey, boolean> = { accuracy: false, guidanceOnly: false, replies: false, noJudging: false, payment: false };
const lastStage = 5;
/** หมวดโปรไฟล์ที่แต่ละขั้นต้องกรอกให้ครบก่อนไปต่อ */
const sectionOfStage: Partial<Record<number, Section>> = { 0: 'A', 1: 'B', 3: 'D', 4: 'E' };

type StoredFile = { id: string; name: string };
/** ใบเดิมที่ทีมงานขอข้อมูลเพิ่ม (GET /api/submissions/mentor/:id) ใช้เติมฟอร์มตอนแก้ใบ ใบแบบเก่าไม่มีโปรไฟล์และราคา */
type EditableApplication = {
  note: string;
  submission: Record<Exclude<Field, 'first' | 'last'>, string> & {
    firstName: string; lastName: string; photo: StoredFile | null;
    profile: MentorProfileV2 | null; price: { amount: number; unit: string } | null;
    awards: { title: string; competitionSlug: string | null; kind: Experience['kind']; result: Result; detail: string; year: string;
      role: Experience['role']; roleOther: string; responsibility: string; lessons: string; evidence: string; files: StoredFile[] }[];
  };
};
const priceOf = (amount: number, unit: string): Price => (amount === 0 ? { mode: 'free', price: '', unit: '' } : { mode: 'paid', price: String(amount), unit });

export function MentorApplication() {
  const { t } = useI18n();
  const s = t.mentorApply;
  const v = t.mentorProfileV2;
  const [stage, setStage] = useState(0);
  const [values, setValues] = useState(empty);
  const [profile, setProfile] = useState<MentorProfileV2>(emptyProfile);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const nextExperience = useRef(0);
  // การ์ดที่แสดงปัญหาแล้ว (กดถัดไปหรือกด "เสร็จ") ปัญหาคำนวณใหม่ทุกครั้งที่แก้ จึงหายเองเมื่อแก้ครบ
  const [checkedExperiences, setCheckedExperiences] = useState<number[]>([]);
  const [removed, setRemoved] = useState<{ item: Experience; index: number } | null>(null);
  const [portrait, setPortrait] = useState<File>();
  const [portraitUrl, setPortraitUrl] = useState('');
  const [consent, setConsent] = useState(noConsent);
  const [price, setPrice] = useState<Price>();
  const [showPriceError, setShowPriceError] = useState(false);
  // รายชื่อเวทีทั้งหมดในระบบ (รวมที่ปิดแล้ว) ใช้จับคู่ชื่อเวทีในประสบการณ์ โหลดไม่ได้ก็ยังพิมพ์ชื่อเองได้
  const knownList = useApi<{ items: KnownCompetition[] }>('/consult/open-competitions?all=1');
  const known = knownList.data?.items ?? [];
  // ชื่องานที่เมนเทอร์คนอื่นเคยพิมพ์ไว้ (รายชื่อเดียวกับประสบการณ์ใน Mentor zone) เติมคำอัตโนมัติตามที่พิมพ์อยู่
  const typing = experiences.find((item) => item.open)?.name.trim() ?? '';
  const typed = useApi<{ items: { id: string | null; slug: string | null; name: string }[] }>(
    typing.length >= 2 ? `/hackathon-names?q=${encodeURIComponent(typing)}` : null);
  const suggestions = [...new Set([...known.map((row) => row.name), ...(typed.data?.items ?? []).map((row) => row.name)])];
  /* รายชื่อเวทีโหลดเสร็จทีหลังได้ (เน็ตช้า หรือวางชื่อก่อนโหลดเสร็จ) จับคู่ชื่อที่พิมพ์ไว้แล้วใหม่ทุกครั้งที่รายชื่อเปลี่ยน */
  useEffect(() => {
    if (!knownList.data) return;
    const list = knownList.data.items;
    setExperiences((current) => current.map((item) => {
      const slug = matchCompetition(list, item.name)?.slug ?? (list.some((row) => row.slug === item.slug) ? item.slug : null);
      return slug === item.slug ? item : { ...item, slug };
    }));
  }, [knownList.data]);
  const [message, setMessage] = useState('');
  const [complete, setComplete] = useState(false);
  const [sending, setSending] = useState(false);
  const { user, loading: authLoading } = useAuth();
  /* แก้ใบที่ทีมงานขอข้อมูลเพิ่ม (?edit=<id>) ฟอร์มเดิมทุกขั้น เติมค่าจากใบเดิม ไฟล์เดิมใช้ต่อได้โดยไม่ต้องอัปโหลดใหม่ */
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const editing = useApi<EditableApplication>(editId && user ? `/submissions/mentor/${encodeURIComponent(editId)}` : null);
  const [existingPhoto, setExistingPhoto] = useState<StoredFile | null>(null);
  const prefilled = useRef(false);
  useEffect(() => {
    const data = editing.data?.submission;
    if (!data || prefilled.current) return;
    prefilled.current = true;
    const { firstName, lastName, ...rest } = data;
    setValues(Object.fromEntries((Object.keys(empty) as Field[]).map((key) => [key,
      key === 'first' ? firstName : key === 'last' ? lastName : rest[key] ?? ''])) as Record<Field, string>);
    setExistingPhoto(data.photo);
    if (data.profile) setProfile(data.profile);
    if (data.price) setPrice(priceOf(data.price.amount, data.price.unit));
    setExperiences(data.awards.map((award) => ({
      ...blankExperience(++nextExperience.current), open: false,
      name: award.title, slug: award.competitionSlug, kind: award.kind, result: award.result, detail: award.detail, year: award.year,
      role: award.role, roleOther: award.roleOther, responsibility: award.responsibility, lessons: award.lessons, url: award.evidence,
      proofs: award.files.map((file) => ({ key: file.id, id: file.id, name: file.name })),
    })));
  }, [editing.data]);
  const formRef = useRef<HTMLFormElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousStage = useRef(stage);
  const previousComplete = useRef(complete);

  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);
  useEffect(() => {
    if (!portrait || !['image/jpeg', 'image/png', 'image/webp'].includes(portrait.type) || portrait.size > 4 * 1024 * 1024) { setPortraitUrl(''); return; }
    const url = URL.createObjectURL(portrait);
    setPortraitUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [portrait]);
  useEffect(() => {
    if (stage === previousStage.current && complete === previousComplete.current) return;
    previousStage.current = stage;
    previousComplete.current = complete;
    const heading = sheetRef.current?.querySelector<HTMLElement>(complete ? '.application-complete h2' : `fieldset[data-stage="${stage}"] h2`);
    heading?.focus({ preventScroll: true });
    sheetRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [stage, complete]);

  /** Editing the application after ticking "the data is mine" forces a fresh read-through. */
  const reviewAgain = () => setConsent((current) => (current.accuracy ? { ...current, accuracy: false } : current));
  const set = (field: Field, value: string) => { reviewAgain(); setValues((current) => ({ ...current, [field]: value })); };
  const setProfileField: ProfileSetter = (key, value) => { reviewAgain(); setMessage(''); setProfile((current) => ({ ...current, [key]: value })); };
  const profileProps = { draft: profile, set: setProfileField, busy: sending };
  // คำอธิบายใต้ช่องอยู่นอก label และผูกด้วย aria-describedby ชื่อช่องที่โปรแกรมอ่านหน้าจออ่านจะได้เป็นแค่ชื่อช่อง
  const field = (key: Field, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => <div className="apply-field">
    <label htmlFor={`apply-${key}`}>{label}<input id={`apply-${key}`} value={values[key]} onChange={(event) => set(key, event.target.value)} aria-describedby={hint ? `apply-${key}-hint` : undefined} {...props} /></label>
    {hint && <small id={`apply-${key}-hint`}>{hint}</small>}
  </div>;
  const updateExperience = (id: number, update: Partial<Experience>) => {
    reviewAgain();
    setExperiences((current) => current.map((item) => item.id === id ? { ...item, ...update } : item));
  };
  const addExperience = () => {
    reviewAgain();
    setRemoved(null);
    // การ์ดที่กรอกครบแล้วพับเก็บ เหลือการ์ดใหม่ใบเดียวที่กางอยู่
    setExperiences((current) => [
      ...current.map((item) => (item.open && !experienceProblems(item).length ? { ...item, open: false } : item)),
      blankExperience(++nextExperience.current),
    ]);
  };
  const finishExperience = (item: Experience) => {
    if (experienceProblems(item).length) setCheckedExperiences((current) => [...new Set([...current, item.id])]);
    else updateExperience(item.id, { open: false });
  };
  const removeExperience = (item: Experience, index: number) => {
    reviewAgain();
    setExperiences((current) => current.filter((row) => row.id !== item.id));
    setRemoved({ item, index });
  };
  const undoRemove = () => {
    if (!removed) return;
    setExperiences((current) => [...current.slice(0, removed.index), removed.item, ...current.slice(removed.index)]);
    setRemoved(null);
  };
  const goTo = (target: number) => { setStage(target); setMessage(''); };

  function validate() {
    const active = formRef.current?.querySelector(`fieldset[data-stage="${stage}"]`);
    // ช่องในการ์ดประสบการณ์และช่องโปรไฟล์ตรวจเองพร้อมข้อความ จึงข้ามการตรวจแบบ bubble ของเบราว์เซอร์
    for (const element of active?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not(.exp *):not(.apply-profile *),select:not(.exp *):not(.apply-profile *),textarea:not(.exp *):not(.apply-profile *)') ?? []) {
      element.setCustomValidity('');
      if (element.required && ['text', 'textarea'].includes(element.type) && !element.value.trim()) element.setCustomValidity(s.errors.fillAll);
      if (!element.reportValidity()) return false;
    }
    let error = '';
    let missingConsent: ConsentKey | undefined;
    const section = sectionOfStage[stage];
    // หมวดโปรไฟล์ของขั้นนี้ต้องครบ (กฎเดียวกับ missingSections ที่เซิร์ฟเวอร์ใช้)
    if (section && missingSections(profile, experiences.length).includes(section)) error = s.errors.profile[section as Exclude<Section, 'C'>];
    // รูปโปรไฟล์บังคับ เมนเทอร์ทุกคนมีรูปบนโปรไฟล์ (ผู้ใช้ขอ 6 ต.ค. 2569)
    else if (stage === 0 && !portrait && !existingPhoto) error = s.errors.portraitMissing;
    else if (stage === 0 && portrait && (!['image/png', 'image/jpeg', 'image/webp'].includes(portrait!.type) || portrait!.size > 4 * 1024 * 1024)) error = s.errors.portrait;
    if (stage === 2) {
      // เป็นเมนเทอร์ได้ต้องเคยแข่ง จึงต้องมีประสบการณ์อย่างน้อยหนึ่งรายการ ปัญหาแสดงใต้ช่องในการ์ดนั้น
      const bad = experiences.filter((item) => experienceProblems(item).length);
      if (!experiences.length) error = s.errors.needExperience;
      else if (bad.length) {
        error = s.errors.fixExperience(bad.length);
        setCheckedExperiences(experiences.map((item) => item.id));
        setExperiences((current) => current.map((item) => (experienceProblems(item).length ? { ...item, open: true } : item)));
        setTimeout(() => document.querySelector<HTMLElement>('.exp.is-invalid [aria-invalid="true"]')?.focus(), 50);
      }
    }
    if (stage === 4 && !error) {
      setShowPriceError(true);
      if (priceProblem(price)) {
        error = s.errors.price;
        setTimeout(() => document.querySelector<HTMLElement>('.offer.is-invalid [aria-invalid="true"], .offer.is-invalid input[type=radio]')?.focus(), 50);
      } else if (![values.contactEmail, values.contactLine, values.contactPhone, values.contactInstagram, values.contactLink].some((value) => value.trim())) error = s.errors.needContact;
      else if (values.contactLink.trim() && !isWebLink(values.contactLink)) error = s.errors.badLink;
    }
    if (stage === lastStage) {
      missingConsent = consentKeys.find((key) => !consent[key]);
      if (missingConsent) error = s.errors.consentMissing;
    }
    setMessage(error);
    if (missingConsent) document.getElementById(`consent-${missingConsent}`)?.focus();
    return !error;
  }

  /** อัปโหลดไฟล์ไปที่เก็บก่อน ได้ id กลับมาแนบไปกับใบสมัคร */
  async function upload(file: File) {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/files', { method: 'POST', body, credentials: 'same-origin' });
    const result = await response.json().catch(() => ({})) as { file?: { id: string }; error?: string };
    if (!response.ok || !result.file) throw new ApiError(response.status, result.error ?? s.errors.upload(file.name));
    return result.file.id;
  }

  async function submitApplication() {
    setSending(true);
    setMessage('');
    try {
      const photoFileId = portrait ? await upload(portrait) : existingPhoto!.id;
      // ไฟล์เดิมของใบ (ตอนแก้ใบ) ใช้ id เดิม ไฟล์ใหม่อัปโหลดทีละไฟล์
      const evidenceIds: string[][] = [];
      for (const item of experiences) {
        const ids: string[] = [];
        for (const proof of item.proofs) ids.push(proof.id ?? await upload(proof.file!));
        evidenceIds.push(ids);
      }
      const payload = {
        photoFileId,
        firstName: values.first, lastName: values.last, nickname: values.nickname,
        email: values.email, occupation: values.occupation, organization: values.organization,
        role: values.role, experience: values.experience, portfolio: values.portfolio,
        best: values.best, cannot: values.cannot,
        contactEmail: values.contactEmail, contactLine: values.contactLine, contactPhone: values.contactPhone,
        contactInstagram: values.contactInstagram, contactLink: values.contactLink,
        profile,
        price: price!.mode === 'free' ? { amount: 0, unit: '' } : { amount: Number(price!.price), unit: price!.unit.trim() },
        awards: experiences.map((item, index) => ({
          title: item.name.trim(),
          competitionSlug: item.slug,
          kind: item.kind,
          result: item.result,
          detail: item.detail.trim(),
          year: item.year,
          role: item.role,
          roleOther: item.role === 'other' ? item.roleOther.trim() : '',
          responsibility: item.responsibility.trim(),
          lessons: item.lessons.trim(),
          evidence: item.url.trim(),
          evidenceFileIds: evidenceIds[index],
        })),
      };
      if (editId) await api(`/submissions/mentor/${encodeURIComponent(editId)}`, { method: 'PUT', body: JSON.stringify(payload) });
      else await post('/submissions/mentor', payload);
      setComplete(true);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : s.errors.sendFailed);
    } finally {
      setSending(false);
    }
  }

  function next(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    if (stage < lastStage) { setStage(stage + 1); return; }
    if (!user) {
      setMessage(s.errors.needSignIn);
      return;
    }
    void submitApplication();
  }

  const priceLine = !price || priceProblem(price) ? '' : price.mode === 'free' ? t.price.line(0, null) : t.price.line(Number(price.price), null, price.unit.trim());
  const names = <T extends string | number>(ids: readonly T[], label: (id: T) => string) => ids.map(label).join(' · ');

  const group = (title: string, children: ReactNode, hint?: string, aside?: ReactNode) => <section className="group">
    <div className="group-head"><h3>{title}</h3>{aside}</div>
    {hint && <p className="muted group-hint">{hint}</p>}
    {children}
  </section>;

  const reviewGroup = (title: string, target: number, children: ReactNode) => <section className="group review-group">
    <div className="group-head"><h3>{title}</h3><button className="plain" type="button" aria-label={s.editAria(title)} onClick={() => goTo(target)}>{s.edit}</button></div>
    {children}
  </section>;

  const consentBox = (key: ConsentKey) => <label className="check consent-check" key={key} htmlFor={`consent-${key}`}>
    <input id={`consent-${key}`} type="checkbox" checked={consent[key]} onChange={(event) => setConsent({ ...consent, [key]: event.target.checked })} />
    <span>{s.consent[key]}</span>
  </label>;

  const intro = (index: number, title: string, lead: string) => <>
    <legend className="sr-only">{s.steps[index]}</legend><div className="intro"><h2 tabIndex={-1}>{title}</h2><p className="muted">{lead}</p></div>
  </>;

  return <main id="main" tabIndex={-1}><div id="cw-apply" className="cw-form">
    <section className="hero">
      <div className="application-hero-inner"><Link className="application-back" to="/profile"><ArrowLeft size={16} aria-hidden="true" />{s.backToProfile}</Link><span className="tag">{editId ? s.editEyebrow : s.eyebrow}</span><h1>{s.titleFirst}<br />{s.titleSecond}</h1><p className="muted">{s.lead}</p><p className="application-prototype">{s.reviewNote}</p></div>
    </section>
    <div className="layout">
      <aside aria-label={s.stepsLabel}><ol className="steps">{s.steps.map((step, index) => <li key={step} className={`step ${index === stage ? 'current' : index < stage ? 'done' : ''}`} aria-current={index === stage ? 'step' : undefined}><b>{index + 1}</b>{step}</li>)}</ol><div className="aside-note"><ShieldCheck aria-hidden="true" /><h3>{s.asideReviewTitle}</h3><p className="muted">{s.asideReviewText}</p></div><div className="aside-note"><Eye aria-hidden="true" /><h3>{s.asideSeeTitle}</h3><p className="muted">{s.asideSeeText}</p></div></aside>
      <div className="sheet" ref={sheetRef}>
        {editId && user && (editing.loading ? <p className="note" role="status">{s.editLoading}</p>
          : editing.error ? <p className="note application-edit-error" role="alert">{s.editLoadFailed}</p>
          : editing.data && <section className="application-request" aria-labelledby="application-request-title">
            <h2 id="application-request-title">{s.editRequestTitle}</h2>
            {editing.data.note && <p className="application-request__note">{editing.data.note}</p>}
            <p className="muted">{s.editRequestHint}</p>
          </section>)}
        <form ref={formRef} onSubmit={next} hidden={complete || Boolean(editId && user && !editing.data)} noValidate onInput={(event) => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.target.setCustomValidity(''); }}>
          <fieldset data-stage="0" hidden={stage !== 0} disabled={stage !== 0}>
            {intro(0, s.stage0Title, s.stage0Lead)}
            <div className="grid">{field('first', s.firstName, { required: true, maxLength: 50, autoComplete: 'given-name' })}{field('last', s.lastName, { required: true, maxLength: 60, autoComplete: 'family-name' }, s.lastNameHint)}</div>
            {field('nickname', s.nickname, { required: true, maxLength: 30, placeholder: s.nicknamePlaceholder })}
            {field('email', s.email, { type: 'email', required: true, autoComplete: 'email' }, s.emailHint)}
            <div className="grid"><label htmlFor="apply-occupation">{s.occupation}<select id="apply-occupation" required value={values.occupation} onChange={(event) => set('occupation', event.target.value)}><option value="">{s.occupationPlaceholder}</option>{applicantStatuses.map((id) => <option key={id} value={occupationValues[id]}>{t.taxonomy.occupations[id]}</option>)}</select></label>{field('organization', s.organization, { required: true, maxLength: 100 })}</div>
            {field('role', s.role, { required: true, maxLength: 100, placeholder: s.rolePlaceholder })}
            <label htmlFor="apply-portrait">{s.portrait}<input id="apply-portrait" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { reviewAgain(); setPortrait(event.target.files?.[0]); }} /><small>{s.portraitHint}</small></label>
            {existingPhoto && !portrait && <p className="portrait-current"><img src={`/api/files/${existingPhoto.id}`} alt={s.portraitAlt} />{s.portraitCurrent}</p>}
            {group(s.profileGroup, <div className="apply-profile cx-form"><BasicFields {...profileProps} /></div>, s.profileHint)}
          </fieldset>

          <fieldset data-stage="1" hidden={stage !== 1} disabled={stage !== 1}>
            {intro(1, s.skillsTitle, s.skillsLead)}
            <div className="apply-profile cx-form"><SkillFields {...profileProps} /></div>
          </fieldset>

          <fieldset data-stage="2" hidden={stage !== 2} disabled={stage !== 2}>
            {intro(2, s.stage1Title, s.stage1Lead)}
            {group(s.journeyGroup, <label htmlFor="apply-experience">{s.experience}<textarea id="apply-experience" required maxLength={600} value={values.experience} onChange={(event) => set('experience', event.target.value)} placeholder={s.experiencePlaceholder} /></label>, s.journeyHint)}
            {group(s.awardsGroup, <>
              <datalist id="apply-known-competitions">{suggestions.map((name) => <option key={name} value={name} />)}</datalist>
              {experiences.map((item, index) => <ExperienceCard key={item.id} index={index} item={item} known={known} listId="apply-known-competitions"
                problems={checkedExperiences.includes(item.id) ? experienceProblems(item) : []} onChange={(patch) => updateExperience(item.id, patch)}
                onRemove={() => removeExperience(item, index)} onDone={() => finishExperience(item)} />)}
              {removed && <p className="exp-undo" role="status">{s.exp.removed(removed.item.name || s.exp.heading(removed.index + 1))}
                <button type="button" className="plain" onClick={undoRemove}>{s.exp.undo}</button></p>}
              <button type="button" className="exp-add" onClick={addExperience}>{s.addAward}</button>
            </>, s.awardsHint, <span className="count">{s.awardsCount(experiences.length)}</span>)}
            {group(s.portfolioGroup, <>
              {field('portfolio', s.portfolioLink, { type: 'url', placeholder: 'https://...' }, s.portfolioHint)}
              <div className="note">{s.verifiedNote}</div>
            </>)}
          </fieldset>

          <fieldset data-stage="3" hidden={stage !== 3} disabled={stage !== 3}>
            {intro(3, s.stage2Title, s.stage2Lead)}
            {group(s.scopeGroup, <>
              {field('best', s.best, { required: true, maxLength: 120, placeholder: s.bestPlaceholder }, s.bestHint)}
              {field('cannot', s.cannot, { required: true, maxLength: 120, placeholder: s.cannotPlaceholder }, s.cannotHint)}
            </>)}
            {group(s.mentoringGroup, <div className="apply-profile cx-form"><MentoringFields {...profileProps} /></div>, s.mentoringHint)}
          </fieldset>

          <fieldset data-stage="4" hidden={stage !== 4} disabled={stage !== 4}>
            {intro(4, s.timeTitle, s.timeLead)}
            {group(s.timeGroup, <div className="apply-profile cx-form"><AvailabilityFields {...profileProps} accepting={false} /></div>)}
            {group(s.priceGroup, <ul className="offers-list"><PriceCard name={s.priceName} price={price} invalid={showPriceError}
              onChange={(next) => { reviewAgain(); setPrice(next); }} /></ul>, s.priceHint)}
            {group(s.contactsGroup, <div className="grid">
              {field('contactEmail', s.contactEmail, { type: 'email', maxLength: 200, autoComplete: 'off' })}
              {field('contactLine', s.contactLine, { maxLength: 100, autoComplete: 'off' })}
              {field('contactPhone', s.contactPhone, { type: 'tel', maxLength: 40, autoComplete: 'off' })}
              {field('contactInstagram', s.contactInstagram, { maxLength: 100, autoComplete: 'off' })}
              {field('contactLink', s.contactLink, { type: 'url', maxLength: 500, placeholder: 'https://', autoComplete: 'off' }, s.contactLinkHint)}
            </div>, s.contactsHint)}
            <p className="muted">{s.zoneNote}</p>
          </fieldset>

          <fieldset data-stage="5" hidden={stage !== 5} disabled={stage !== 5}>
            {intro(5, s.stage3Title, s.stage3Lead)}
            {group(s.previewGroup, <div className="profile">
              {portraitUrl || existingPhoto ? <img className="avatar" src={portraitUrl || `/api/files/${existingPhoto!.id}`} alt={s.portraitAlt} /> : <div className="avatar" aria-hidden="true">{values.first.slice(0, 1)}</div>}
              <h4>{values.nickname} {values.last.trim().slice(0, 1)}.</h4>
              {profile.headline && <p><strong>{profile.headline}</strong></p>}
              <p className="muted">{values.role} · {values.organization}</p>
              <p><strong>{s.bestLabel}</strong> {values.best}</p>
              <p><strong>{s.cannotLabel}</strong> {values.cannot}</p>
              <p>{profile.helpsWith.map((id) => <span className="tag" key={id}>{v.helpsWithNames[id]}</span>)}</p>
              <small>{s.previewFooter}</small>
            </div>, s.previewHint)}
            {reviewGroup(s.reviewApplicant, 0, <>
              <div className="review"><small>{s.reviewFullName}</small><strong>{values.first} {values.last}</strong></div>
              <div className="review"><small>{s.reviewEmail}</small><strong>{values.email}</strong></div>
              <div className="review"><small>{s.reviewStatus}</small>{occupationLabel(values.occupation, t)} · {values.organization}</div>
              <div className="review"><small>{v.sectionNames.A}</small>{[profile.headline, v.countries[profile.country], profile.background, names(profile.languages, (id) => v.languageNames[id])].filter(Boolean).join(' · ')}</div>
            </>)}
            {reviewGroup(s.steps[1], 1, <div className="review"><small>{v.skills}</small>{profile.skills.map((skill) => `${v.skillNames[skill.tag]} (${v.levelNames[skill.level]})`).join(' · ')}</div>)}
            {reviewGroup(s.reviewExperienceGroup, 2, <>
              <div className="review"><small>{s.reviewExperience}</small>{values.experience}</div>
              {experiences.map((item) => <div className="review" key={item.id}>
                <strong>{item.name}</strong>
                <p>{[item.kind && v.kindNames[item.kind], item.year, item.result && v.resultNames[item.result], item.detail, item.role && (item.role === 'other' ? item.roleOther : v.roleNames[item.role])].filter(Boolean).join(' · ')}</p>
                <small>{s.reviewAwaiting([...item.proofs.map((proof) => proof.name), item.url.trim()].filter(Boolean).join(', '))}</small>
              </div>)}
              {values.portfolio && <div className="review"><small>{s.reviewPortfolio}</small>{values.portfolio}</div>}
            </>)}
            {reviewGroup(s.steps[3], 3, <>
              <div className="review"><small>{v.helpsWith}</small>{names(profile.helpsWith, (id) => v.helpsWithNames[id])}</div>
              <div className="review"><small>{v.learnerLevels}</small>{names(profile.learnerLevels, (id) => v.learnerLevelNames[id])}</div>
              <div className="review"><small>{v.teachingStyles}</small>{names(profile.teachingStyles, (id) => v.teachingStyleNames[id])}</div>
              <div className="review"><small>{v.formats}</small>{names(profile.formats, (id) => v.formatNames[id])}</div>
            </>)}
            {reviewGroup(s.steps[4], 4, <>
              <div className="review"><small>{v.availability}</small>{profile.availability.map((slot) => `${v.days[slot.day]} ${slot.from}–${slot.to}`).join(' · ')}</div>
              <div className="review"><small>{v.sessionMinutes}</small>{[names(profile.sessionMinutes, (n) => v.minutes(n)), profile.sessionsPerWeek && `${v.sessionsPerWeek}: ${profile.sessionsPerWeek}`, profile.replyHours && v.replyOptions[profile.replyHours], profile.mode && v.modeNames[profile.mode]].filter(Boolean).join(' · ')}</div>
              <div className="review"><small>{s.priceGroup}</small><strong>{priceLine}</strong></div>
              <div className="review"><small>{s.reviewContacts}</small>{[values.contactEmail, values.contactLine, values.contactPhone, values.contactInstagram, values.contactLink].filter((value) => value.trim()).join(' · ')}</div>
            </>)}
            {group(s.consentGroup, <>
              <div className="consent-list">{consentKeys.slice(0, 4).map(consentBox)}</div>
              <div className="consent-payment">{consentBox('payment')}</div>
              <div className="note">{s.consentNote}</div>
            </>, s.consentHint)}
          </fieldset>
          {!authLoading && !user && <p className="note" role="status">
            {s.signInBefore}<Link to={`/signin?next=${encodeURIComponent(editId ? `/mentors/apply?edit=${editId}` : '/mentors/apply')}`}>{s.signInLink}</Link>{s.signInAfter}
          </p>}
          <p className="application-message" role="alert">{message}</p><div className="actions">{stage > 0 && <button type="button" onClick={() => goTo(stage - 1)}>{s.back}</button>}<span className="muted">{s.stepOf(stage + 1)}</span><button className="primary" type="submit" disabled={sending}>{stage === lastStage ? (sending ? s.submitting : editId ? s.editSubmit : s.submit) : s.next}{stage < lastStage && <ArrowRight aria-hidden="true" />}</button></div>
        </form>
        {complete && <div className="application-complete"><ClipboardCheck className="finish-icon" aria-hidden="true" /><h2 tabIndex={-1}>{editId ? s.editDoneTitle : s.doneTitle}</h2><p>{editId ? s.editDoneText : s.doneText}</p><div className="note">{s.doneNote}</div><p className="muted">{s.doneStatuses}</p><button type="button" onClick={() => setComplete(false)}>{s.doneBack}</button><Link className="application-return" to="/profile">{s.doneProfile}</Link></div>}
      </div>
    </div>
    <p className="application-local-note">{s.localNote}</p>
  </div></main>;
}
