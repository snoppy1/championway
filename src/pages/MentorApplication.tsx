import { useEffect, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ClipboardCheck, Eye, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { occupationValues, topicIds, topicValues } from '../data/stored-values';
import type { OccupationId, TopicId } from '../data/stored-values';
import { occupationLabel } from '../data/profile';
import { useAuth } from '../data/auth';
import { ApiError, post } from '../lib/api';
import { useApi } from '../lib/useApi';
import { isWebLink } from '../data/consult';
import { ExperienceCard, PriceCard, experienceProblems, matchCompetition, priceProblem } from '../components/ApplyExperience';
import type { Experience, KnownCompetition, Price } from '../components/ApplyExperience';
import { useI18n } from '../i18n';
import '../form.css';

/* ใบสมัครเมนเทอร์ไม่มีตัวเลือก "นักเรียน" เพราะเมนเทอร์ต้องผ่านเวทีมาแล้ว */
const applicantStatuses: OccupationId[] = ['university', 'working', 'other'];
/* ขั้น 2 ประสบการณ์แข่งขัน (ติ๊กเวทีที่อยากเป็นเมนเทอร์ได้เฉพาะเวทีที่เคยแข่งและมีในระบบ)
   ขั้น 3 ช่องทางติดต่อ และราคาของเวทีที่ติ๊กไว้ (ฟรี หรือบาทต่อหน่วยที่พิมพ์เอง) ไม่มีราคากลาง
   ติดต่อกันนอกเว็บ เว็บไม่เก็บเงิน แก้ราคาได้ภายหลังใน Mentor zone */
type Field = 'first' | 'last' | 'nickname' | 'email' | 'occupation' | 'organization' | 'role' | 'experience' | 'portfolio' | 'best' | 'cannot'
  | 'contactEmail' | 'contactLine' | 'contactPhone' | 'contactInstagram' | 'contactLink';
const empty: Record<Field, string> = { first: '', last: '', nickname: '', email: '', occupation: '', organization: '', role: '', experience: '', portfolio: '', best: '', cannot: '', contactEmail: '', contactLine: '', contactPhone: '', contactInstagram: '', contactLink: '' };

type ConsentKey = 'accuracy' | 'guidanceOnly' | 'replies' | 'noJudging' | 'payment';
/** Every box starts unticked and all of them are required before the sample submit. */
const consentKeys: ConsentKey[] = ['accuracy', 'guidanceOnly', 'replies', 'noJudging', 'payment'];
const noConsent: Record<ConsentKey, boolean> = { accuracy: false, guidanceOnly: false, replies: false, noJudging: false, payment: false };

export function MentorApplication() {
  const { t } = useI18n();
  const s = t.mentorApply;
  const [stage, setStage] = useState(0);
  const [values, setValues] = useState(empty);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const nextExperience = useRef(0);
  // การ์ดที่แสดงปัญหาแล้ว (กดถัดไปหรือกด "เสร็จ") ปัญหาคำนวณใหม่ทุกครั้งที่แก้ จึงหายเองเมื่อแก้ครบ
  const [checkedExperiences, setCheckedExperiences] = useState<number[]>([]);
  const [removed, setRemoved] = useState<{ item: Experience; index: number } | null>(null);
  const [portrait, setPortrait] = useState<File>();
  const [portraitUrl, setPortraitUrl] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<TopicId[]>([]);
  const [consent, setConsent] = useState(noConsent);
  const [prices, setPrices] = useState<Record<string, Price>>({});
  const [showPriceErrors, setShowPriceErrors] = useState(false);
  // รายชื่อเวทีทั้งหมดในระบบ (รวมที่ปิดแล้ว) ใช้จับคู่ชื่อเวทีในประสบการณ์ โหลดไม่ได้ก็ยังพิมพ์ชื่อเองได้
  const knownList = useApi<{ items: KnownCompetition[] }>('/consult/open-competitions?all=1');
  const known = knownList.data?.items ?? [];
  /* รายชื่อเวทีโหลดเสร็จทีหลังได้ (เน็ตช้า หรือวางชื่อก่อนโหลดเสร็จ) จับคู่ชื่อที่พิมพ์ไว้แล้วใหม่ทุกครั้งที่รายชื่อเปลี่ยน
     ไม่งั้นเวทีที่มีในระบบจะค้างเป็น "ยังไม่มีใน ChampionWays" และติ๊กเป็นเมนเทอร์ไม่ได้ (เจอจากการทดสอบบน dev 5 ต.ค. 2569) */
  useEffect(() => {
    if (!knownList.data) return;
    const list = knownList.data.items;
    setExperiences((current) => current.map((item) => {
      const slug = matchCompetition(list, item.name)?.slug ?? null;
      return slug === item.slug ? item : { ...item, slug };
    }));
  }, [knownList.data]);
  /* เวทีที่ติ๊กว่าอยากเป็นเมนเทอร์ ไม่ซ้ำกัน ตามลำดับที่ใส่ เวทีในระบบใช้ slug เป็นคีย์ราคา
     เวทีที่ยังไม่มีในระบบใช้ new-<id ของการ์ด> และส่งราคาไปกับรายการนั้น อนุมัติแล้วกลายเป็นคำขอเพิ่มเวที */
  const priceKey = (item: Experience) => item.slug ?? `new-${item.id}`;
  const mentorFor = [...new Map(experiences.filter((item) => item.mentor && item.name.trim())
    .map((item) => [priceKey(item), known.find((row) => row.slug === item.slug)?.name ?? item.name.trim()])).entries()];
  const [message, setMessage] = useState('');
  const [complete, setComplete] = useState(false);
  const [sending, setSending] = useState(false);
  const { user, loading: authLoading } = useAuth();
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
      { id: ++nextExperience.current, name: '', slug: null, result: '', detail: '', year: '', url: '', mentor: false, open: true },
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
    // ช่องในการ์ดประสบการณ์ตรวจเองพร้อมข้อความใต้ช่อง จึงข้ามการตรวจแบบ bubble ของเบราว์เซอร์
    for (const element of active?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:not(.exp *),select:not(.exp *),textarea:not(.exp *)') ?? []) {
      element.setCustomValidity('');
      if (element.required && ['text', 'textarea'].includes(element.type) && !element.value.trim()) element.setCustomValidity(s.errors.fillAll);
      if (!element.reportValidity()) return false;
    }
    let error = '';
    let missingConsent: ConsentKey | undefined;
    // รูปโปรไฟล์บังคับ เมนเทอร์ทุกคนมีรูปบนหน้าเวที (ผู้ใช้ขอ 6 ต.ค. 2569)
    if (stage === 0 && !portrait) error = s.errors.portraitMissing;
    else if (stage === 0 && (!['image/png', 'image/jpeg', 'image/webp'].includes(portrait!.type) || portrait!.size > 4 * 1024 * 1024)) error = s.errors.portrait;
    if (stage === 1) {
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
    if (stage === 2) {
      if (selectedTopics.length !== 2) error = s.errors.pickTwo;
      else if (![values.contactEmail, values.contactLine, values.contactPhone, values.contactInstagram, values.contactLink].some((value) => value.trim())) error = s.errors.needContact;
      else if (values.contactLink.trim() && !isWebLink(values.contactLink)) error = s.errors.badLink;
      // ทุกเวทีที่ติ๊กไว้ต้องเลือกฟรี หรือใส่ราคากับหน่วยให้ครบ
      const bad = mentorFor.filter(([slug]) => priceProblem(prices[slug]));
      setShowPriceErrors(true);
      if (!error && bad.length) {
        error = s.errors.offerPrice(bad.length);
        // รอให้กรอบแดงขึ้นก่อน แล้วพาไปการ์ดแรกที่ต้องแก้
        setTimeout(() => document.querySelector<HTMLElement>('.offer.is-invalid [aria-invalid="true"], .offer.is-invalid input[type=radio]')?.focus(), 50);
      }
    }
    if (stage === 3) {
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
      const photoFileId = await upload(portrait!);
      const evidenceIds: string[] = [];
      for (const item of experiences) evidenceIds.push(await upload(item.file!));
      await post('/submissions/mentor', {
        photoFileId,
        firstName: values.first, lastName: values.last, nickname: values.nickname,
        email: values.email, occupation: values.occupation, organization: values.organization,
        role: values.role, experience: values.experience, portfolio: values.portfolio,
        best: values.best, cannot: values.cannot,
        contactEmail: values.contactEmail, contactLine: values.contactLine, contactPhone: values.contactPhone,
        contactInstagram: values.contactInstagram, contactLink: values.contactLink,
        offers: mentorFor.filter(([key]) => !key.startsWith('new-')).map(([slug]) => {
          const price = prices[slug];
          return price.mode === 'free' ? { slug, price: 0, unit: '' } : { slug, price: Number(price.price), unit: price.unit.trim() };
        }),
        // ฐานข้อมูลเก็บความถนัดเป็นข้อความไทยตามเดิม ไม่ว่าผู้ใช้เลือกภาษาไหน
        topics: selectedTopics.map((id) => topicValues[id]),
        awards: experiences.map((item, index) => {
          const typedPrice = item.mentor && !item.slug ? prices[priceKey(item)] : undefined;
          return {
            title: item.name.trim(),
            competitionSlug: item.slug,
            result: item.result,
            detail: item.detail.trim(),
            year: item.year,
            wantsMentor: item.mentor,
            evidence: item.url.trim(),
            evidenceFileId: evidenceIds[index],
            offer: typedPrice ? { price: typedPrice.mode === 'free' ? 0 : Number(typedPrice.price), unit: typedPrice.mode === 'free' ? '' : typedPrice.unit.trim() } : null,
          };
        }),
      });
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
    if (stage < 3) { setStage(stage + 1); return; }
    if (!user) {
      setMessage(s.errors.needSignIn);
      return;
    }
    void submitApplication();
  }

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

  return <main id="main" tabIndex={-1}><div id="cw-apply" className="cw-form">
    <section className="hero">
      <div className="application-hero-inner"><Link className="application-back" to="/profile"><ArrowLeft size={16} aria-hidden="true" />{s.backToProfile}</Link><span className="tag">{s.eyebrow}</span><h1>{s.titleFirst}<br />{s.titleSecond}</h1><p className="muted">{s.lead}</p><p className="application-prototype">{s.reviewNote}</p></div>
    </section>
    <div className="layout">
      <aside aria-label={s.stepsLabel}><ol className="steps">{s.steps.map((step, index) => <li key={step} className={`step ${index === stage ? 'current' : index < stage ? 'done' : ''}`} aria-current={index === stage ? 'step' : undefined}><b>{index + 1}</b>{step}</li>)}</ol><div className="aside-note"><ShieldCheck aria-hidden="true" /><h3>{s.asideReviewTitle}</h3><p className="muted">{s.asideReviewText}</p></div><div className="aside-note"><Eye aria-hidden="true" /><h3>{s.asideSeeTitle}</h3><p className="muted">{s.asideSeeText}</p></div></aside>
      <div className="sheet" ref={sheetRef}>
        <form ref={formRef} onSubmit={next} hidden={complete} noValidate onInput={(event) => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.target.setCustomValidity(''); }}>
          <fieldset data-stage="0" hidden={stage !== 0} disabled={stage !== 0}>
            <legend className="sr-only">{s.steps[0]}</legend><div className="intro"><h2 tabIndex={-1}>{s.stage0Title}</h2><p className="muted">{s.stage0Lead}</p></div>
            <div className="grid">{field('first', s.firstName, { required: true, maxLength: 50, autoComplete: 'given-name' })}{field('last', s.lastName, { required: true, maxLength: 60, autoComplete: 'family-name' }, s.lastNameHint)}</div>
            {field('nickname', s.nickname, { required: true, maxLength: 30, placeholder: s.nicknamePlaceholder })}
            {field('email', s.email, { type: 'email', required: true, autoComplete: 'email' }, s.emailHint)}
            <div className="grid"><label htmlFor="apply-occupation">{s.occupation}<select id="apply-occupation" required value={values.occupation} onChange={(event) => set('occupation', event.target.value)}><option value="">{s.occupationPlaceholder}</option>{applicantStatuses.map((id) => <option key={id} value={occupationValues[id]}>{t.taxonomy.occupations[id]}</option>)}</select></label>{field('organization', s.organization, { required: true, maxLength: 100 })}</div>
            {field('role', s.role, { required: true, maxLength: 100, placeholder: s.rolePlaceholder })}
            <label htmlFor="apply-portrait">{s.portrait}<input id="apply-portrait" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { reviewAgain(); setPortrait(event.target.files?.[0]); }} /><small>{s.portraitHint}</small></label>
          </fieldset>

          <fieldset data-stage="1" hidden={stage !== 1} disabled={stage !== 1}>
            <legend className="sr-only">{s.steps[1]}</legend><div className="intro"><h2 tabIndex={-1}>{s.stage1Title}</h2><p className="muted">{s.stage1Lead}</p></div>
            {group(s.journeyGroup, <label htmlFor="apply-experience">{s.experience}<textarea id="apply-experience" required maxLength={600} value={values.experience} onChange={(event) => set('experience', event.target.value)} placeholder={s.experiencePlaceholder} /></label>, s.journeyHint)}
            {group(s.awardsGroup, <>
              <datalist id="apply-known-competitions">{known.map((row) => <option key={row.slug} value={row.name}>{row.org}</option>)}</datalist>
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

          <fieldset data-stage="2" hidden={stage !== 2} disabled={stage !== 2}>
            <legend className="sr-only">{s.steps[2]}</legend><div className="intro"><h2 tabIndex={-1}>{s.stage2Title}</h2><p className="muted">{s.stage2Lead}</p></div>
            {group(s.scopeGroup, <>
              {field('best', s.best, { required: true, maxLength: 120, placeholder: s.bestPlaceholder }, s.bestHint)}
              {field('cannot', s.cannot, { required: true, maxLength: 120, placeholder: s.cannotPlaceholder }, s.cannotHint)}
            </>)}
            {group(s.strengthsGroup, <div className="topics" role="group" aria-labelledby="topic-label">
              {topicIds.map((topic) => <label className="check topic" key={topic}><input type="checkbox" checked={selectedTopics.includes(topic)} onChange={(event) => { if (event.target.checked && selectedTopics.length === 2) { setMessage(s.errors.maxTopics); return; } reviewAgain(); setSelectedTopics(event.target.checked ? [...selectedTopics, topic] : selectedTopics.filter((item) => item !== topic)); setMessage(''); }} /><span>{t.taxonomy.topics[topic]}</span></label>)}
            </div>, s.strengthsHint, <span className="count" id="topic-label" aria-live="polite">{s.strengthsCount(selectedTopics.length)}</span>)}
            {group(s.contactsGroup, <div className="grid">
              {field('contactEmail', s.contactEmail, { type: 'email', maxLength: 200, autoComplete: 'off' })}
              {field('contactLine', s.contactLine, { maxLength: 100, autoComplete: 'off' })}
              {field('contactPhone', s.contactPhone, { type: 'tel', maxLength: 40, autoComplete: 'off' })}
              {field('contactInstagram', s.contactInstagram, { maxLength: 100, autoComplete: 'off' })}
              {field('contactLink', s.contactLink, { type: 'url', maxLength: 500, placeholder: 'https://', autoComplete: 'off' }, s.contactLinkHint)}
            </div>, s.contactsHint)}
            {group(s.pricingGroup, mentorFor.length
              ? <ul className="offers-list">{mentorFor.map(([slug, name]) => <PriceCard key={slug} name={name} price={prices[slug]} invalid={showPriceErrors}
                onChange={(next) => { reviewAgain(); setPrices((current) => ({ ...current, [slug]: next })); }} />)}</ul>
              : <div className="note">{s.pricingEmpty}</div>, s.pricingHint)}
            <p className="muted">{s.zoneNote}</p>
          </fieldset>

          <fieldset data-stage="3" hidden={stage !== 3} disabled={stage !== 3}>
            <legend className="sr-only">{s.steps[3]}</legend><div className="intro"><h2 tabIndex={-1}>{s.stage3Title}</h2><p className="muted">{s.stage3Lead}</p></div>
            {group(s.previewGroup, <div className="profile">
              {portraitUrl ? <img className="avatar" src={portraitUrl} alt={s.portraitAlt} /> : <div className="avatar" aria-hidden="true">{values.first.slice(0, 1)}</div>}
              <h4>{values.nickname} {values.last.trim().slice(0, 1)}.</h4>
              <p className="muted">{values.role} · {values.organization}</p>
              <p><strong>{s.bestLabel}</strong> {values.best}</p>
              <p><strong>{s.cannotLabel}</strong> {values.cannot}</p>
              <p>{selectedTopics.map((topic) => <span className="tag" key={topic}>{t.taxonomy.topics[topic]}</span>)}</p>
              <small>{s.previewFooter}</small>
            </div>, s.previewHint)}
            {reviewGroup(s.reviewApplicant, 0, <>
              <div className="review"><small>{s.reviewFullName}</small><strong>{values.first} {values.last}</strong></div>
              <div className="review"><small>{s.reviewEmail}</small><strong>{values.email}</strong></div>
              <div className="review"><small>{s.reviewStatus}</small>{occupationLabel(values.occupation, t)} · {values.organization}</div>
            </>)}
            {reviewGroup(s.reviewExperienceGroup, 1, <>
              <div className="review"><small>{s.reviewExperience}</small>{values.experience}</div>
              {experiences.map((item) => <div className="review" key={item.id}>
                <strong>{item.name}</strong>
                <p>{[item.result && t.taxonomy.results[item.result], item.detail, item.year].filter(Boolean).join(' · ')}</p>
                <small>{s.reviewAwaiting(item.file?.name || item.url)}{item.mentor ? ` · ${s.reviewWantsMentor}` : ''}</small>
              </div>)}
              {values.portfolio && <div className="review"><small>{s.reviewPortfolio}</small>{values.portfolio}</div>}
            </>)}
            {reviewGroup(s.strengthsGroup, 2, <>
              <div className="review"><small>{s.reviewStrengths}</small>{selectedTopics.map((topic) => t.taxonomy.topics[topic]).join(' · ')}</div>
              <div className="review"><small>{s.reviewContacts}</small>{[values.contactEmail, values.contactLine, values.contactPhone, values.contactInstagram, values.contactLink].filter((value) => value.trim()).join(' · ')}</div>
              <div className="review"><small>{s.reviewCompetitions}</small>{mentorFor.length
                ? <ul className="review-offers">{mentorFor.map(([slug, name]) => <li key={slug}>
                  <span>{name}</span>
                  <strong>{prices[slug]?.mode === 'free' ? t.price.line(0, null) : t.price.line(Number(prices[slug]?.price), null, prices[slug]?.unit.trim())}</strong>
                </li>)}</ul>
                : s.reviewNoCompetitions}</div>
            </>)}
            {group(s.consentGroup, <>
              <div className="consent-list">{consentKeys.slice(0, 4).map(consentBox)}</div>
              <div className="consent-payment">{consentBox('payment')}</div>
              <div className="note">{s.consentNote}</div>
            </>, s.consentHint)}
          </fieldset>
          {!authLoading && !user && <p className="note" role="status">
            {s.signInBefore}<Link to="/signin?next=/mentors/apply">{s.signInLink}</Link>{s.signInAfter}
          </p>}
          <p className="application-message" role="alert">{message}</p><div className="actions">{stage > 0 && <button type="button" onClick={() => goTo(stage - 1)}>{s.back}</button>}<span className="muted">{s.stepOf(stage + 1)}</span><button className="primary" type="submit" disabled={sending}>{stage === 3 ? (sending ? s.submitting : s.submit) : s.next}{stage < 3 && <ArrowRight aria-hidden="true" />}</button></div>
        </form>
        {complete && <div className="application-complete"><ClipboardCheck className="finish-icon" aria-hidden="true" /><h2 tabIndex={-1}>{s.doneTitle}</h2><p>{s.doneText}</p><div className="note">{s.doneNote}</div><p className="muted">{s.doneStatuses}</p><button type="button" onClick={() => setComplete(false)}>{s.doneBack}</button><Link className="application-return" to="/profile">{s.doneProfile}</Link></div>}
      </div>
    </div>
    <p className="application-local-note">{s.localNote}</p>
  </div></main>;
}
