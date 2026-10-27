import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  AlarmClock, AppWindow, ArrowLeft, ArrowRight, BarChart3, Brain, Briefcase, Check, ChevronDown, Clock, Clock3, Cpu, Folder, MoreHorizontal, PenTool, Pencil, Plus, Search, ShieldCheck, Sparkles, Trophy, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ApiError, api, post } from '../lib/api';
import { useAuth } from '../data/auth';
import { useI18n } from '../i18n';
import { formatDate } from '../i18n/format';
import {
  caseFirstAreas, competitionKinds, countries, helpAreas, interestFields, languages, learnerLevels, projectStages, projectStarts, requestFormats,
  requestGenders, requestLanguages, requestStyles, skillGroups, urgencies,
} from '../data/matching';
import type {
  CompetitionKind, HelpArea, InterestField, Language, LearnerLevel, MatchAnswers, ProjectStage, ProjectStart, RequestFormat, RequestGender,
  RequestLanguage, RequestStyle, SkillTag, Urgency,
} from '../data/matching';
import { suggestTags } from '../data/note-keywords';
import iconIdea from '../assets/icons/idea.webp';
import iconLightning from '../assets/icons/lightning.webp';
import iconMedal from '../assets/icons/medal.webp';
import iconMix from '../assets/icons/mix.webp';
import iconRocket from '../assets/icons/rocket.webp';
import iconSearch from '../assets/icons/search.webp';
import iconSeeding from '../assets/icons/seeding.webp';
import iconSparkle from '../assets/icons/sparkle.webp';
import iconSteps from '../assets/icons/steps.webp';
import iconTrophy from '../assets/icons/trophy.webp';
import iconUp from '../assets/icons/up.webp';
import { MatchHeading, MatchShell, PaperPlane } from '../components/MatchShell';
import type { ProgressPart } from '../components/MatchShell';

/* หา Mentor ให้ฉัน (Claude Design "Find My Mentor", spec 2026-10-13 ข้อ 6)
   ครั้งแรก 9 หน้า: เกี่ยวกับคุณ (1–2) → โปรเจกต์ (3–5) → สิ่งที่ต้องการ (6–8) → ตรวจคำตอบ (9)
   มีโปรไฟล์แล้วเริ่มที่เลือกโปรเจกต์ (0) เลือกโปรเจกต์เดิมแล้วข้ามไปหน้า 6
   บันทึกโปรไฟล์ตอนออกจากหน้า 2 บันทึกโปรเจกต์ตอนออกจากหน้า 5 หน้า 9 ส่งคำขอแล้วไปหน้าผลจับคู่ */

type Screen = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
const PART: Record<Screen, number> = { 0: 1, 1: 0, 2: 0, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2, 9: 2 };

type ProjectItem = {
  id: string; name: string; start: ProjectStart; competitionKind: CompetitionKind | null; competitionName: string | null;
  stage: ProjectStage; updatedAt: string; lastRequestId: string | null;
};
type ProjectsPayload = { items: ProjectItem[]; projectLimitReached: boolean; requestLimitReached: boolean; hasProfile: boolean };
type ProfilePayload = {
  profile: null | { level: LearnerLevel; interestsFields: InterestField[]; skills: SkillTag[]; languages: Language[]; country: string; interests: string };
  user: { name: string };
};
type Competition = { name: string; slug: string | null; picked: boolean };
type Draft = {
  level: LearnerLevel | null; languages: Language[]; country: string; interestsFields: InterestField[]; skills: SkillTag[]; interests: string;
  project: string | null; start: ProjectStart | null; competitionKind: CompetitionKind | null; name: string; competition: Competition; stage: ProjectStage | null;
  helpAreas: HelpArea[]; skillLevel: LearnerLevel | null; style: RequestStyle | null; format: RequestFormat | null; urgency: Urgency | null;
  language: RequestLanguage | null; gender: RequestGender; note: string; noteTags: HelpArea[];
};
/** คำตอบที่หน้าผลส่งกลับมาเมื่อกด "แก้ไขคำตอบ" */
export type EditState = { projectId: string; answers: Partial<MatchAnswers> };

const empty: Draft = {
  level: null, languages: [], country: 'TH', interestsFields: [], skills: [], interests: '',
  project: null, start: null, competitionKind: null, name: '', competition: { name: '', slug: null, picked: false }, stage: null,
  helpAreas: [], skillLevel: null, style: null, format: null, urgency: null, language: null, gender: 'any', note: '', noteTags: [],
};

/* ไอคอนวาดมือ (ชุด New ICON ของเจ้าของ 27 ต.ค. 2569) ใช้กับทุกหน้าคำถาม ยกเว้นหน้าความสนใจ (2) และช่วงเวลา (8)
   ที่ยังใช้ไอคอนเส้น พื้นขาว เงาม่วง ไอคอนม่วงเหมือนกันทุกช่อง */
type Icon = LucideIcon | string;
const levelIcon: Record<LearnerLevel, Icon> = { beginner: iconSeeding, intermediate: iconUp, advanced: iconMedal };
const fieldIcon: Record<InterestField, Icon> = {
  ai: Brain, web: AppWindow, hardware: Cpu, design: PenTool, data: BarChart3, security: ShieldCheck, business: Briefcase, other: MoreHorizontal,
};
const startIcon: Record<ProjectStart, Icon> = { has_competition: iconTrophy, has_idea: iconRocket, build_skills: iconIdea };
const styleIcon: Record<RequestStyle, Icon> = {
  step_by_step: iconSteps, guided_questions: iconIdea, review: iconSearch, direct_feedback: iconLightning, mixed: iconMix,
};
const urgencyIcon: Record<Urgency, Icon> = { '48h': AlarmClock, week: Clock, flexible: Clock3 };

function IconTile({ icon, size, small }: { icon: Icon; size: number; small?: boolean }) {
  const Glyph = icon;
  return <span className={`mf-icon${small ? ' is-small' : ''}${typeof icon === 'string' ? ' is-art' : ''}`} aria-hidden="true">
    {typeof Glyph === 'string' ? <img src={Glyph} alt="" /> : <Glyph size={size} strokeWidth={2.2} />}
  </span>;
}

const MIN_MATCHING_MS = 1600;

/** จอแคบ (≤ 700px) กลุ่มทักษะพับได้ จอกว้างเปิดทุกกลุ่ม */
function useNarrow() {
  const query = '(max-width: 700px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setNarrow(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, []);
  return narrow;
}

function Field({ label, optional, hint, error, children, half, center, id }: {
  label?: string; optional?: boolean; hint?: string; error?: string; children: ReactNode; half?: boolean; center?: boolean; id?: string;
}) {
  const { t } = useI18n();
  return <div className={`mf-field${half ? ' is-half' : ''}${center ? ' is-center' : ''}`}>
    {label && <p className="mf-label" id={id}>{label}{optional && <span className="mf-optional">{t.match.optional}</span>}</p>}
    {children}
    {hint && <p className="mf-hint">{hint}</p>}
    {error && <p className="mf-error" role="alert">{error}</p>}
  </div>;
}

function OptionCard({ icon, title, sub, on, multi, onPick, disabled, compact }: {
  icon: Icon; title: string; sub?: string; on: boolean; multi?: boolean; onPick: () => void; disabled?: boolean; compact?: boolean;
}) {
  return <button type="button" role={multi ? 'checkbox' : 'radio'} aria-checked={on} disabled={disabled}
    className={`mf-card${on ? ' is-on' : ''}${compact ? ' is-tile' : ''}`} onClick={onPick}>
    <IconTile icon={icon} size={compact ? 20 : 22} />
    <span className="mf-card__text"><span className="mf-card__title">{title}</span>{sub && <span className="mf-card__sub">{sub}</span>}</span>
    <span className={multi ? 'mf-check' : 'mf-radio'} aria-hidden="true">{multi && on && <Check size={13} strokeWidth={3} />}</span>
  </button>;
}

function Chip({ label, on, onPick, compact }: { label: string; on: boolean; onPick: () => void; compact?: boolean }) {
  return <button type="button" aria-pressed={on} className={`mf-chip${on ? ' is-on' : ''}${compact ? ' is-compact' : ''}`} onClick={onPick}>
    {on && <Check size={13} strokeWidth={3} aria-hidden="true" />}{label}
  </button>;
}

function Segmented<T extends string>({ options, value, onPick, label, light, big }: {
  options: readonly T[]; value: T | null; onPick: (value: T) => void; label: (value: T) => string; light?: boolean; big?: boolean;
}) {
  return <div className={`mf-seg${light ? ' is-light' : ''}${big ? ' is-big' : ''}`}>
    {options.map((option) => <button key={option} type="button" role="radio" aria-checked={value === option}
      className={value === option ? 'is-on' : ''} onClick={() => onPick(option)}>{label(option)}</button>)}
  </div>;
}

const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

function CompetitionInput({ value, onChange, invalid, labelId }: { value: Competition; onChange: (value: Competition) => void; invalid: boolean; labelId: string }) {
  const { t } = useI18n();
  const s = t.match;
  const [focus, setFocus] = useState(false);
  const [items, setItems] = useState<{ name: string; slug: string | null }[]>([]);
  const listId = useId();
  const query = value.name.trim();
  useEffect(() => {
    if (value.picked || query.length < 2) { setItems([]); return; }
    let alive = true;
    const timer = setTimeout(() => {
      api<{ items: { name: string; slug: string | null }[] }>(`/hackathon-names?q=${encodeURIComponent(query)}`)
        .then((result) => { if (alive) setItems(result.items); })
        .catch(() => { if (alive) setItems([]); });
    }, 180);
    return () => { alive = false; clearTimeout(timer); };
  }, [query, value.picked]);

  if (value.picked) return <div className="mf-picked">
    <Trophy size={16} aria-hidden="true" /><span>{value.name}</span>
    <button type="button" aria-label={s.clearCompetition} onClick={() => onChange({ name: '', slug: null, picked: false })}><X size={16} aria-hidden="true" /></button>
  </div>;
  const open = focus && query.length >= 2;
  const exact = items.some((item) => item.name.trim().toLowerCase() === query.toLowerCase());
  return <div className="mf-auto">
    <div className={`mf-input has-icon${invalid ? ' is-invalid' : ''}`}>
      <Search size={17} aria-hidden="true" />
      <input type="text" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list" aria-labelledby={labelId} aria-invalid={invalid}
        value={value.name} maxLength={200} placeholder={s.competitionPlaceholder} autoComplete="off"
        onChange={(event) => onChange({ name: event.target.value, slug: null, picked: false })}
        onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} />
    </div>
    {open && <ul className="mf-suggest" id={listId} role="listbox">
      {items.map((item) => <li key={`${item.slug ?? ''}:${item.name}`} role="option" aria-selected={false}
        onMouseDown={(event) => { event.preventDefault(); onChange({ name: item.name, slug: item.slug, picked: true }); setFocus(false); }}>
        <Trophy size={15} aria-hidden="true" />{item.name}</li>)}
      {items.length === 0 && <li className="mf-suggest__empty" role="option" aria-selected={false} aria-disabled="true">{s.noMatch}</li>}
    </ul>}
    {!open && query && !exact && <p className="mf-hint">{s.freeHint}</p>}
  </div>;
}

export function Match() {
  const { t, lang } = useI18n();
  const s = t.match;
  const v = t.mentorProfileV2;
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const editState = (location.state as EditState | null) ?? null;

  const [profileData, setProfileData] = useState<ProfilePayload | null>(null);
  const [projectsData, setProjectsData] = useState<ProjectsPayload | null>(null);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState<Draft>(empty);
  const [firstTime, setFirstTime] = useState(false);
  const [pos, setPos] = useState(0);
  const [showErr, setShowErr] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [phase, setPhase] = useState<'flow' | 'matching' | 'error'>('flow');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [requestLimit, setRequestLimit] = useState(false);
  const tagsFor = useRef('');
  const headingRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  const narrow = useNarrow();

  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.all([api<ProfilePayload>('/learner/profile'), api<ProjectsPayload>('/projects')])
      .then(([profile, projects]) => {
        if (!alive) return;
        setProfileData(profile);
        setProjectsData(projects);
        setRequestLimit(projects.requestLimitReached);
        setFirstTime(!profile.profile);
        const p = profile.profile;
        const base: Draft = p ? { ...empty, level: p.level, languages: p.languages, country: p.country, interestsFields: p.interestsFields, skills: p.skills, interests: p.interests } : empty;
        // กลับมาจากหน้าผลเพื่อแก้คำตอบ: เลือกโปรเจกต์เดิมและคำตอบเดิมไว้ แล้วเปิดหน้าตรวจคำตอบ
        if (editState && projects.items.some((item) => item.id === editState.projectId)) {
          const a = editState.answers;
          setDraft({
            ...base, project: editState.projectId, helpAreas: a.helpAreas ?? [], skillLevel: a.skillLevel ?? p?.level ?? null, style: a.style ?? null,
            format: a.format ?? null, urgency: a.urgency ?? null, language: a.language ?? null, gender: a.gender ?? 'any', note: a.note ?? '', noteTags: a.noteTags ?? [],
          });
          tagsFor.current = a.note ?? '';
          setPos(4);
        } else setDraft(base);
      })
      .catch((error: unknown) => { if (alive) setLoadError(error instanceof ApiError ? error.message : t.errors.unreachable); });
    return () => { alive = false; };
    // โหลดครั้งเดียวต่อบัญชี
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const projectsList = projectsData?.items ?? [];
  const existing = draft.project && draft.project !== 'new' && !draft.project.startsWith('created:') ? projectsList.find((item) => item.id === draft.project) ?? null : null;
  const steps: Screen[] = useMemo(() => {
    if (firstTime) return [1, 2, 3, 4, 5, 6, 7, 8, 9];
    if (!projectsList.length) return [3, 4, 5, 6, 7, 8, 9];
    return existing ? [0, 6, 7, 8, 9] : [0, 3, 4, 5, 6, 7, 8, 9];
  }, [firstTime, projectsList.length, existing]);
  const at = Math.min(pos, steps.length - 1);
  const sc = steps[at];
  const isComp = draft.start === 'has_competition';
  const kind = existing ? existing.competitionKind : isComp ? draft.competitionKind : null;

  // ย้ายโฟกัสไปหัวเรื่องเมื่อเปลี่ยนหน้า โปรแกรมอ่านหน้าจอจะได้อ่านคำถามใหม่
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    window.scrollTo({ top: 0 });
    headingRef.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [sc]);

  // หน้า 6 เติมระดับจากโปรไฟล์ หน้า 9 แนะนำแท็กจากหมายเหตุ (คำนวณใหม่เมื่อหมายเหตุเปลี่ยน)
  useEffect(() => {
    if (sc === 6 && !draft.skillLevel && draft.level) setDraft((d) => ({ ...d, skillLevel: d.level }));
    if (sc === 9 && tagsFor.current !== draft.note) {
      tagsFor.current = draft.note;
      setDraft((d) => ({ ...d, noteTags: suggestTags(d.note).filter((tag) => !d.helpAreas.includes(tag)) }));
    }
  }, [sc, draft.level, draft.skillLevel, draft.note]);

  if (authLoading) return <MatchShell deco={false}><main id="main" className="mf-main"><p className="mf-status" role="status">{s.loading}</p></main></MatchShell>;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent('/match')}`} replace />;
  if (loadError) return <MatchShell deco={false}><main id="main" className="mf-main"><p className="mf-error" role="alert">{loadError}</p></main></MatchShell>;
  if (!profileData || !projectsData) return <MatchShell deco={false}><main id="main" className="mf-main"><p className="mf-status" role="status">{s.loading}</p></main></MatchShell>;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  function missing(screen: Screen) {
    const m: Record<string, 'one' | 'many' | 'text'> = {};
    const d = draft;
    if (screen === 0 && !d.project) m.project = 'one';
    if (screen === 1) { if (!d.level) m.level = 'one'; if (!d.languages.length) m.languages = 'many'; if (!d.country) m.country = 'one'; }
    if (screen === 2 && !d.interestsFields.length) m.interestsFields = 'many';
    if (screen === 3) { if (!d.start) m.start = 'one'; else if (d.start === 'has_competition' && !d.competitionKind) m.competitionKind = 'one'; }
    if (screen === 4) { if (!d.name.trim()) m.name = 'text'; if (d.start === 'has_competition' && !d.competition.name.trim()) m.competition = 'text'; }
    if (screen === 5 && !d.stage) m.stage = 'one';
    if (screen === 6) { if (!d.helpAreas.length) m.helpAreas = 'many'; if (!d.skillLevel) m.skillLevel = 'one'; }
    if (screen === 7) { if (!d.style) m.style = 'one'; if (!d.format) m.format = 'one'; }
    if (screen === 8) { if (!d.urgency) m.urgency = 'one'; if (!d.language) m.language = 'one'; }
    return m;
  }
  const miss = showErr ? missing(sc) : {};
  const err = (key: string) => (miss[key] ? s.errors[miss[key]] : '');
  const complete = Object.keys(missing(sc)).length === 0;

  const go = (next: number) => { setShowErr(false); setMessage(''); setAddOpen(false); setPos(Math.max(0, Math.min(steps.length - 1, next))); };
  const goTo = (screen: Screen) => { const i = steps.indexOf(screen); if (i >= 0) go(i); };

  async function saveProfile() {
    await api('/learner/profile', { method: 'PUT', body: JSON.stringify({
      level: draft.level, interestsFields: draft.interestsFields, skills: draft.skills, languages: draft.languages, country: draft.country, interests: draft.interests.trim(),
    }) });
  }
  async function saveProject() {
    const body = {
      name: draft.name.trim(), start: draft.start, competitionKind: isComp ? draft.competitionKind : null,
      competitionSlug: isComp && draft.competition.picked ? draft.competition.slug : null,
      competitionName: isComp ? draft.competition.name.trim() : '', stage: draft.stage,
    };
    const created = draft.project?.startsWith('created:') ? draft.project.slice(8) : null;
    if (created) { await api(`/projects/${created}`, { method: 'PUT', body: JSON.stringify(body) }); return; }
    const result = await post<{ project: { id: string } }>('/projects', body);
    set('project', `created:${result.project.id}`);
  }
  const projectId = () => (existing ? existing.id : draft.project?.startsWith('created:') ? draft.project.slice(8) : null);

  async function findMentors() {
    const id = projectId();
    if (!id) return;
    setPhase('matching');
    const started = Date.now();
    try {
      const answers: MatchAnswers = {
        helpAreas: draft.helpAreas, skillLevel: draft.skillLevel!, style: draft.style!, format: draft.format!, urgency: draft.urgency!,
        language: draft.language!, gender: draft.gender, note: draft.note.trim(), noteTags: draft.noteTags.filter((tag) => !draft.helpAreas.includes(tag)),
      };
      const result = await post<{ requestId: string }>(`/projects/${id}/match`, answers);
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, MIN_MATCHING_MS - (Date.now() - started))));
      navigate(`/matches/${result.requestId}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 429) { setRequestLimit(true); setPhase('flow'); return; }
      setPhase('error');
    }
  }

  async function next() {
    if (saving) return;
    if (!complete) { setShowErr(true); return; }
    if (sc === 9) { if (!requestLimit) void findMentors(); return; }
    setSaving(true);
    setMessage('');
    try {
      if (sc === 2) await saveProfile();
      if (sc === 5) await saveProject();
      go(at + 1);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : t.errors.unreachable);
    } finally {
      setSaving(false);
    }
  }
  function back() {
    if (at === 0) { navigate('/'); return; }
    go(at - 1);
  }

  const parts: ProgressPart[] = [0, 1, 2].map((part) => {
    const idx = steps.map((screen, i) => [screen, i] as const).filter(([screen]) => PART[screen] === part);
    return { label: s.parts[part], total: idx.length, done: idx.filter(([, i]) => i <= at).length, current: PART[sc] === part };
  }).filter((part) => part.total > 0);

  const one = <K extends keyof Draft>(key: K, value: Draft[K]) => () => set(key, value);
  const labelId = (key: string) => `mf-${key}-label`;
  const firstName = profileData.user.name.trim();
  const levelLabel = (level: LearnerLevel) => s.levels[level][0];
  const helpOrder = kind === 'case' ? [...caseFirstAreas, ...helpAreas.filter((area) => !caseFirstAreas.includes(area))] : [...helpAreas];

  let body: ReactNode = null;
  if (sc === 0) {
    const limit = projectsData.projectLimitReached;
    body = <Field error={err('project')}>
      <div className="mf-grid is-2" role="radiogroup" aria-label={s.h[0].join(' ')}>
        <button type="button" role="radio" aria-checked={draft.project === 'new'} disabled={limit}
          className={`mf-card is-new${draft.project === 'new' ? ' is-on' : ''}`} onClick={() => set('project', 'new')}>
          <IconTile icon={Plus} size={22} />
          <span className="mf-card__text"><span className="mf-card__title">{s.newProject}</span><span className="mf-card__sub">{limit ? s.projectLimit : s.newProjectSub}</span></span>
          <span className="mf-radio" aria-hidden="true" />
        </button>
        {projectsList.map((item) => <button key={item.id} type="button" role="radio" aria-checked={draft.project === item.id}
          className={`mf-card${draft.project === item.id ? ' is-on' : ''}`} onClick={() => set('project', item.id)}>
          <IconTile icon={Folder} size={22} />
          <span className="mf-card__text">
            <span className="mf-card__title">{item.name}</span>
            <span className="mf-card__sub">{item.competitionName ?? s.noCompetition}</span>
            <span className="mf-card__meta"><span className="mf-pill">{s.stages[item.stage]}</span>{s.updated(formatDate(item.updatedAt, lang))}</span>
          </span>
          <span className="mf-radio" aria-hidden="true" />
        </button>)}
      </div>
    </Field>;
  } else if (sc === 1) {
    body = <>
      <Field label={s.level} id={labelId('level')} error={err('level')}>
        <div className="mf-grid is-3" role="radiogroup" aria-labelledby={labelId('level')}>
          {learnerLevels.map((level) => <OptionCard key={level} icon={levelIcon[level]} title={s.levels[level][0]} sub={s.levels[level][1]}
            on={draft.level === level} onPick={one('level', level)} />)}
        </div>
      </Field>
      <div className="mf-row">
        <Field label={s.languagesLabel} id={labelId('languages')} error={err('languages')} half>
          <div className="mf-chips" role="group" aria-labelledby={labelId('languages')}>
            {languages.map((code) => <Chip key={code} label={v.languageNames[code]} on={draft.languages.includes(code)} onPick={() => set('languages', toggle(draft.languages, code))} />)}
          </div>
        </Field>
        <Field label={s.country} id={labelId('country')} half>
          <div className="mf-select">
            <select aria-labelledby={labelId('country')} value={draft.country} onChange={(event) => set('country', event.target.value)}>
              {countries.map((code) => <option key={code} value={code}>{v.countries[code]}</option>)}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </div>
        </Field>
      </div>
    </>;
  } else if (sc === 2) {
    body = <>
      <Field label={s.fieldsLabel} id={labelId('fields')} hint={s.fieldsHint} error={err('interestsFields')}>
        <div className="mf-grid is-4" role="group" aria-labelledby={labelId('fields')}>
          {interestFields.map((field) => <OptionCard key={field} compact multi icon={fieldIcon[field]} title={s.fields[field]}
            on={draft.interestsFields.includes(field)} onPick={() => set('interestsFields', toggle(draft.interestsFields, field))} />)}
        </div>
      </Field>
      <Field label={s.skillsLabel} optional hint={s.skillsHint}>
        <div className="mf-groups">
          {(Object.keys(skillGroups) as (keyof typeof skillGroups)[]).map((group) => {
            const tags = skillGroups[group] as readonly SkillTag[];
            const count = tags.filter((tag) => draft.skills.includes(tag)).length;
            const open = !narrow || Boolean(openGroups[group]);
            const head = <><span>{s.skillGroups[group]}</span>{count > 0 && <span className="mf-count">{s.selectedCount(count)}</span>}</>;
            return <div key={group} className={`mf-group${open ? ' is-open' : ''}`}>
              {narrow
                ? <button type="button" className="mf-group__head" aria-expanded={open} onClick={() => setOpenGroups((g) => ({ ...g, [group]: !g[group] }))}>
                  {head}<ChevronDown size={16} aria-hidden="true" /></button>
                : <p className="mf-group__head">{head}</p>}
              {open && <div className="mf-chips is-compact">
                {tags.map((tag) => <Chip key={tag} compact label={v.skillNames[tag]} on={draft.skills.includes(tag)} onPick={() => set('skills', toggle(draft.skills, tag))} />)}
              </div>}
            </div>;
          })}
        </div>
      </Field>
      <Field label={s.interestsLabel} optional id={labelId('interests')}>
        <textarea className="mf-textarea" rows={3} maxLength={500} aria-labelledby={labelId('interests')} value={draft.interests}
          placeholder={s.interestsPlaceholder} onChange={(event) => set('interests', event.target.value)} />
      </Field>
    </>;
  } else if (sc === 3) {
    body = <>
      <Field error={err('start')}>
        <div className="mf-grid is-3" role="radiogroup" aria-label={s.h[3].join(' ')}>
          {projectStarts.map((start) => <OptionCard key={start} icon={startIcon[start]} title={s.starts[start][0]} sub={s.starts[start][1]}
            on={draft.start === start} onPick={() => setDraft((d) => ({ ...d, start, competitionKind: start === 'has_competition' ? d.competitionKind : null }))} />)}
        </div>
      </Field>
      <div className={`mf-reveal${isComp ? ' is-open' : ''}`} aria-hidden={!isComp}>
        <div>
          {isComp && <Field label={s.kindLabel} id={labelId('kind')} center error={err('competitionKind')}>
            <div role="radiogroup" aria-labelledby={labelId('kind')}>
              <Segmented big options={competitionKinds} value={draft.competitionKind} label={(k) => s.kinds[k]} onPick={(k) => set('competitionKind', k)} />
            </div>
          </Field>}
        </div>
      </div>
    </>;
  } else if (sc === 4) {
    body = <>
      <Field label={s.nameLabel} id={labelId('name')} error={err('name')}>
        <div className={`mf-input${miss.name ? ' is-invalid' : ''}`}>
          <input type="text" aria-labelledby={labelId('name')} aria-invalid={Boolean(miss.name)} maxLength={80} value={draft.name}
            placeholder={s.namePlaceholder} onChange={(event) => set('name', event.target.value.slice(0, 80))} />
          <span className="mf-counter" aria-hidden="true">{draft.name.length}/80</span>
        </div>
      </Field>
      {isComp && <Field label={s.competitionLabel} id={labelId('competition')} error={err('competition')}>
        <CompetitionInput value={draft.competition} invalid={Boolean(miss.competition)} labelId={labelId('competition')} onChange={(value) => set('competition', value)} />
      </Field>}
    </>;
  } else if (sc === 5) {
    const index = projectStages.findIndex((stage) => stage === draft.stage);
    body = <Field error={err('stage')}>
      <ol className="mf-stepper" role="radiogroup" aria-label={s.h[5].join(' ')}>
        {projectStages.map((stage, i) => <li key={stage}>
          <button type="button" role="radio" aria-checked={draft.stage === stage}
            className={`mf-stage${draft.stage === stage ? ' is-on' : ''}${index >= 0 && i < index ? ' is-passed' : ''}`} onClick={() => set('stage', stage)}>
            <span className="mf-stage__num" aria-hidden="true">{i + 1}</span>
            <span className="mf-card__title">{s.stages[stage]}</span>
            <span className="mf-radio" aria-hidden="true" />
          </button>
        </li>)}
      </ol>
    </Field>;
  } else if (sc === 6) {
    body = <>
      <Field label={s.helpLabel} id={labelId('help')} error={err('helpAreas')}>
        <div className="mf-chips" role="group" aria-labelledby={labelId('help')}>
          {helpOrder.map((area) => <Chip key={area} label={s.helpAreas[area]} on={draft.helpAreas.includes(area)} onPick={() => set('helpAreas', toggle(draft.helpAreas, area))} />)}
        </div>
      </Field>
      <Field label={s.skillLevelLabel} id={labelId('skillLevel')} hint={draft.level ? s.prefilled : undefined} error={err('skillLevel')}>
        <div role="radiogroup" aria-labelledby={labelId('skillLevel')}>
          <Segmented options={learnerLevels} value={draft.skillLevel} label={levelLabel} onPick={(level) => set('skillLevel', level)} />
        </div>
      </Field>
    </>;
  } else if (sc === 7) {
    body = <>
      <Field label={s.styleLabel} id={labelId('style')} error={err('style')}>
        <div className="mf-grid is-2" role="radiogroup" aria-labelledby={labelId('style')}>
          {requestStyles.map((style) => <OptionCard key={style} icon={styleIcon[style]} title={s.styles[style][0]} sub={s.styles[style][1]}
            on={draft.style === style} onPick={one('style', style)} />)}
        </div>
      </Field>
      <Field label={s.formatLabel} id={labelId('format')} error={err('format')}>
        <div role="radiogroup" aria-labelledby={labelId('format')}>
          <Segmented options={requestFormats} value={draft.format} label={(f) => s.formats[f]} onPick={(f) => set('format', f)} />
        </div>
      </Field>
    </>;
  } else if (sc === 8) {
    body = <>
      <Field label={s.urgencyLabel} id={labelId('urgency')} error={err('urgency')}>
        <div className="mf-grid is-3" role="radiogroup" aria-labelledby={labelId('urgency')}>
          {urgencies.map((u) => <OptionCard key={u} icon={urgencyIcon[u]} title={s.urgencies[u][0]} sub={s.urgencies[u][1]} on={draft.urgency === u} onPick={one('urgency', u)} />)}
        </div>
      </Field>
      <div className="mf-row">
        <Field label={s.mentorLanguage} id={labelId('language')} error={err('language')} half>
          <div role="radiogroup" aria-labelledby={labelId('language')}>
            <Segmented options={requestLanguages} value={draft.language} label={(l) => s.mentorLanguages[l]} onPick={(l) => set('language', l)} />
          </div>
        </Field>
        <Field label={s.mentorGender} id={labelId('gender')} half>
          <div role="radiogroup" aria-labelledby={labelId('gender')}>
            <Segmented light options={requestGenders} value={draft.gender} label={(g) => s.genders[g]} onPick={(g) => set('gender', g)} />
          </div>
        </Field>
      </div>
      <Field label={s.noteLabel} optional id={labelId('note')}>
        <textarea className="mf-textarea" rows={4} maxLength={1000} aria-labelledby={labelId('note')} value={draft.note}
          placeholder={s.notePlaceholder} onChange={(event) => set('note', event.target.value)} />
      </Field>
    </>;
  } else if (sc === 9) {
    const startLine = draft.start ? s.starts[draft.start][0] + (isComp && draft.competitionKind ? ` · ${s.kinds[draft.competitionKind]}` : '') : '—';
    const projectRows: [string, string][] = existing
      ? [[s.rows.project, existing.name], [s.rows.competition, existing.competitionName ?? s.noCompetition], [s.rows.stage, s.stages[existing.stage]]]
      : [[s.rows.start, startLine], [s.rows.project, draft.name.trim() || '—'], ...(isComp ? [[s.rows.competition, draft.competition.name.trim() || '—'] as [string, string]] : []),
        [s.rows.stage, draft.stage ? s.stages[draft.stage] : '—']];
    const needRows: [string, string][] = [
      [s.rows.help, draft.helpAreas.map((area) => s.helpAreas[area]).join(', ') || '—'],
      [s.rows.level, draft.skillLevel ? levelLabel(draft.skillLevel) : '—'],
      [s.rows.style, draft.style ? s.styles[draft.style][0] : '—'],
      [s.rows.format, draft.format ? s.formats[draft.format] : '—'],
      [s.rows.urgency, draft.urgency ? s.urgencies[draft.urgency][0] : '—'],
      [s.rows.language, draft.language ? s.mentorLanguages[draft.language] : '—'],
      [s.rows.gender, s.genders[draft.gender]],
      ...(draft.note.trim() ? [[s.rows.note, draft.note.trim()] as [string, string]] : []),
    ];
    const addable = helpAreas.filter((area) => !draft.helpAreas.includes(area) && !draft.noteTags.includes(area));
    const summary = (title: string, icon: Icon, rows: [string, string][], target: Screen) => <section className="mf-summary" aria-label={title}>
      <header>
        <IconTile icon={icon} size={18} small />
        <h2>{title}</h2>
        <button type="button" className="mf-edit" aria-label={s.editSection(title)} onClick={() => goTo(target)}><Pencil size={13} aria-hidden="true" />{s.edit}</button>
      </header>
      <dl>{rows.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}</dl>
    </section>;
    body = <>
      <div className="mf-grid is-2 is-top">
        {summary(s.summaryProject, iconRocket, projectRows, existing ? 0 : 3)}
        {summary(s.summaryNeeds, iconSparkle, needRows, 6)}
      </div>
      {(draft.noteTags.length > 0 || addOpen) && draft.note.trim() && <section className="mf-tags" aria-label={s.tagsTitle}>
        <p className="mf-tags__title"><Sparkles size={15} aria-hidden="true" />{s.tagsTitle}</p>
        <div className="mf-chips">
          {draft.noteTags.map((tag) => <span key={tag} className="mf-tag">{s.helpAreas[tag]}
            <button type="button" aria-label={s.tagsRemove(s.helpAreas[tag])} onClick={() => set('noteTags', draft.noteTags.filter((x) => x !== tag))}><X size={13} aria-hidden="true" /></button>
          </span>)}
          {addable.length > 0 && <button type="button" className="mf-tag is-add" aria-expanded={addOpen} onClick={() => setAddOpen((o) => !o)}><Plus size={13} aria-hidden="true" />{s.tagsAdd}</button>}
        </div>
        {addOpen && <div className="mf-chips is-compact mf-tags__add">
          {addable.map((area) => <Chip key={area} compact label={s.helpAreas[area]} on={false} onPick={() => set('noteTags', [...draft.noteTags, area])} />)}
        </div>}
        <p className="mf-hint">{s.tagsDisclosure}</p>
      </section>}
      {requestLimit && <p className="mf-error is-box" role="alert">{s.requestLimit}</p>}
    </>;
  }

  const hard = (sc === 9 && requestLimit) || saving;
  const width = sc === 4 || sc === 5 ? 'is-narrow' : '';

  return <MatchShell parts={parts} counter={`${at + 1} / ${steps.length}`} counterLabel={s.stepOf(at + 1, steps.length)} account={firstName}>
    <main id="main" tabIndex={-1} className={`mf-main ${width}`}>
      <div ref={headingRef}><MatchHeading lines={s.h[sc]} helper={s.helper[sc]} /></div>
      <form className="mf-form" noValidate onSubmit={(event) => { event.preventDefault(); void next(); }}>
        {body}
        {message && <p className="mf-error is-box" role="alert">{message}</p>}
        <div className="mf-actions">
          <button type="button" className="mf-back" onClick={back}><span aria-hidden="true"><ArrowLeft size={16} /></span>{s.back}</button>
          <button type="submit" className={`mf-next${complete && !hard ? '' : ' is-dim'}`} disabled={hard}>
            {saving ? s.loading : sc === 9 ? s.find : s.continue}<span aria-hidden="true"><ArrowRight size={16} /></span>
          </button>
        </div>
      </form>
    </main>
    {phase !== 'flow' && <div className="mf-overlay" role={phase === 'error' ? 'alertdialog' : 'status'} aria-live="polite" aria-labelledby="mf-overlay-title">
      {phase === 'matching' ? <>
        <div className="mf-fly" aria-hidden="true">
          <svg viewBox="0 0 900 260" focusable="false">
            <path d="M40 230 C 200 210, 270 100, 420 110 S 680 40, 860 50" fill="none" stroke="#b9a5f5" strokeWidth="3" strokeDasharray="1 12" strokeLinecap="round" />
          </svg>
          <PaperPlane className="is-flying" />
        </div>
        <p className="mf-overlay__title" id="mf-overlay-title">{s.matching.replace(/…$/, '')}<span className="mf-dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></p>
      </> : <>
        <p className="mf-overlay__title" id="mf-overlay-title">{s.errorTitle}</p>
        <p className="mf-overlay__text">{s.errorText}</p>
        <div className="mf-actions">
          <button type="button" className="mf-back" onClick={() => setPhase('flow')}><span aria-hidden="true"><ArrowLeft size={16} /></span>{s.editAnswers}</button>
          <button type="button" className="mf-next" onClick={() => void findMentors()}>{s.tryAgain}<span aria-hidden="true"><ArrowRight size={16} /></span></button>
        </div>
      </>}
    </div>}
  </MatchShell>;
}
