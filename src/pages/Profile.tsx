import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { CalendarClock, KeyRound, MessageCircle, Pencil, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../data/auth';
import { api, post, ApiError } from '../lib/api';
import type { Theme } from '../data/focus';
import type { ScoreReason } from '../data/focus';
import { currentRoleLine } from '../data/profile';
import type { PersonLevel } from '../data/profile';
import { useI18n } from '../i18n';
import { formatDateTime, formatTime } from '../i18n/format';
import '../journey.css';

/* หน้าโปรไฟล์เป็นศูนย์รวมของผู้ใช้คนเดียว: บัญชี ใบสมัครเมนเทอร์ คิวที่เปิดไว้ และนัดทั้งหมด
   ทางเข้าสมัครเป็นเมนเทอร์ย้ายมาอยู่ที่นี่ แทนที่จะเป็นหน้าเลือกเมนเทอร์แบบเดิม

   ทุกอย่างอ่านจาก /api/journey/profile คำขอเดียว เพื่อให้สถานะที่เห็นเป็นชุดเดียวกันเสมอ */

type Score = { theme: Theme; score: number; active: boolean; disabled: boolean; reasons: ScoreReason[] };
type Slot = { id: string; startsAt: string; endsAt: string };
type Mentor = {
  id: string; name: string; avatar: string; bio: string;
  scores: Score[]; awards: { title: string; year: number; themes: Theme[] }[];
  /* สองรายการนี้คือสิ่งที่เมนเทอร์กดเอง ไม่ใช่ผลการคำนวณ ต้องส่งกลับไปทั้งชุดทุกครั้งที่บันทึก
     ถ้าเดาจากคะแนนแทน หมวดที่ได้คะแนนจากผลงานจะถูกนับเป็น "ยืนยันเอง" ไปด้วย */
  confirmedThemes: Theme[]; disabledThemes: Theme[];
};
type Choice = { competitionId: string; choice: string };
type Booking = {
  id: string; title: string; context: string; status: string; reason: string;
  startsAt: string; endsAt: string; expiresAt: string;
  eventName: string; mentorName: string; ownerId: string; mentorUserId: string; roomId: string | null;
};
type Profile = {
  user: { id: string; name: string; email: string; role: string };
  applications: { id: string; status: string; submittedAt: string }[];
  mentor: Mentor | null;
  choices: Choice[];
  slots: Slot[];
  bookings: Booking[];
};
type Option = { id: string; slug: string; name: string };

// ข้อความ error จากเซิร์ฟเวอร์แปลมาให้แล้วตาม x-lang ส่วนกรณีติดต่อเซิร์ฟเวอร์ไม่ได้ใช้ข้อความสำรองของหน้านี้
const errorText = (failure: unknown, fallback: string) => (failure instanceof ApiError ? failure.message : fallback);

export function Profile() {
  const { t, lang } = useI18n();
  const s = t.profile;
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<Profile>();
  const [options, setOptions] = useState<Option[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api<Profile>('/journey/profile')); } catch (failure) { setError(errorText(failure, s.unreachable)); }
  }, [s.unreachable]);

  useEffect(() => {
    document.title = `${s.pageTitle} — ChampionWays`;
    if (!user) return;
    void load();
    api<{ items: Option[] }>('/competitions/options').then((result) => setOptions(result.items)).catch(() => setOptions([]));
  }, [user, load, s.pageTitle]);

  if (authLoading) return <main id="main" className="shell page">{s.loadingAccount}</main>;
  if (!user) return <Navigate to="/signin?next=/profile" replace />;

  /** ทุกปุ่มในหน้านี้เปลี่ยนข้อมูลฝั่งเซิร์ฟเวอร์ จึงโหลดสถานะใหม่ทุกครั้งหลังทำสำเร็จ */
  async function act(run: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try { await run(); await load(); } catch (failure) { setError(errorText(failure, s.unreachable)); } finally { setBusy(false); }
  }

  const mentor = data?.mentor;
  const choiceOf = (id: string) => data?.choices.find((item) => item.competitionId === id)?.choice ?? 'auto';

  return <main id="main" tabIndex={-1} className="shell page journey-page">
    <header className="profile-head">
      {user.avatarUrl
        ? <img className="profile-avatar" src={user.avatarUrl} alt="" width={58} height={58} />
        : <span className="profile-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>}
      <div>
        <p className="eyebrow">{s.pageTitle}</p>
        <h1>{user.name}</h1>
        <p className="muted">{user.email}</p>
      </div>
      <p className="profile-head-actions">
        <Link className="primary-button" to="/profile/edit"><Pencil size={16} aria-hidden="true" />{s.editProfile}</Link>
        <Link className="ghost-button" to="/chats"><MessageCircle size={16} aria-hidden="true" />{s.myChats}</Link>
      </p>
    </header>

    {error && <p className="auth-message" role="alert">{error}</p>}
    {!data && !error && <p role="status">{s.loadingData}</p>}

    {/* ข้อมูลส่วนนี้อ่านจาก context ของบัญชี ไม่ใช่จาก /journey/profile
        จึงยังแสดงได้แม้ส่วนเมนเทอร์ด้านล่างจะโหลดไม่สำเร็จ */}
    <section className="panel profile-block">
      <h2><UserRound size={18} aria-hidden="true" />{s.myDetails}</h2>
      <dl className="fact-list">
        <div><dt>{s.bio}</dt><dd>{user.bio || <span className="muted">{t.taxonomy.notFilled}</span>}</dd></div>
        <div>
          <dt>{s.currentRole}</dt>
          <dd>{currentRoleLine(user, t) || <span className="muted">{t.taxonomy.notFilled}</span>}</dd>
        </div>
        <div>
          <dt>{s.educationLevel}</dt>
          <dd>{user.educationLevel && user.educationLevel !== 'open'
            ? t.taxonomy.personLevels[user.educationLevel as PersonLevel]
            : <span className="muted">{t.taxonomy.notFilled}</span>}</dd>
        </div>
      </dl>
    </section>

    <section className="panel profile-block">
      <h2><KeyRound size={18} aria-hidden="true" />{s.accountSecurity}</h2>
      <dl className="fact-list">
        <div><dt>{s.email}</dt><dd>{user.email}</dd></div>
        <div>
          <dt>{s.password}</dt>
          <dd>{user.hasPassword ? s.passwordSet : <span className="muted">{s.passwordNotSet}</span>}</dd>
        </div>
        <div>
          <dt>{s.googleSignIn}</dt>
          <dd>{user.googleLinked ? s.googleLinked : <span className="muted">{s.googleNotLinked}</span>}</dd>
        </div>
      </dl>
    </section>

    {data && <>
      <section className="panel profile-block">
        <h2><ShieldCheck size={18} aria-hidden="true" />{s.mentoring}</h2>
        {mentor ? <p className="muted">{s.mentorPublishedBefore}<Link to={`/mentors/${mentor.id}`}>{s.mentorPublishedLink}</Link></p>
          : data.applications.length ? <ul className="plain-list">
            {data.applications.map((item) => <li key={item.id}>
              <b>{s.applicationStatus[item.status] ?? item.status}</b>
              <small className="muted">{s.submittedOn(formatDateTime(item.submittedAt, lang))}</small>
            </li>)}
          </ul> : <>
            <p className="muted">{s.applyInvite}</p>
            <p><Link className="primary-button" to="/mentors/apply">{s.applyCta}</Link></p>
          </>}
      </section>

      {mentor && <>
        <section className="panel profile-block">
          <h2><ShieldCheck size={18} aria-hidden="true" />{s.matchingTitle}</h2>
          <p className="muted">{s.matchingText}</p>
          <ul className="score-list">
            {mentor.scores.map((score) => <li key={score.theme}>
              <div>
                <b>{t.taxonomy.themes[score.theme]}</b>
                <span className={score.active ? 'theme-pill' : 'theme-pill is-off'}>
                  {score.disabled ? s.themeOff : score.active ? s.themeActive : s.themeWeak}
                </span>
                <small className="muted">{score.reasons.map((reason) => t.journey.scoreReason(reason.code, reason.points)).join(' · ') || s.noEvidence}</small>
              </div>
              <div className="score-actions">
                <button type="button" className="ghost-button" disabled={busy}
                  onClick={() => act(() => post('/journey/profile/themes', {
                    confirmed: toggle(mentor.confirmedThemes, score.theme),
                    disabled: mentor.disabledThemes,
                  }))}
                >{mentor.confirmedThemes.includes(score.theme) ? s.removeConfirm : s.confirmStrength}</button>
                <button type="button" className="link-button" disabled={busy}
                  onClick={() => act(() => post('/journey/profile/themes', {
                    confirmed: mentor.confirmedThemes,
                    disabled: toggle(mentor.disabledThemes, score.theme),
                  }))}
                >{score.disabled ? s.reenable : s.declineTheme}</button>
              </div>
            </li>)}
          </ul>
        </section>

        <section className="panel profile-block">
          <h2>{s.tasksTitle}</h2>
          <p className="muted">{s.tasksText}</p>
          <ul className="plain-list choice-list">
            {options.map((option) => <li key={option.slug}>
              <span>{option.name}</span>
              <label className="sr-only" htmlFor={`choice-${option.slug}`}>{s.choiceLabel(option.name)}</label>
              <select id={`choice-${option.slug}`} disabled={busy} value={choiceOf(option.id)}
                onChange={(event) => act(() => post('/journey/profile/choices', { slug: option.slug, choice: event.target.value }))}
              >
                <option value="auto">{s.choiceAuto}</option>
                <option value="help">{s.choiceHelp}</option>
                <option value="exclude">{s.choiceExclude}</option>
              </select>
            </li>)}
            {!options.length && <li className="muted">{s.noOptions}</li>}
          </ul>
        </section>

        <SlotEditor slots={data.slots} busy={busy} act={act} />
      </>}

      <section className="panel profile-block">
        <h2><CalendarClock size={18} aria-hidden="true" />{s.bookings}</h2>
        {data.bookings.length ? <ul className="booking-list">
          {data.bookings.map((booking) => {
            const asMentor = booking.mentorUserId === user.id;
            const open = booking.status === 'pending' || booking.status === 'confirmed';
            return <li key={booking.id}>
              <div>
                <b>{booking.title}</b>
                <small className="muted"> · {booking.eventName} · {asMentor ? s.asMentor : s.withMentor(booking.mentorName)}</small>
                <p>{formatDateTime(booking.startsAt, lang)} – {formatTime(booking.endsAt, lang)}</p>
                <p className={`status-pill is-${booking.status}`}>{s.bookingStatus[booking.status] ?? booking.status}</p>
                <p className="booking-context"><strong>{s.teamNote}</strong><br />{booking.context}</p>
                {booking.reason && <p className="muted">{s.reason(booking.reason)}</p>}
                {booking.roomId && <p><Link to={`/chats/${booking.roomId}`}>{s.openChat}</Link></p>}
              </div>
              {open && <BookingActions booking={booking} asMentor={asMentor} busy={busy} act={act} />}
            </li>;
          })}
        </ul> : <p className="muted">{s.noBookingsBefore}<Link to="/">{s.noBookingsLink}</Link></p>}
      </section>
    </>}
  </main>;
}

const toggle = (list: Theme[], value: Theme) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

function SlotEditor({ slots, busy, act }: { slots: Slot[]; busy: boolean; act: (run: () => Promise<unknown>) => Promise<void> }) {
  const { t, lang } = useI18n();
  const s = t.profile;
  const [when, setWhen] = useState('');

  function add(event: FormEvent) {
    event.preventDefault();
    if (!when) return;
    // ช่องนี้ระบุเวลาไทยเสมอ ไม่ใช้ timezone ของเครื่องผู้ใช้
    void act(() => post('/journey/profile/slots', { startsAt: new Date(`${when}+07:00`).toISOString() }));
  }

  return <section className="panel profile-block">
    <h2>{s.slotsTitle}</h2>
    <p className="muted">{s.slotsText}</p>
    <form className="slot-form" onSubmit={add}>
      <label htmlFor="slot-start">{s.slotStart}</label>
      <input id="slot-start" type="datetime-local" required value={when} onChange={(event) => setWhen(event.target.value)} />
      <button className="ghost-button" disabled={busy}>{s.slotOpen}</button>
    </form>
    {slots.length ? <ul className="plain-list slot-list">
      {slots.map((slot) => <li key={slot.id}>
        <span>{formatDateTime(slot.startsAt, lang)}</span>
        <button type="button" className="link-button" disabled={busy}
          onClick={() => act(() => api(`/journey/profile/slots/${slot.id}`, { method: 'DELETE' }))}
        >{s.slotClose}</button>
      </li>)}
    </ul> : <p className="muted">{s.slotsEmpty}</p>}
  </section>;
}

function BookingActions({ booking, asMentor, busy, act }: {
  booking: Booking; asMentor: boolean; busy: boolean; act: (run: () => Promise<unknown>) => Promise<void>;
}) {
  const { t } = useI18n();
  const s = t.profile;
  const [reason, setReason] = useState('');
  const [noConflict, setNoConflict] = useState(false);
  const canAnswer = asMentor && booking.status === 'pending';

  return <div className="booking-actions">
    {canAnswer && <>
      <label className="chat-check">
        <input type="checkbox" checked={noConflict} onChange={(event) => setNoConflict(event.target.checked)} />
        {s.noConflict}
      </label>
      <button type="button" className="primary-button" disabled={busy}
        onClick={() => act(() => post(`/journey/bookings/${booking.id}/respond`, { action: 'accept', noConflict }))}
      >{s.accept}</button>
    </>}
    <label>{s.reasonLabel}
      <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} />
    </label>
    <div className="booking-buttons">
      {canAnswer && <button type="button" className="ghost-button" disabled={busy}
        onClick={() => act(() => post(`/journey/bookings/${booking.id}/respond`, { action: 'decline', reason }))}
      >{s.decline}</button>}
      <button type="button" className="link-button" disabled={busy}
        onClick={() => act(() => post(`/journey/bookings/${booking.id}/respond`, { action: 'cancel', reason }))}
      >{s.cancelBooking}</button>
    </div>
  </div>;
}
