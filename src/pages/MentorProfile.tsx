import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Award, CalendarClock, Check } from 'lucide-react';
import { useAuth } from '../data/auth';
import { post, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import type { MatchReason, ScoreReason, Theme } from '../data/focus';
import { useI18n } from '../i18n';
import { formatDateTime } from '../i18n/format';
import '../journey.css';

/* โปรไฟล์เมนเทอร์แบบสาธารณะ เปิดจากหน้ารายละเอียดงาน จึงพกบริบทเวทีมาด้วยใน ?competition=
   ถ้าเปิดตรงโดยไม่มีบริบท จะดูข้อมูลได้แต่ยังขอจองไม่ได้ เพราะการจองผูกกับเวทีเสมอ */

type Score = { theme: Theme; score: number; active: boolean; disabled: boolean; reasons: ScoreReason[] };
type Slot = { id: string; startsAt: string; endsAt: string };
type Mentor = {
  id: string; name: string; avatar: string; bio: string;
  experience: string; best: string; cannot: string; topics: string[];
  scores: Score[]; awards: { title: string; year: number; themes: Theme[] }[]; slots: Slot[];
};
type Match = { direct: boolean; reasons: MatchReason[] };
type Payload = { mentor: Mentor; match: Match | null; competition: { slug: string; name: string } | null };

export function MentorProfile() {
  const { t, lang } = useI18n();
  const s = t.mentorProfile;
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const competition = params.get('competition') ?? '';

  const { data, error, loading } = useApi<Payload>(
    id ? `/journey/mentors/${encodeURIComponent(id)}${competition ? `?competition=${encodeURIComponent(competition)}` : ''}` : null,
  );

  const [slotId, setSlotId] = useState('');
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const mentor = data?.mentor;
  // หน้าที่หาเมนเทอร์ไม่เจอก็ต้องตั้งชื่อแท็บตามภาษาที่เลือก ไม่ปล่อยชื่อเริ่มต้นของหน้า
  useEffect(() => {
    if (mentor) document.title = `${mentor.name} — ChampionWays`;
    else if (!loading) document.title = `${s.notFoundTitle} — ChampionWays`;
  }, [mentor, loading, s.notFoundTitle]);

  if (loading) return <main id="main" tabIndex={-1} className="shell page"><p className="side-note">{s.loading}</p></main>;
  if (!mentor) return <main id="main" tabIndex={-1} className="shell page">
    <h1>{s.notFoundTitle}</h1>
    <p className="muted">{error || s.notFoundText}</p>
    <p><Link className="primary-button" to="/explore"><ArrowLeft size={17} aria-hidden="true" />{s.backToPick}</Link></p>
  </main>;

  async function request(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setMessage('');
    try {
      await post('/journey/bookings', { mentorId: id, competition, slotId, title, context });
      navigate('/profile');
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : s.sendFailed);
    } finally {
      setSending(false);
    }
  }

  const backLink = data?.competition ? `/competitions/${data.competition.slug}` : '/explore';
  const verified = mentor.awards;

  return <main id="main" tabIndex={-1} className="shell page journey-page">
    <p className="detail-breadcrumb">
      <Link to={backLink}><ArrowLeft size={16} aria-hidden="true" />
        {data?.competition ? s.backTo(data.competition.name) : s.backToPick}
      </Link>
    </p>

    <header className="mentor-hero">
      <span className="mentor-avatar" aria-hidden="true">{mentor.avatar}</span>
      <div>
        <h1>{mentor.name}</h1>
        <p>{mentor.bio}</p>
        <p className="pill-row">
          {mentor.scores.filter((score) => score.active).map((score) => <span className="theme-pill" key={score.theme}>{t.taxonomy.themes[score.theme]}</span>)}
        </p>
      </div>
    </header>

    {data?.match && <section className="panel match-why">
      <h2>{s.whyTitle}</h2>
      <ul className="check-list">
        {data.match.reasons.map((reason) => {
          const text = t.journey.matchReason(reason.code, reason.code === 'chose' ? '' : t.taxonomy.themes[reason.theme]);
          return <li key={text}><Check size={16} aria-hidden="true" /><span>{text}</span></li>;
        })}
      </ul>
    </section>}

    <section className="panel profile-block">
      <h2>{s.experience}</h2>
      <p>{mentor.experience}</p>
      <h3>{s.helpsWith}</h3>
      <p>{mentor.best}</p>
      {/* บอกสิ่งที่ช่วยไม่ได้ไว้ด้วย ทีมจะได้ไม่เสียเวลานัดแล้วพบว่าไม่ตรง */}
      <h3>{s.cannotHelp}</h3>
      <p>{mentor.cannot}</p>
    </section>

    <section className="panel profile-block">
      <h2><Award size={18} aria-hidden="true" />{s.verifiedTitle}</h2>
      {verified.length ? <ul className="plain-list">
        {verified.map((award) => <li key={`${award.title}-${award.year}`}>
          <b>{award.title}</b> <small className="muted">· {award.year}</small>
          <span className="pill-row">{award.themes.map((theme) => <span className="theme-pill" key={theme}>{t.taxonomy.themes[theme]}</span>)}</span>
        </li>)}
      </ul> : <p className="muted">{s.noVerified}</p>}
    </section>

    <section className="panel profile-block" aria-labelledby="booking-title">
      <h2 id="booking-title"><CalendarClock size={18} aria-hidden="true" />{s.bookTitle}</h2>
      {!data?.competition ? <p className="muted">
        {s.pickFirst}<Link to="/explore">{s.pickLink}</Link>
      </p> : !data.match ? <p className="muted">{s.notReadyBefore}<Link to={backLink}>{s.notReadyLink}</Link></p>
        : !mentor.slots.length ? <p className="muted">{s.noSlots}</p>
        : !user ? <p className="muted">
          <Link to={`/signin?next=${encodeURIComponent(`/mentors/${mentor.id}?competition=${data.competition.slug}`)}`}>{s.signInLink}</Link>{s.signInAfter}
        </p> : <form className="booking-form" onSubmit={request}>
          <fieldset>
            <legend>{s.pickTime}</legend>
            <div className="slot-options">
              {mentor.slots.map((slot) => <label key={slot.id}>
                <input type="radio" name="slot" required checked={slotId === slot.id} onChange={() => setSlotId(slot.id)} />
                {formatDateTime(slot.startsAt, lang)}
              </label>)}
            </div>
          </fieldset>
          <label>{s.teamName}
            <input required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)}
              placeholder={s.teamPlaceholder} />
          </label>
          <label>{s.help}
            <textarea required maxLength={1500} rows={4} value={context} onChange={(event) => setContext(event.target.value)}
              placeholder={s.helpPlaceholder} />
          </label>
          <p className="notice">{s.notice}</p>
          {message && <p className="auth-message" role="alert">{message}</p>}
          <button className="primary-button" disabled={sending}>{sending ? s.sending : s.send}</button>
        </form>}
    </section>
  </main>;
}
