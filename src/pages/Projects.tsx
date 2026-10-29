import { useEffect } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Folder, Plus, Search } from 'lucide-react';
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
  id: string; name: string; competitionName: string | null; stage: string; updatedAt: string;
  open: { mentorName: string } | null; lastRequestId: string | null;
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

export function Projects() {
  const { t, lang } = useI18n();
  const s = t.projects;
  const auth = useSignedIn('/projects');
  const { data, error, loading } = useApi<{ items: ProjectItem[]; projectLimitReached: boolean }>(auth.ready ? '/projects' : null);
  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);

  if (auth.redirect) return auth.redirect;
  const items = data?.items ?? [];

  return <main id="main" tabIndex={-1} className="shell page up pj">
    <header className="pj-head">
      <div>
        <h1>{s.title}</h1>
        <p className="pj-muted">{s.lead}</p>
      </div>
      {items.length > 0 && !data?.projectLimitReached && <Link className="primary-button" to="/match"><Plus size={16} aria-hidden="true" />{s.newProject}</Link>}
    </header>

    {error && <p className="pj-error" role="alert">{error}</p>}
    {(loading || !auth.ready) && !data ? <p className="pj-muted" role="status">{s.loading}</p>
      : items.length === 0 ? !error && <section className="panel pj-empty">
        <h2>{s.emptyTitle}</h2>
        <p className="pj-muted">{s.emptyText}</p>
        <Link className="primary-button" to="/match"><Plus size={16} aria-hidden="true" />{s.newProject}</Link>
      </section>
      : <ul className="pj-list">
        {items.map((item) => <li key={item.id}>
          <Link className="pj-card" to={`/projects/${item.id}`}>
            <span className="pj-card__icon" aria-hidden="true"><Folder size={22} /></span>
            <span className="pj-card__text">
              <span className="pj-card__title">{item.name}</span>
              <span className="pj-muted">{item.competitionName ?? t.match.noCompetition}</span>
              <span className="pj-card__meta"><span className="pj-pill">{t.match.stages[item.stage]}</span>{t.match.updated(formatDate(item.updatedAt, lang))}</span>
              <span className={`pj-mentor${item.open ? ' is-on' : ''}`}>{item.open ? t.match.consultingWith(item.open.mentorName) : t.match.noMentorYet}</span>
            </span>
            <ArrowRight className="pj-card__go" size={18} aria-hidden="true" />
          </Link>
        </li>)}
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
