import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ClipboardCheck, Eye, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  categoryIds, levelLabels, regionLabels, rewardLabels, typeLabels,
} from '../data/competitions';
import type { CategoryId, Level, OpportunityType, Region, Reward } from '../data/competitions';
import { kindKeys, themeKeys } from '../data/focus';
import type { Kind, Theme } from '../data/focus';
import { useAuth } from '../data/auth';
import { ApiError, post } from '../lib/api';
import { CoverArt } from '../components/CoverArt';
import { useI18n } from '../i18n';
import { formatInputDate, formatNumber } from '../i18n/format';
import '../form.css';

type Field =
  | 'organizerName' | 'contactName' | 'contactRole' | 'contactEmail' | 'contactPhone' | 'organizerUrl'
  | 'name' | 'description' | 'teamMin' | 'teamMax'
  | 'opensAt' | 'closesAt' | 'eventDate' | 'venue' | 'prizeValue' | 'prizeNote' | 'fee'
  | 'sourceUrl' | 'registerUrl';

const empty: Record<Field, string> = {
  organizerName: '', contactName: '', contactRole: '', contactEmail: '', contactPhone: '', organizerUrl: '',
  name: '', description: '', teamMin: '1', teamMax: '4',
  opensAt: '', closesAt: '', eventDate: '', venue: '', prizeValue: '', prizeNote: '', fee: '',
  sourceUrl: '', registerUrl: '',
};

type ConsentKey = 'authority' | 'accuracy' | 'rights' | 'review' | 'free';
/** ทุกช่องเริ่มต้นไม่ถูกเลือก และบังคับติ๊กครบก่อนส่ง */
const consentKeys: ConsentKey[] = ['authority', 'accuracy', 'rights', 'review', 'free'];
const noConsent: Record<ConsentKey, boolean> = {
  authority: false, accuracy: false, rights: false, review: false, free: false,
};

const typeIds = Object.keys(typeLabels) as OpportunityType[];
const levelIds = Object.keys(levelLabels) as Level[];
const regionIds = Object.keys(regionLabels) as Region[];
const rewardIds = Object.keys(rewardLabels) as Reward[];

const today = () => new Date().toISOString().slice(0, 10);

export function OrganiserSubmit() {
  const { t, lang } = useI18n();
  const s = t.organiserSubmit;
  const { user, loading: authLoading } = useAuth();
  const dateLabel = (value: string) => formatInputDate(value, lang);
  const [stage, setStage] = useState(0);
  const [values, setValues] = useState(empty);
  const [type, setType] = useState<OpportunityType>('contest');
  const [chosenCategories, setChosenCategories] = useState<CategoryId[]>([]);
  const [kind, setKind] = useState<Kind | ''>('');
  const [chosenThemes, setChosenThemes] = useState<Theme[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [region, setRegion] = useState<Region>('online');
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [poster, setPoster] = useState<File>();
  const [posterUrl, setPosterUrl] = useState('');
  const [consent, setConsent] = useState(noConsent);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [doneId, setDoneId] = useState('');

  const formRef = useRef<HTMLFormElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousStage = useRef(stage);
  const previousDone = useRef(doneId);

  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);

  useEffect(() => {
    if (!poster) { setPosterUrl(''); return; }
    const url = URL.createObjectURL(poster);
    setPosterUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [poster]);

  // ย้าย focus ไปหัวข้อของขั้นใหม่ เพื่อให้เครื่องอ่านหน้าจอรู้ว่าหน้าเปลี่ยนแล้ว
  useEffect(() => {
    if (stage === previousStage.current && doneId === previousDone.current) return;
    previousStage.current = stage;
    previousDone.current = doneId;
    const heading = sheetRef.current?.querySelector<HTMLElement>(
      doneId ? '.application-complete h2' : `fieldset[data-stage="${stage}"] h2`,
    );
    heading?.focus();
    sheetRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [stage, doneId]);

  /** แก้ข้อมูลหลังติ๊กยืนยันความถูกต้องแล้ว ให้ติ๊กนั้นหลุด เพื่อบังคับให้อ่านซ้ำ */
  const reviewAgain = () => setConsent((c) => (c.accuracy ? { ...c, accuracy: false } : c));
  const set = (field: Field, value: string) => {
    reviewAgain();
    setValues((current) => ({ ...current, [field]: value }));
  };
  const goTo = (target: number) => { setStage(target); setMessage(''); };

  function toggle<T>(list: T[], value: T, setter: (next: T[]) => void, max?: number) {
    reviewAgain();
    if (list.includes(value)) setter(list.filter((item) => item !== value));
    else if (!max || list.length < max) setter([...list, value]);
    else setMessage(s.errors.maxCategories(max));
  }

  function validate() {
    let error = '';
    let missingConsent: ConsentKey | undefined;
    const need = (field: keyof typeof s.needs) => { if (!error && !values[field].trim()) error = s.need(s.needs[field]); };

    if (stage === 0) {
      need('organizerName');
      need('contactName');
      need('contactRole');
      need('contactEmail');
      need('contactPhone');
      need('organizerUrl');
    }
    if (stage === 1) {
      need('name');
      need('description');
      if (!error && !kind) error = s.errors.chooseKind;
      if (!error && !chosenThemes.length) error = s.errors.chooseThemes;
      if (!error && !chosenCategories.length) error = s.errors.chooseCategories;
      if (!error && !levels.length) error = s.errors.chooseLevels;
      const min = Number(values.teamMin);
      const max = Number(values.teamMax);
      if (!error && (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min)) {
        error = s.errors.teamSize;
      }
    }
    if (stage === 2) {
      need('closesAt');
      if (!error && values.closesAt <= today()) error = s.errors.closeFuture;
      if (!error && values.opensAt && values.opensAt > values.closesAt) error = s.errors.opensBefore;
      need('sourceUrl');
      if (!error && region !== 'online' && !values.venue.trim()) error = s.need(s.needs.venue);
      if (!error && Number(values.prizeValue || 0) === 0 && !values.prizeNote.trim()) {
        error = s.errors.prizeNote;
      }
    }
    if (stage === 3) {
      missingConsent = consentKeys.find((key) => !consent[key]);
      if (missingConsent) error = s.errors.consentMissing;
    }

    setMessage(error);
    if (missingConsent) document.getElementById(`consent-${missingConsent}`)?.focus();
    else if (error) formRef.current?.querySelector<HTMLElement>(`fieldset[data-stage="${stage}"] :invalid`)?.focus();
    return !error;
  }

  async function submit() {
    setSending(true);
    setMessage('');
    try {
      const fileIds: string[] = [];
      if (poster) {
        const body = new FormData();
        body.append('file', poster);
        const uploaded = await fetch('/api/files', { method: 'POST', body, credentials: 'same-origin' });
        if (!uploaded.ok) {
          const failure = await uploaded.json().catch(() => ({})) as { error?: string };
          throw new ApiError(uploaded.status, failure.error ?? s.errors.posterUpload);
        }
        fileIds.push(((await uploaded.json()) as { file: { id: string } }).file.id);
      }

      const { id } = await post<{ id: string }>('/submissions/competition', {
        organizerName: values.organizerName, contactName: values.contactName,
        contactRole: values.contactRole, contactEmail: values.contactEmail,
        contactPhone: values.contactPhone, organizerUrl: values.organizerUrl,
        name: values.name, description: values.description, type,
        kind: kind || undefined, themes: chosenThemes,
        categories: chosenCategories, levels, rewards,
        teamMin: Number(values.teamMin), teamMax: Number(values.teamMax),
        opensAt: values.opensAt || undefined,
        closesAt: values.closesAt,
        eventDate: values.eventDate || undefined,
        region, venue: values.venue.trim() || undefined,
        prizeValue: Number(values.prizeValue || 0),
        prizeNote: values.prizeNote.trim() || undefined,
        fee: values.fee ? Number(values.fee) : undefined,
        sourceUrl: values.sourceUrl,
        registerUrl: values.registerUrl.trim() || undefined,
        fileIds,
      });
      setDoneId(id);
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
    if (!user) { setMessage(s.errors.needSignIn); return; }
    void submit();
  }

  const group = (title: string, children: ReactNode, hint?: string, aside?: ReactNode) => (
    <section className="group">
      <div className="group-head"><h3>{title}</h3>{aside}</div>
      {hint && <p className="muted group-hint">{hint}</p>}
      {children}
    </section>
  );

  const reviewGroup = (title: string, target: number, children: ReactNode) => (
    <section className="group review-group">
      <div className="group-head">
        <h3>{title}</h3>
        <button className="plain" type="button" aria-label={s.editAria(title)} onClick={() => goTo(target)}>{s.edit}</button>
      </div>
      {children}
    </section>
  );

  const row = (label: string, value: ReactNode) => (
    <div className="review"><small>{label}</small>{value || '—'}</div>
  );

  const prizeText = Number(values.prizeValue || 0) > 0
    ? t.competition.prizeTotal(formatNumber(Number(values.prizeValue), lang))
    : values.prizeNote || t.competition.noPrize;
  const teamText = values.teamMin === values.teamMax
    ? (values.teamMin === '1' ? t.competition.teamSolo : t.competition.teamExact(values.teamMin))
    : t.competition.teamRange(values.teamMin, values.teamMax);

  return <main id="main" tabIndex={-1}><div id="cw-submit" className="cw-form">
    <section className="hero">
      <div className="application-hero-inner">
        <Link className="application-back" to="/organizers"><ArrowLeft aria-hidden="true" />{s.backToOrganisers}</Link>
        <p><span className="tag">{s.tag}</span></p>
        <h1>{s.title}</h1>
        <p className="muted">{s.lead}</p>
      </div>
    </section>

    <div className="layout">
      <aside aria-label={s.stepsLabel}>
        <ol className="steps">
          {s.steps.map((step, index) => (
            <li key={step} className={`step ${index === stage ? 'current' : index < stage ? 'done' : ''}`}
              aria-current={index === stage ? 'step' : undefined}>
              <b>{index + 1}</b>{step}
            </li>
          ))}
        </ol>
        <div className="aside-note">
          <ShieldCheck aria-hidden="true" />
          <h3>{s.asideReviewTitle}</h3>
          <p className="muted">{s.asideReviewText}</p>
        </div>
        <div className="aside-note">
          <Eye aria-hidden="true" />
          <h3>{s.asideContactTitle}</h3>
          <p className="muted">{s.asideContactText}</p>
        </div>
      </aside>

      <div className="sheet" ref={sheetRef}>
        {!doneId && <form ref={formRef} onSubmit={next} noValidate>
          <fieldset data-stage="0" hidden={stage !== 0} disabled={stage !== 0}>
            <div className="intro"><h2 tabIndex={-1}>{s.stage0Title}</h2>
              <p className="muted">{s.stage0Lead}</p></div>
            {group(s.orgGroup, <>
              <label>{s.organizerName}
                <input required value={values.organizerName} onChange={(e) => set('organizerName', e.target.value)} maxLength={200} />
                <small>{s.organizerNameHint}</small>
              </label>
              <div className="grid">
                <label>{s.contactName}
                  <input required value={values.contactName} onChange={(e) => set('contactName', e.target.value)} maxLength={120} />
                </label>
                <label>{s.contactRole}
                  <input required value={values.contactRole} onChange={(e) => set('contactRole', e.target.value)} maxLength={120} />
                </label>
              </div>
              <div className="grid">
                <label>{s.contactEmail}
                  <input id="submit-email" type="email" required value={values.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
                  <small>{s.contactEmailHint}</small>
                </label>
                <label>{s.contactPhone}
                  <input required value={values.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} maxLength={40} />
                  <small>{s.contactPhoneHint}</small>
                </label>
              </div>
              <label>{s.organizerUrl}
                <input type="url" required placeholder="https://" value={values.organizerUrl} onChange={(e) => set('organizerUrl', e.target.value)} />
              </label>
            </>, s.orgHint)}
          </fieldset>

          <fieldset data-stage="1" hidden={stage !== 1} disabled={stage !== 1}>
            <div className="intro"><h2 tabIndex={-1}>{s.stage1Title}</h2>
              <p className="muted">{s.stage1Lead}</p></div>
            {group(s.nameGroup, <>
              <label>{s.name}
                <input required value={values.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />
              </label>
              <label>{s.description}
                <textarea required value={values.description} onChange={(e) => set('description', e.target.value)} maxLength={400} rows={3} />
                <small>{s.descriptionHint}</small>
              </label>
            </>, undefined, <span className="count">{values.description.length} / 400</span>)}

            {group(s.kindGroup, <div className="topics">
              {kindKeys.map((id) => (
                <label className="check topic" key={id}>
                  <input type="radio" name="competition-kind" checked={kind === id}
                    onChange={() => { reviewAgain(); setKind(id); }} />
                  <span>{t.taxonomy.kinds[id]}</span>
                </label>
              ))}
            </div>, s.kindHint)}

            {group(s.themeGroup, <div className="topics">
              {themeKeys.map((id) => (
                <label className="check topic" key={id}>
                  <input type="checkbox" checked={chosenThemes.includes(id)}
                    onChange={() => toggle(chosenThemes, id, setChosenThemes)} />
                  <span>{t.taxonomy.themes[id]}</span>
                </label>
              ))}
            </div>, s.themeHint)}

            {group(s.typeGroup, <div className="topics">
              {typeIds.map((id) => (
                <label className="check topic" key={id}>
                  <input type="radio" name="opportunity-type" checked={type === id}
                    onChange={() => { reviewAgain(); setType(id); }} />
                  <span>{t.taxonomy.types[id]}</span>
                </label>
              ))}
            </div>)}

            {group(s.categoryGroup, <div className="topics">
              {categoryIds.map((id) => (
                <label className="check topic" key={id}>
                  <input type="checkbox" checked={chosenCategories.includes(id)}
                    onChange={() => toggle(chosenCategories, id, setChosenCategories, 3)} />
                  <span>{t.taxonomy.categories[id]}</span>
                </label>
              ))}
            </div>, s.categoryHint,
            <span className="count" aria-live="polite">{s.categoryCount(chosenCategories.length)}</span>)}

            {group(s.whoGroup, <>
              <div className="topics">
                {levelIds.map((id) => (
                  <label className="check topic" key={id}>
                    <input type="checkbox" checked={levels.includes(id)} onChange={() => toggle(levels, id, setLevels)} />
                    <span>{t.taxonomy.levels[id]}</span>
                  </label>
                ))}
              </div>
              <div className="grid">
                <label>{s.teamMin}
                  <input type="number" min={1} max={100} required value={values.teamMin} onChange={(e) => set('teamMin', e.target.value)} />
                </label>
                <label>{s.teamMax}
                  <input type="number" min={1} max={100} required value={values.teamMax} onChange={(e) => set('teamMax', e.target.value)} />
                </label>
              </div>
              <p className="muted application-small">{s.shownAs(teamText)}</p>
            </>)}
          </fieldset>

          <fieldset data-stage="2" hidden={stage !== 2} disabled={stage !== 2}>
            <div className="intro"><h2 tabIndex={-1}>{s.stage2Title}</h2>
              <p className="muted">{s.stage2Lead}</p></div>

            {group(s.datesGroup, <>
              <div className="grid">
                <label>{s.opensAt}
                  <input type="date" value={values.opensAt} onChange={(e) => set('opensAt', e.target.value)} />
                  <small>{s.opensAtHint}</small>
                </label>
                <label>{s.closesAt}
                  <input type="date" required min={today()} value={values.closesAt} onChange={(e) => set('closesAt', e.target.value)} />
                </label>
              </div>
              <label>{s.eventDate}
                <input type="date" value={values.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
              </label>
            </>)}

            {group(s.placeGroup, <>
              <label>{s.format}
                <select value={region} onChange={(e) => { reviewAgain(); setRegion(e.target.value as Region); }}>
                  {regionIds.map((id) => <option key={id} value={id}>{t.taxonomy.regions[id]}</option>)}
                </select>
              </label>
              {region !== 'online' && <label>{s.venue}
                <input required value={values.venue} onChange={(e) => set('venue', e.target.value)} maxLength={200} />
              </label>}
            </>)}

            {group(s.prizeGroup, <>
              <div className="price-row">
                <label>{s.prizeValue}
                  <input type="number" min={0} value={values.prizeValue} onChange={(e) => set('prizeValue', e.target.value)} />
                  <small>{s.prizeValueHint}</small>
                </label>
                <div className="price-preview">
                  <small>{s.previewLabel}</small>
                  <strong>{prizeText}</strong>
                </div>
              </div>
              <label>{s.prizeNote}
                <input value={values.prizeNote} onChange={(e) => set('prizeNote', e.target.value)} maxLength={200}
                  placeholder={s.prizeNotePlaceholder} />
                <small>{s.prizeNoteHint}</small>
              </label>
              <div className="topics">
                {rewardIds.map((id) => (
                  <label className="check topic" key={id}>
                    <input type="checkbox" checked={rewards.includes(id)} onChange={() => toggle(rewards, id, setRewards)} />
                    <span>{t.taxonomy.rewards[id]}</span>
                  </label>
                ))}
              </div>
              <label>{s.fee}
                <input type="number" min={0} value={values.fee} onChange={(e) => set('fee', e.target.value)} />
                <small>{s.feeHint}</small>
              </label>
            </>)}

            {group(s.linksGroup, <>
              <label>{s.sourceUrl}
                <input type="url" required placeholder="https://" value={values.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} />
                <small>{s.sourceUrlHint}</small>
              </label>
              <label>{s.registerUrl}
                <input type="url" placeholder="https://" value={values.registerUrl} onChange={(e) => set('registerUrl', e.target.value)} />
              </label>
              <label htmlFor="submit-poster">{s.poster}
                <input id="submit-poster" type="file" accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={(e) => { reviewAgain(); setPoster(e.target.files?.[0]); }} />
                <small>{s.posterHint}</small>
              </label>
              {posterUrl && poster?.type !== 'application/pdf' && (
                <img className="poster-preview" src={posterUrl} alt={s.posterAlt} />
              )}
              {poster?.type === 'application/pdf' && <p className="muted application-small">{s.posterAttached(poster.name)}</p>}
            </>)}
          </fieldset>

          <fieldset data-stage="3" hidden={stage !== 3} disabled={stage !== 3}>
            <div className="intro"><h2 tabIndex={-1}>{s.stage3Title}</h2>
              <p className="muted">{s.stage3Lead}</p></div>

            {group(s.cardGroup, <article className="competition-card preview-card">
              <div className="card-cover">
                <CoverArt category={chosenCategories[0] ?? 'business'} seed="organiser-preview" />
              </div>
              <div className="card-body">
                <div className="card-meta">
                  {chosenCategories[0] && <span className="category-pill">{t.taxonomy.categories[chosenCategories[0]]}</span>}
                  {chosenCategories.length > 1 && (
                    <span className="category-pill is-more"
                      aria-label={s.moreCategories(chosenCategories.length - 1, chosenCategories.slice(1).map((id) => t.taxonomy.categories[id]).join(' '))}>
                      +{chosenCategories.length - 1}
                    </span>
                  )}
                  <span className="card-org">{values.organizerName || s.orgPlaceholder}</span>
                </div>
                <h3>{values.name || s.namePlaceholder}</h3>
                <p className="card-summary">{values.description || s.descPlaceholder}</p>
                <div className="card-facts">
                  <span>{t.competition.closes(dateLabel(values.closesAt) || '—')}</span>
                  <span>{prizeText}</span>
                </div>
              </div>
            </article>)}

            {reviewGroup(s.reviewOrganizer, 0, <>
              {row(s.reviewOrganization, values.organizerName)}
              {row(s.reviewContact, `${values.contactName} · ${values.contactRole}`)}
              {row(s.reviewPrivate, `${values.contactEmail} · ${values.contactPhone}`)}
              {row(s.reviewWebsite, values.organizerUrl)}
            </>)}

            {reviewGroup(s.reviewDetails, 1, <>
              {row(s.reviewType, t.taxonomy.types[type])}
              {row(s.reviewKind, kind ? t.taxonomy.kinds[kind] : '')}
              {row(s.reviewThemes, chosenThemes.map((id) => t.taxonomy.themes[id]).join(' · '))}
              {row(s.reviewCategories, chosenCategories.map((id) => t.taxonomy.categories[id]).join(' · '))}
              {row(s.reviewLevels, levels.map((id) => t.taxonomy.levels[id]).join(' / '))}
              {row(s.reviewTeam, teamText)}
            </>)}

            {reviewGroup(s.reviewDates, 2, <>
              {row(s.reviewOpens, dateLabel(values.opensAt) || s.reviewOpenNow)}
              {row(s.reviewCloses, dateLabel(values.closesAt))}
              {row(s.reviewEvent, dateLabel(values.eventDate))}
              {row(s.reviewPlace, region === 'online' ? t.taxonomy.regions.online : `${values.venue} · ${t.taxonomy.regions[region]}`)}
              {row(s.reviewPrize, prizeText)}
              {row(s.reviewRewards, rewards.map((id) => t.taxonomy.rewards[id]).join(' · '))}
              {row(s.reviewFee, values.fee ? t.competition.baht(formatNumber(Number(values.fee), lang)) : t.competition.free)}
              {row(s.reviewSource, values.sourceUrl)}
              {row(s.reviewPoster, poster ? poster.name : s.reviewNoPoster)}
            </>)}

            {group(s.consentGroup, <div className="consent-list">
              {consentKeys.map((key) => (
                <label className={`check consent-check${key === 'free' ? ' consent-payment' : ''}`} key={key}>
                  <input id={`consent-${key}`} type="checkbox" checked={consent[key]}
                    onChange={() => setConsent((c) => ({ ...c, [key]: !c[key] }))} />
                  <span>{s.consent[key]}</span>
                </label>
              ))}
            </div>)}
          </fieldset>

          {!authLoading && !user && <p className="note" role="status">
            {s.signInBefore}<Link to="/signin?next=/organizers/submit">{s.signInLink}</Link>{s.signInAfter}
          </p>}
          <p className="application-message" role="alert">{message}</p>
          <div className="actions">
            {stage > 0 && <button type="button" onClick={() => goTo(stage - 1)}>{s.back}</button>}
            <span className="muted">{s.stepOf(stage + 1)}</span>
            <button className="primary" type="submit" disabled={sending}>
              {stage === 3 ? (sending ? s.submitting : s.submit) : s.next}
              {stage < 3 && <ArrowRight aria-hidden="true" />}
            </button>
          </div>
        </form>}

        {doneId && <div className="application-complete">
          <ClipboardCheck className="finish-icon" aria-hidden="true" />
          <h2 tabIndex={-1}>{s.doneTitle}</h2>
          <p>{s.doneText(doneId)}</p>
          <div className="note">{s.doneNote}</div>
          <p className="muted">{s.doneStatuses}</p>
          <Link className="application-return" to="/">{s.doneHome}</Link>
        </div>}
      </div>
    </div>
  </div></main>;
}
