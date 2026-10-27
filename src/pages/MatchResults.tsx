import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, ExternalLink, Info, Pencil, Sparkles, X } from 'lucide-react';
import { ApiError, post } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useAuth } from '../data/auth';
import { useI18n } from '../i18n';
import { contactHref, contactKeys } from '../data/consult';
import type { Contacts } from '../data/consult';
import type { MatchAnswers, SkillLevel, SkillTag } from '../data/matching';
import { MatchHeading, MatchShell } from '../components/MatchShell';
import type { EditState } from './Match';
import { SafetyDialog } from '../components/SafetyDialog';

/* หน้าผลจับคู่ /matches/:id ผลคำนวณและเก็บไว้ตอนส่งคำขอ เปิดซ้ำได้ผลเดิม
   ไม่มีช่อง Rising Star แนะนำ (เจ้าของตัดสิน 23 ต.ค. 2569) เรียงตามเปอร์เซ็นต์จากสูตรอย่างเดียว
   เริ่มปรึกษาแล้วเห็นช่องทางติดต่อทันที โปรเจกต์หนึ่งปรึกษาค้างได้ทีละคน (spec 6.1) */

type Reason =
  | { code: 'event' } | { code: 'stage' } | { code: 'style' } | { code: 'team' }
  | { code: 'experience'; result: string; kind: string }
  | { code: 'skill'; tag: SkillTag; level: SkillLevel }
  | { code: 'helps'; id: string }
  | { code: 'reply'; hours: number }
  | { code: 'language'; lang: string };
type Result = {
  rank: number; score: number; reasons: Reason[];
  mentor: { id: string; name: string; initial: string; photoUrl: string | null; headline: string; price: number | null; unit: string; isNew: boolean; acceptingRequests: boolean };
};
type Payload = {
  request: { id: string; projectId: string; answers: Partial<MatchAnswers> & { projectName?: string; stage?: string }; createdAt: string };
  results: Result[];
  open: { id: string; mentorId: string; mentorName: string } | null;
};
const TINTS = ['purple', 'blue', 'pink', 'gold'] as const;

function ContactDialog({ name, contacts, onClose }: { name: string; contacts: Contacts; onClose: () => void }) {
  const { t } = useI18n();
  const s = t.match;
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return <dialog ref={ref} className="mf-dialog" aria-labelledby="mf-contacts-title" onClose={onClose}>
    <header>
      <h2 id="mf-contacts-title">{s.contactsTitle(name)}</h2>
      <button type="button" className="mf-dialog__close" aria-label={s.close} onClick={() => ref.current?.close()}><X size={18} aria-hidden="true" /></button>
    </header>
    <p className="mf-hint">{s.contactsLead}</p>
    <dl className="mf-contacts">
      {contactKeys.map((key) => {
        const value = contacts[key].trim();
        const href = value ? contactHref(key, value) : null;
        return <div key={key}><dt>{t.contact.profile.channels[key]}</dt>
          <dd>{!value ? <span aria-label={t.contact.profile.notProvided}>-</span>
            : href ? <a href={href} target={key === 'email' || key === 'phone' ? undefined : '_blank'} rel="noopener noreferrer">{value}{key === 'link' && <ExternalLink size={13} aria-hidden="true" />}</a>
              : value}</dd>
        </div>;
      })}
    </dl>
    <div className="mf-actions">
      <Link className="mf-next" to="/consulting">{s.goConsulting}<span aria-hidden="true"><ArrowRight size={16} /></span></Link>
    </div>
  </dialog>;
}

export function MatchResults() {
  const { t } = useI18n();
  const s = t.match;
  const v = t.mentorProfileV2;
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data, error, loading, reload } = useApi<Payload>(user && id ? `/matches/${encodeURIComponent(id)}` : null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState<{ mentorId: string; text: string } | null>(null);
  const [dialog, setDialog] = useState<{ name: string; contacts: Contacts } | null>(null);
  /* เริ่มปรึกษาครั้งแรกต้องผ่านคำเตือนความปลอดภัยก่อน คนที่ปรึกษาอยู่แล้วกดดูช่องทางได้เลย */
  const [asking, setAsking] = useState<Result | null>(null);

  useEffect(() => { document.title = `${s.resultsTitle.join(' ')} — ChampionWays`; }, [s.resultsTitle]);

  if (!authLoading && !user) return <Navigate to={`/signin?next=${encodeURIComponent(`/matches/${id ?? ''}`)}`} replace />;
  if (authLoading || (loading && !data)) return <MatchShell deco={false}><main id="main" className="mf-main"><p className="mf-status" role="status">{s.loading}</p></main></MatchShell>;
  if (!data) return <MatchShell deco={false}><main id="main" tabIndex={-1} className="mf-main">
    <MatchHeading lines={s.resultsTitle} helper={error || s.notFound} />
    <div className="mf-actions"><Link className="mf-next" to="/match">{s.pageTitle}<span aria-hidden="true"><ArrowRight size={16} /></span></Link></div>
  </main></MatchShell>;

  const a = data.request.answers;
  const helps = [...new Set([...(a.helpAreas ?? []), ...(a.noteTags ?? [])])].map((area) => s.helpAreas[area]).join(', ');
  const summary = [a.projectName, a.stage ? s.stages[a.stage] : '', helps].filter(Boolean).join(' · ');
  const editAnswers = () => navigate('/match', { state: { projectId: data.request.projectId, answers: a } satisfies EditState });

  const reasonText = (r: Reason) => {
    switch (r.code) {
      case 'event': return s.reasons.event;
      case 'experience': return `${s.reasons.results[r.result]} · ${s.reasons.kinds[r.kind]}`;
      case 'skill': return `${v.skillNames[r.tag]} · ${v.levelNames[r.level]}`;
      case 'helps': return v.helpsWithNames[r.id as keyof typeof v.helpsWithNames] ?? r.id;
      case 'stage': return s.reasons.stage;
      case 'style': return s.reasons.style;
      case 'team': return s.reasons.team;
      case 'reply': return s.reasons.reply(r.hours);
      case 'language': return s.reasons.language(r.lang);
    }
  };

  async function start(result: Result) {
    setBusy(result.mentor.id);
    setProblem(null);
    try {
      const res = await post<{ contacts: Contacts }>(`/matches/${encodeURIComponent(data!.request.id)}/start/${encodeURIComponent(result.mentor.id)}`, {});
      setDialog({ name: result.mentor.name, contacts: res.contacts });
      reload();
    } catch (failure) {
      setProblem({ mentorId: result.mentor.id, text: failure instanceof ApiError ? failure.message : t.errors.unreachable });
    } finally {
      setBusy('');
    }
  }

  const open = data.open;
  return <MatchShell deco={false} parts={s.parts.map((label) => ({ label, total: 1, done: 1, current: false }))}>
    <main id="main" tabIndex={-1} className="mf-main is-wide">
      <MatchHeading lines={s.resultsTitle} />
      <p className="mf-results__summary">{summary}
        <button type="button" className="mf-linkbtn" onClick={editAnswers}><Pencil size={13} aria-hidden="true" />{s.editAnswers}</button>
      </p>
      {open && <p className="mf-banner" role="status"><Info size={16} aria-hidden="true" />{s.consulting(open.mentorName)}</p>}
      {data.results.length === 0 ? <section className="mf-empty">
        <Sparkles size={28} aria-hidden="true" />
        <h2>{s.emptyTitle}</h2>
        <p>{s.emptyText}</p>
        <div className="mf-actions">
          <button type="button" className="mf-back" onClick={editAnswers}><span aria-hidden="true"><Pencil size={14} /></span>{s.editAnswers}</button>
          <Link className="mf-next" to="/mentors">{s.browse}<span aria-hidden="true"><ArrowRight size={16} /></span></Link>
        </div>
      </section> : <ol className="mf-results" aria-label={s.resultsList}>
        {data.results.map((result, index) => {
          const m = result.mentor;
          const mine = open?.mentorId === m.id;
          const blocked = Boolean(open) && !mine;
          const tint = TINTS[index % TINTS.length];
          return <li key={m.id} className="mf-result">
            <div className="mf-result__top">
              {m.photoUrl ? <img className="mf-result__photo" src={m.photoUrl} alt="" loading="lazy" />
                : <span className={`mf-result__photo is-${tint}`} aria-hidden="true">{m.initial}</span>}
              <div className="mf-result__who">
                <h2>{m.name}</h2>
                {m.headline && <p>{m.headline}</p>}
                {m.isNew && <span className="mf-badge"><Sparkles size={12} aria-hidden="true" />{s.newMentor}</span>}
              </div>
              <p className="mf-result__pct"><strong>{result.score}<span>%</span></strong><span>{s.matchLabel}</span></p>
            </div>
            {result.reasons.length > 0 && <ul className="mf-reasons">
              {result.reasons.map((reason, i) => <li key={i}><Check size={12} strokeWidth={3} aria-hidden="true" />{reasonText(reason)}</li>)}
            </ul>}
            <div className="mf-result__foot">
              <p className="mf-result__price">{m.price === 0 ? s.free : t.price.line(m.price, null, m.unit)}</p>
              <Link className="mf-linkbtn" to={`/mentors/${m.id}`} aria-label={s.viewProfileOf(m.name)}>{s.viewProfile}</Link>
              <button type="button" className="mf-start" disabled={blocked || busy === m.id || (!mine && !m.acceptingRequests)}
                aria-label={mine ? s.openConsult : s.startConsultWith(m.name)} onClick={() => { if (mine) void start(result); else setAsking(result); }}>
                {busy === m.id ? s.starting : mine ? s.openConsult : s.startConsult}
              </button>
            </div>
            {problem?.mentorId === m.id && <p className="mf-error" role="alert">{problem.text}</p>}
          </li>;
        })}
      </ol>}
    </main>
    {asking && <SafetyDialog onConfirm={() => { void start(asking); }} onCancel={() => setAsking(null)} />}
    {dialog && <ContactDialog name={dialog.name} contacts={dialog.contacts} onClose={() => setDialog(null)} />}
  </MatchShell>;
}
