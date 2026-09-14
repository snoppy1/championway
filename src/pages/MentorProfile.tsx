import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Award, CalendarClock, Check } from 'lucide-react';
import { useAuth } from '../data/auth';
import { post, ApiError } from '../lib/api';
import { useApi } from '../lib/useApi';
import { themes, thaiTime } from '../data/focus';
import type { Theme } from '../data/focus';
import '../journey.css';

/* โปรไฟล์เมนเทอร์แบบสาธารณะ เปิดจากหน้ารายละเอียดงาน จึงพกบริบทเวทีมาด้วยใน ?competition=
   ถ้าเปิดตรงโดยไม่มีบริบท จะดูข้อมูลได้แต่ยังขอจองไม่ได้ เพราะการจองผูกกับเวทีเสมอ */

type Score = { theme: Theme; score: number; active: boolean; disabled: boolean; reasons: string[] };
type Slot = { id: string; startsAt: string; endsAt: string };
type Mentor = {
  id: string; name: string; avatar: string; bio: string;
  experience: string; best: string; cannot: string; topics: string[];
  scores: Score[]; awards: { title: string; year: number; themes: Theme[] }[]; slots: Slot[];
};
type Match = { direct: boolean; reasons: string[] };
type Payload = { mentor: Mentor; match: Match | null; competition: { slug: string; name: string } | null };

export function MentorProfile() {
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
  useEffect(() => { if (mentor) document.title = `${mentor.name} — ChampionWays`; }, [mentor]);

  if (loading) return <main id="main" tabIndex={-1} className="shell page"><p className="side-note">กำลังโหลด…</p></main>;
  if (!mentor) return <main id="main" tabIndex={-1} className="shell page">
    <h1>ยังไม่พบเมนเทอร์คนนี้</h1>
    <p className="muted">{error || 'ลิงก์อาจไม่ถูกต้อง หรือโปรไฟล์นี้ยังไม่ผ่านการตรวจ'}</p>
    <p><Link className="primary-button" to="/explore"><ArrowLeft size={17} aria-hidden="true" />กลับไปเลือกเวที</Link></p>
  </main>;

  async function request(event: FormEvent) {
    event.preventDefault();
    setSending(true);
    setMessage('');
    try {
      await post('/journey/bookings', { mentorId: id, competition, slotId, title, context });
      navigate('/profile');
    } catch (failure) {
      setMessage(failure instanceof ApiError ? failure.message : 'ส่งคำขอไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSending(false);
    }
  }

  const backLink = data?.competition ? `/competitions/${data.competition.slug}` : '/explore';
  const verified = mentor.awards;

  return <main id="main" tabIndex={-1} className="shell page journey-page">
    <p className="detail-breadcrumb">
      <Link to={backLink}><ArrowLeft size={16} aria-hidden="true" />
        {data?.competition ? `กลับไป ${data.competition.name}` : 'กลับไปเลือกเวที'}
      </Link>
    </p>

    <header className="mentor-hero">
      <span className="mentor-avatar" aria-hidden="true">{mentor.avatar}</span>
      <div>
        <h1>{mentor.name}</h1>
        <p>{mentor.bio}</p>
        <p className="pill-row">
          {mentor.scores.filter((score) => score.active).map((score) => <span className="theme-pill" key={score.theme}>{themes[score.theme]}</span>)}
        </p>
      </div>
    </header>

    {data?.match && <section className="panel match-why">
      <h2>ทำไมถึงแนะนำสำหรับงานนี้</h2>
      <ul className="check-list">
        {data.match.reasons.map((reason) => <li key={reason}><Check size={16} aria-hidden="true" /><span>{reason}</span></li>)}
      </ul>
    </section>}

    <section className="panel profile-block">
      <h2>ประสบการณ์</h2>
      <p>{mentor.experience}</p>
      <h3>ช่วยเรื่องนี้ได้</h3>
      <p>{mentor.best}</p>
      {/* บอกสิ่งที่ช่วยไม่ได้ไว้ด้วย ทีมจะได้ไม่เสียเวลานัดแล้วพบว่าไม่ตรง */}
      <h3>เรื่องที่ช่วยไม่ได้</h3>
      <p>{mentor.cannot}</p>
    </section>

    <section className="panel profile-block">
      <h2><Award size={18} aria-hidden="true" />ผลงานที่ผู้ตรวจยืนยันแล้ว</h2>
      {verified.length ? <ul className="plain-list">
        {verified.map((award) => <li key={`${award.title}-${award.year}`}>
          <b>{award.title}</b> <small className="muted">· {award.year}</small>
          <span className="pill-row">{award.themes.map((theme) => <span className="theme-pill" key={theme}>{themes[theme]}</span>)}</span>
        </li>)}
      </ul> : <p className="muted">ยังไม่มีผลงานที่ผ่านการตรวจ การแนะนำจึงมาจากประสบการณ์ที่เขียนไว้เท่านั้น</p>}
    </section>

    <section className="panel profile-block" aria-labelledby="booking-title">
      <h2 id="booking-title"><CalendarClock size={18} aria-hidden="true" />ขอจองเวลาคุย 60 นาที</h2>
      {!data?.competition ? <p className="muted">
        เลือกเวทีก่อนจึงจะขอจองได้ เพราะนัดหนึ่งครั้งผูกกับงานหนึ่งงาน
        {' '}<Link to="/explore">ไปเลือกเวที</Link>
      </p> : !data.match ? <p className="muted">เมนเทอร์ไม่พร้อมช่วยงานนี้ในขณะนี้ <Link to={backLink}>กลับไปเลือกเมนเทอร์สำหรับงานนี้</Link></p>
        : !mentor.slots.length ? <p className="muted">ตอนนี้เมนเทอร์ยังไม่ได้เปิดช่องเวลาว่าง ลองกลับมาดูใหม่ภายหลัง</p>
        : !user ? <p className="muted">
          <Link to={`/signin?next=${encodeURIComponent(`/mentors/${mentor.id}?competition=${data.competition.slug}`)}`}>เข้าสู่ระบบ</Link>
          {' '}เพื่อขอจองเวลาคุย
        </p> : <form className="booking-form" onSubmit={request}>
          <fieldset>
            <legend>เลือกเวลา (เวลาไทย)</legend>
            <div className="slot-options">
              {mentor.slots.map((slot) => <label key={slot.id}>
                <input type="radio" name="slot" required checked={slotId === slot.id} onChange={() => setSlotId(slot.id)} />
                {thaiTime(slot.startsAt)}
              </label>)}
            </div>
          </fieldset>
          <label>ชื่อทีม *
            <input required maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)}
              placeholder="เช่น ทีม Next Step" />
          </label>
          <label>อยากให้ช่วยเรื่องอะไร *
            <textarea required maxLength={1500} rows={4} value={context} onChange={(event) => setContext(event.target.value)}
              placeholder="บอกสิ่งที่เตรียมไว้แล้ว จุดที่ติด และผลลัพธ์ที่อยากได้จากการคุย" />
          </label>
          <p className="notice">
            คำขอจะกันเวลานี้ไว้จนกว่าเมนเทอร์จะตอบ ครบ 24 ชั่วโมง หรือถึงเวลาเริ่มนัด แล้วแต่ว่าอย่างใดถึงก่อน
            เมื่อเมนเทอร์รับคำขอ ระบบจะเปิดแชตกลุ่มให้คุยกันในเว็บ ยังไม่มีการเก็บเงิน
          </p>
          {message && <p className="auth-message" role="alert">{message}</p>}
          <button className="primary-button" disabled={sending}>{sending ? 'กำลังส่งคำขอ…' : 'ส่งคำขอจอง'}</button>
        </form>}
    </section>
  </main>;
}
