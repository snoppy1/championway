import { useEffect, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ClipboardCheck, Eye, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { evidenceValues, occupationValues, topicIds, topicValues } from '../data/stored-values';
import type { OccupationId, TopicId } from '../data/stored-values';
import { occupationLabel } from '../data/profile';
import { useAuth } from '../data/auth';
import { ApiError, post } from '../lib/api';
import { useApi } from '../lib/useApi';
import { isWebLink, parsePrice } from '../data/consult';
import { CompetitionOffers } from '../components/CompetitionOffers';
import type { OpenCompetition, Offers } from '../components/CompetitionOffers';
import { useI18n } from '../i18n';
import '../form.css';

/* ใบสมัครเมนเทอร์ไม่มีตัวเลือก "นักเรียน" เพราะเมนเทอร์ต้องผ่านเวทีมาแล้ว */
const applicantStatuses: OccupationId[] = ['university', 'working', 'other'];
/* ช่องทางติดต่อและงานที่ติ๊กไว้พร้อมราคาของแต่ละงานอยู่ในใบสมัครตั้งแต่ต้น ไม่มีราคากลาง
   ติดต่อกันนอกเว็บ เว็บไม่เก็บเงิน แก้ทั้งหมดได้ภายหลังใน Mentor zone */
type Field = 'first' | 'last' | 'nickname' | 'email' | 'occupation' | 'organization' | 'role' | 'experience' | 'portfolio' | 'best' | 'cannot'
  | 'contactEmail' | 'contactLine' | 'contactPhone' | 'contactInstagram' | 'contactLink';
interface Award { id: number; title: string; prize: string; year: string; url: string; file?: File }
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
  const [awards, setAwards] = useState<Award[]>([]);
  const nextAward = useRef(0);
  const [portrait, setPortrait] = useState<File>();
  const [portraitUrl, setPortraitUrl] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<TopicId[]>([]);
  const [consent, setConsent] = useState(noConsent);
  const [offers, setOffers] = useState<Offers>({});
  const [badOffers, setBadOffers] = useState<string[]>([]);
  // รายชื่อเวทีที่ยังเปิดรับสมัคร ใช้ติ๊กเลือก ไม่บังคับ โหลดไม่ได้ก็ส่งใบสมัครต่อได้
  const openList = useApi<{ items: OpenCompetition[] }>('/consult/open-competitions');
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
    if (!portrait || !['image/jpeg', 'image/png', 'image/webp'].includes(portrait.type) || portrait.size > 5 * 1024 * 1024) { setPortraitUrl(''); return; }
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
  const updateAward = (id: number, update: Partial<Award>) => { reviewAgain(); setAwards((current) => current.map((award) => award.id === id ? { ...award, ...update } : award)); };
  const goTo = (target: number) => { setStage(target); setMessage(''); };

  function validate() {
    const active = formRef.current?.querySelector(`fieldset[data-stage="${stage}"]`);
    for (const element of active?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea') ?? []) {
      element.setCustomValidity('');
      if (element.required && ['text', 'textarea'].includes(element.type) && !element.value.trim()) element.setCustomValidity(s.errors.fillAll);
      if (!element.reportValidity()) return false;
    }
    let error = '';
    let missingConsent: ConsentKey | undefined;
    if (stage === 0 && portrait && (!['image/png', 'image/jpeg', 'image/webp'].includes(portrait.type) || portrait.size > 5 * 1024 * 1024)) error = s.errors.portrait;
    if (stage === 1) {
      if (!awards.length && !values.portfolio.trim()) error = s.errors.needEvidence;
      for (const award of awards) {
        if (!award.url.trim() && !award.file) error = s.errors.awardNeedsProof;
        if (award.file && (award.file.size > 10 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png'].includes(award.file.type))) error = s.errors.evidenceFile;
      }
    }
    if (stage === 2) {
      if (selectedTopics.length !== 2) error = s.errors.pickTwo;
      else if (![values.contactEmail, values.contactLine, values.contactPhone, values.contactInstagram, values.contactLink].some((value) => value.trim())) error = s.errors.needContact;
      else if (values.contactLink.trim() && !isWebLink(values.contactLink)) error = s.errors.badLink;
      // งานที่ติ๊กแล้วต้องมีราคาที่ถูกต้อง หรือติ๊กข้ามไว้ก่อน
      const bad = Object.entries(offers).filter(([, offer]) => !offer.skip && !parsePrice(offer.price, offer.minutes)).map(([slug]) => slug);
      setBadOffers(bad);
      if (!error && bad.length) {
        error = s.errors.offerPrice(bad.length);
        // รอให้กรอบแดงขึ้นก่อน แล้วพาไปช่องราคาแรกที่ต้องแก้
        setTimeout(() => document.querySelector<HTMLInputElement>('.offer.is-invalid .offer-rate__input[aria-invalid="true"]')?.focus(), 50);
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

  async function submitApplication() {
    setSending(true);
    setMessage('');
    try {
      await post('/submissions/mentor', {
        firstName: values.first, lastName: values.last, nickname: values.nickname,
        email: values.email, occupation: values.occupation, organization: values.organization,
        role: values.role, experience: values.experience, portfolio: values.portfolio,
        best: values.best, cannot: values.cannot,
        contactEmail: values.contactEmail, contactLine: values.contactLine, contactPhone: values.contactPhone,
        contactInstagram: values.contactInstagram, contactLink: values.contactLink,
        offers: Object.entries(offers).map(([slug, offer]) => ({
          slug, ...(offer.skip ? { price: null, minutes: null } : parsePrice(offer.price, offer.minutes)!),
        })),
        // ฐานข้อมูลเก็บความถนัดเป็นข้อความไทยตามเดิม ไม่ว่าผู้ใช้เลือกภาษาไหน
        topics: selectedTopics.map((id) => topicValues[id]),
        awards: awards.map((award) => ({
          title: award.title,
          competitionSlug: null,
          year: award.year,
          // ไฟล์ยังไม่ถูกอัปโหลด บันทึกชื่อไฟล์ไว้ให้คนตรวจรู้ว่าต้องขออะไรเพิ่ม
          evidence: award.url || (award.file ? evidenceValues.file(award.file.name) : evidenceValues.none),
        })),
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
              {awards.map((award, index) => <div className="award" key={award.id}>
                <div className="award-header"><h4>{s.awardHeading(index + 1)}</h4><button className="plain" type="button" aria-label={s.removeAwardAria(index + 1)} onClick={() => { reviewAgain(); setAwards(awards.filter((item) => item.id !== award.id)); }}>{s.removeAward}</button></div>
                <label>{s.awardTitle}<input required maxLength={120} value={award.title} onChange={(event) => updateAward(award.id, { title: event.target.value })} /></label>
                <div className="grid"><label>{s.awardPrize}<input required maxLength={100} value={award.prize} onChange={(event) => updateAward(award.id, { prize: event.target.value })} placeholder={s.awardPrizePlaceholder} /></label><label>{s.awardYear}<input type="number" required min={2500} max={new Date().getFullYear() + 543} value={award.year} onChange={(event) => updateAward(award.id, { year: event.target.value })} /></label></div>
                <label>{s.awardUrl}<input type="url" value={award.url} onChange={(event) => updateAward(award.id, { url: event.target.value })} placeholder="https://..." /></label>
                <label>{s.awardFile}<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => updateAward(award.id, { file: event.target.files?.[0] })} /><small>{s.awardFileHint}</small></label>
              </div>)}
              {awards.length < 2 && <button type="button" onClick={() => { reviewAgain(); setAwards([...awards, { id: ++nextAward.current, title: '', prize: '', year: '', url: '' }]); }}>{s.addAward}</button>}
              <div className="note">{s.noAwardsNote}</div>
            </>, s.awardsHint, <span className="count">{s.awardsCount(awards.length)}</span>)}
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
            {group(s.competitionsGroup, <>
              {openList.loading && !openList.data && <p className="muted" role="status">{s.competitionsLoading}</p>}
              {openList.error && !openList.data && <p className="note" role="status">{s.competitionsError}</p>}
              {openList.data && openList.data.items.length === 0 && <p className="muted">{s.competitionsEmpty}</p>}
              {openList.data && openList.data.items.length > 0 && <CompetitionOffers items={openList.data.items} invalid={badOffers}
                offers={offers} onChange={(next) => { reviewAgain(); setOffers(next); setBadOffers((bad) => bad.filter((slug) => next[slug])); }} />}
            </>, s.competitionsHint, <span className="count" aria-live="polite">{s.competitionsCount(Object.keys(offers).length)}</span>)}
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
              {awards.map((award) => <div className="review" key={award.id}><strong>{award.title}</strong><p>{award.prize} · {award.year}</p><small>{s.reviewAwaiting(award.file?.name || award.url)}</small></div>)}
              {values.portfolio && <div className="review"><small>{s.reviewPortfolio}</small>{values.portfolio}</div>}
              {!awards.length && <div className="review"><small>{s.reviewAwardsLabel}</small>{s.reviewNoAwards}</div>}
            </>)}
            {reviewGroup(s.strengthsGroup, 2, <>
              <div className="review"><small>{s.reviewStrengths}</small>{selectedTopics.map((topic) => t.taxonomy.topics[topic]).join(' · ')}</div>
              <div className="review"><small>{s.reviewContacts}</small>{[values.contactEmail, values.contactLine, values.contactPhone, values.contactInstagram, values.contactLink].filter((value) => value.trim()).join(' · ')}</div>
              <div className="review"><small>{s.reviewCompetitions}</small>{Object.keys(offers).length
                ? <ul className="review-offers">{Object.entries(offers).map(([slug, offer]) => <li key={slug}>
                  <span>{openList.data?.items.find((item) => item.slug === slug)?.name ?? slug}</span>
                  <strong>{offer.skip ? s.reviewPriceLater : t.price.line(Number(offer.price), Number(offer.minutes))}</strong>
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
