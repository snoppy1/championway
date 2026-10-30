import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Lightbulb, MessageCircle, Plus, Rocket, Search, Sprout, Trophy, UserRound } from 'lucide-react';
import { useAuth } from '../data/auth';
import { useApi } from '../lib/useApi';
import { useI18n } from '../i18n';
import { formatDate } from '../i18n/format';
import { Avatar } from '../components/mentors';
import type { LaterState } from './Match';
import '../rising-star.css';
import '../user-profile.css';
import '../projects.css';

/* โปรเจกต์ของฉัน (ผู้ใช้ขอ 29 ต.ค. 2569): เมนูพามาที่รายการโปรเจกต์ก่อน ไม่ใช่หน้าถามคำถาม
   คลิกโปรเจกต์ → รายละเอียดกับเมนเทอร์ที่ปรึกษาอยู่ ยังไม่มีเมนเทอร์จึงมีปุ่มไปหน้าหาเมนเทอร์ (/match) */

type ProjectItem = {
  id: string; name: string; start: string; competitionName: string | null; stage: string; updatedAt: string;
  open: { mentorName: string } | null; lastRequestId: string | null;
  /** กำลังปรึกษา (contacted/claimed) ก่อน ไม่มีก็คนล่าสุดที่ปรึกษาจบแล้ว */
  mentor: { state: 'consulting' | 'done'; id: string; name: string; avatar: string; photoUrl: string | null; stars: number | null } | null;
};
type ProjectDetail = {
  project: {
    id: string; name: string; start: string; competitionKind: string | null; competitionName: string | null;
    stage: string; createdAt: string; updatedAt: string;
  };
  lastRequest: { id: string; answers: { helpAreas?: string[]; urgency?: string; note?: string }; createdAt: string } | null;
  mentors: {
    consultationId: string; status: string; since: string;
    mentor: { id: string; name: string; avatar: string; photoUrl: string | null; headline: string };
  }[];
};

function useSignedIn(next: string) {
  const { user, loading } = useAuth();
  if (loading) return { ready: false, redirect: null };
  if (!user) return { ready: false, redirect: <Navigate to={`/signin?next=${encodeURIComponent(next)}`} replace /> };
  return { ready: true, redirect: null };
}

const PROJECT_LIMIT = 20;
const STAGES = ['idea', 'planning', 'prototype', 'improving', 'pitching'];
// ไอคอนการ์ดตามจุดเริ่มต้นของโปรเจกต์ (ดีไซน์ "My Projects" 31 ต.ค. 2569)
const startIcon: Record<string, { icon: typeof Trophy; tint: string; ink: string }> = {
  has_competition: { icon: Trophy, tint: '#fff2d9', ink: '#c98a12' },
  has_idea: { icon: Lightbulb, tint: '#fde6f2', ink: '#d6409f' },
  build_skills: { icon: Sprout, tint: '#e4f4ec', ink: '#22855a' },
};

function ProjectCard({ item }: { item: ProjectItem }) {
  const { t, lang } = useI18n();
  const s = t.projects;
  const look = startIcon[item.start] ?? startIcon.has_idea;
  const Icon = look.icon;
  const step = Math.max(0, STAGES.indexOf(item.stage));
  const mentor = item.mentor;
  const find = { pathname: '/match', state: { focusProject: item.id } satisfies LaterState };

  return <article className="pj-card">
    <div className="pj-card__top">
      <span className="pj-card__icon" style={{ background: look.tint, color: look.ink }} aria-hidden="true"><Icon size={22} /></span>
      <div className="pj-card__text">
        <h2 className="pj-card__title"><Link to={`/projects/${item.id}`}>{item.name}</Link></h2>
        <span className="pj-card__comp">{item.competitionName ?? t.match.noCompetition}</span>
      </div>
    </div>

    <div className="pj-stage">
      <div className="pj-stage__row"><span className="pj-stage__name">{t.match.stages[item.stage]}</span><span className="pj-stage__of">{s.stageOf(step + 1)}</span></div>
      <div className="pj-stage__track" aria-hidden="true">
        {STAGES.map((key, index) => <span key={key} className={index < step ? 'is-past' : index === step ? 'is-now' : undefined} />)}
      </div>
    </div>

    <div className="pj-card__foot">
      {!mentor ? <>
        <span className="pj-who">
          <span className="pj-who__empty" aria-hidden="true"><UserRound size={15} /></span>
          <span className="pj-who__text"><b>{t.match.noMentorYet}</b><span>{s.noMentorSub}</span></span>
        </span>
        <Link className="pj-btn is-primary" to={find.pathname} state={find.state}>{s.findMentor}<ArrowRight size={14} aria-hidden="true" /></Link>
      </> : <>
        <span className="pj-who">
          <span className={`pj-who__avatar${mentor.state === 'consulting' ? ' is-live' : ''}`}><Avatar initial={mentor.avatar} photoUrl={mentor.photoUrl} /></span>
          <span className="pj-who__text">
            <b>{mentor.name}</b>
            <span className={mentor.state === 'consulting' ? 'is-live' : undefined}>
              {mentor.state === 'consulting' ? s.consultingNow : mentor.stars !== null ? s.completedReviewed : s.completedCard}
            </span>
          </span>
        </span>
        {mentor.state === 'consulting'
          ? <Link className="pj-btn" to={`/mentors/${mentor.id}`}><MessageCircle size={14} aria-hidden="true" />{s.contact}</Link>
          : mentor.stars !== null && <span className="pj-stars" aria-label={s.rating(mentor.stars)}><span aria-hidden="true">★</span> {mentor.stars.toFixed(1)}</span>}
      </>}
    </div>
    <span className="pj-card__updated">{t.match.updated(formatDate(item.updatedAt, lang))}</span>
  </article>;
}

export function Projects() {
  const { t, lang } = useI18n();
  const s = t.projects;
  const auth = useSignedIn('/projects');
  const { data, error, loading } = useApi<{ items: ProjectItem[]; projectLimitReached: boolean }>(auth.ready ? '/projects' : null);
  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);

  if (auth.redirect) return auth.redirect;
  const items = data?.items ?? [];

  return <main id="main" tabIndex={-1} className="shell page pj">
    <header className="pj-head">
      <div className="pj-head__copy">
        <h1>{s.titleParts[0]}{lang === 'th' ? '' : ' '}<span className="pj-accent">{s.titleParts[1]}</span></h1>
        <p className="pj-muted">{s.lead}</p>
      </div>
      {items.length > 0 && <div className="pj-head__end">
        <span className="pj-count">{s.count(items.length, PROJECT_LIMIT)}</span>
        {!data?.projectLimitReached && <Link className="pj-new" to="/match"><span>{s.newProject}</span><span className="pj-new__plus" aria-hidden="true"><Plus size={16} /></span></Link>}
      </div>}
    </header>

    {error && <p className="pj-error" role="alert">{error}</p>}
    {(loading || !auth.ready) && !data ? <p className="pj-muted" role="status">{s.loading}</p>
      : items.length === 0 ? !error && <section className="pj-empty">
        <span className="pj-empty__icon" aria-hidden="true"><Rocket size={28} /></span>
        <h2>{s.emptyTitle}</h2>
        <p className="pj-muted">{s.emptyText}</p>
        <Link className="pj-btn is-primary is-big" to="/match"><Plus size={16} aria-hidden="true" />{s.startFirst}</Link>
      </section>
      : <ul className="pj-list">
        {items.map((item) => <li key={item.id}><ProjectCard item={item} /></li>)}
      </ul>}
  </main>;
}

export function ProjectPage() {
  const { id = '' } = useParams();
  const { t, lang } = useI18n();
  const s = t.projects;
  const m = t.match;
  const auth = useSignedIn(`/projects/${id}`);
  const { data, error, loading } = useApi<ProjectDetail>(auth.ready ? `/projects/${encodeURIComponent(id)}` : null);
  useEffect(() => { document.title = `${data?.project.name ?? s.pageTitle} — ChampionWays`; }, [data, s.pageTitle]);

  if (auth.redirect) return auth.redirect;
  const back = <p className="pj-back"><Link to="/projects"><ArrowLeft size={16} aria-hidden="true" />{s.back}</Link></p>;
  if ((loading || !auth.ready) && !data) return <main id="main" className="shell page up pj">{back}<p className="pj-muted" role="status">{s.loading}</p></main>;
  if (error || !data) return <main id="main" className="shell page up pj">{back}<h1>{s.notFound}</h1>{error && <p className="pj-error" role="alert">{error}</p>}</main>;

  const { project, lastRequest, mentors } = data;
  const find = { pathname: '/match', state: { focusProject: project.id } satisfies LaterState };
  const answers = lastRequest?.answers;

  return <main id="main" tabIndex={-1} className="shell page up pj">
    {back}
    <header className="pj-head">
      <div>
        <h1>{project.name}</h1>
        <p className="pj-muted">{project.competitionName ?? m.noCompetition}</p>
      </div>
      <span className="pj-pill">{m.stages[project.stage]}</span>
    </header>

    <div className="pj-grid">
      <section className="panel pj-panel" aria-labelledby="pj-mentors">
        <h2 id="pj-mentors">{s.mentorsTitle}</h2>
        {mentors.length > 0 ? <>
          <ul className="pj-mentors">
            {mentors.map((row) => <li key={row.consultationId}>
              <Avatar initial={row.mentor.avatar} photoUrl={row.mentor.photoUrl} />
              <div>
                <Link className="pj-mentors__name" to={`/mentors/${row.mentor.id}`}>{row.mentor.name}</Link>
                {row.mentor.headline && <p className="pj-muted">{row.mentor.headline}</p>}
                <p className="pj-mentors__meta">
                  <span className={`pj-mentor${row.status === 'contacted' ? ' is-on' : ''}`}>{s.statuses[row.status] ?? row.status}</span>
                  <span className="pj-muted">{s.since(formatDate(row.since, lang))}</span>
                </p>
              </div>
            </li>)}
          </ul>
          <div className="pj-actions">
            {lastRequest && <Link className="ghost-button" to={`/matches/${lastRequest.id}`}>{s.lastMatches}</Link>}
            <Link className="ghost-button" to={find.pathname} state={find.state}><Search size={15} aria-hidden="true" />{s.findMore}</Link>
          </div>
        </> : <div className="pj-none">
          <p><strong>{s.noMentor}</strong></p>
          <p className="pj-muted">{s.noMentorLead}</p>
          <div className="pj-actions">
            <Link className="primary-button" to={find.pathname} state={find.state}><Search size={15} aria-hidden="true" />{s.findMentors}</Link>
            {lastRequest && <Link className="ghost-button" to={`/matches/${lastRequest.id}`}>{s.lastMatches}</Link>}
          </div>
        </div>}
      </section>

      <section className="panel pj-panel" aria-labelledby="pj-details">
        <h2 id="pj-details">{s.details}</h2>
        <dl className="pj-facts">
          <div><dt>{s.start}</dt><dd>{m.starts[project.start]?.[0] ?? project.start}</dd></div>
          {project.competitionKind && <div><dt>{s.kind}</dt><dd>{m.kinds[project.competitionKind]}</dd></div>}
          <div><dt>{s.competition}</dt><dd>{project.competitionName ?? m.noCompetition}</dd></div>
          <div><dt>{s.stage}</dt><dd>{m.stages[project.stage]}</dd></div>
          <div><dt>{s.created}</dt><dd>{formatDate(project.createdAt, lang)}</dd></div>
          <div><dt>{s.updated}</dt><dd>{formatDate(project.updatedAt, lang)}</dd></div>
        </dl>
        {answers && <>
          <h3>{s.lastNeeds}</h3>
          <dl className="pj-facts">
            {answers.helpAreas?.length ? <div><dt>{s.help}</dt><dd>{answers.helpAreas.map((key) => m.helpAreas[key] ?? key).join(' · ')}</dd></div> : null}
            {answers.urgency && <div><dt>{s.urgency}</dt><dd>{m.urgencies[answers.urgency]?.[0] ?? answers.urgency}</dd></div>}
            {answers.note && <div><dt>{s.note}</dt><dd>{answers.note}</dd></div>}
          </dl>
        </>}
      </section>
    </div>
  </main>;
}
