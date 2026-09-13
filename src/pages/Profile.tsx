import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { CalendarClock, KeyRound, MessageCircle, Pencil, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../data/auth';
import { api, post, ApiError } from '../lib/api';
import { themes, thaiTime } from '../data/focus';
import type { Theme } from '../data/focus';
import { currentRoleLine, notFilled, personLevels } from '../data/profile';
import type { PersonLevel } from '../data/profile';
import '../journey.css';

/* หน้าโปรไฟล์เป็นศูนย์รวมของผู้ใช้คนเดียว: บัญชี ใบสมัครเมนเทอร์ คิวที่เปิดไว้ และนัดทั้งหมด
   ทางเข้าสมัครเป็นเมนเทอร์ย้ายมาอยู่ที่นี่ แทนที่จะเป็นหน้าเลือกเมนเทอร์แบบเดิม

   ทุกอย่างอ่านจาก /api/journey/profile คำขอเดียว เพื่อให้สถานะที่เห็นเป็นชุดเดียวกันเสมอ */

type Score = { theme: Theme; score: number; active: boolean; disabled: boolean; reasons: string[] };
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

const applicationLabel: Record<string, string> = {
  pending: 'รอตรวจสอบ', info: 'ทีมงานขอข้อมูลเพิ่มเติม',
  published: 'อนุมัติแล้ว', rejected: 'ไม่อนุมัติ',
};
const bookingLabel: Record<string, string> = {
  pending: 'รอเมนเทอร์ยืนยัน', confirmed: 'ยืนยันแล้ว', declined: 'เมนเทอร์ปฏิเสธ',
  cancelled: 'ยกเลิกแล้ว', expired: 'หมดอายุ', elapsed: 'พ้นเวลานัดแล้ว',
};
const errorText = (failure: unknown) => (failure instanceof ApiError ? failure.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ');

export function Profile() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<Profile>();
  const [options, setOptions] = useState<Option[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api<Profile>('/journey/profile')); } catch (failure) { setError(errorText(failure)); }
  }, []);

  useEffect(() => {
    document.title = 'โปรไฟล์ของฉัน — ChampionWays';
    if (!user) return;
    void load();
    api<{ items: Option[] }>('/competitions/options').then((result) => setOptions(result.items)).catch(() => setOptions([]));
  }, [user, load]);

  if (authLoading) return <main id="main" className="shell page">กำลังโหลดบัญชี…</main>;
  if (!user) return <Navigate to="/signin?next=/profile" replace />;

  /** ทุกปุ่มในหน้านี้เปลี่ยนข้อมูลฝั่งเซิร์ฟเวอร์ จึงโหลดสถานะใหม่ทุกครั้งหลังทำสำเร็จ */
  async function act(run: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try { await run(); await load(); } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  }

  const mentor = data?.mentor;
  const choiceOf = (id: string) => data?.choices.find((item) => item.competitionId === id)?.choice ?? 'auto';

  return <main id="main" tabIndex={-1} className="shell page journey-page">
    <header className="profile-head">
      {user.avatarUrl
        ? <img className="profile-avatar" src={user.avatarUrl} alt="" width={58} height={58} />
        : <span className="profile-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>}
      <div>
        <p className="eyebrow">โปรไฟล์ของฉัน</p>
        <h1>{user.name}</h1>
        <p className="muted">{user.email}</p>
      </div>
      <p className="profile-head-actions">
        <Link className="primary-button" to="/profile/edit"><Pencil size={16} aria-hidden="true" />แก้ไขโปรไฟล์</Link>
        <Link className="ghost-button" to="/chats"><MessageCircle size={16} aria-hidden="true" />แชตของฉัน</Link>
      </p>
    </header>

    {error && <p className="auth-message" role="alert">{error}</p>}
    {!data && !error && <p role="status">กำลังโหลดข้อมูล…</p>}

    {/* ข้อมูลส่วนนี้อ่านจาก context ของบัญชี ไม่ใช่จาก /journey/profile
        จึงยังแสดงได้แม้ส่วนเมนเทอร์ด้านล่างจะโหลดไม่สำเร็จ */}
    <section className="panel profile-block">
      <h2><UserRound size={18} aria-hidden="true" />ข้อมูลของฉัน</h2>
      <dl className="fact-list">
        <div><dt>แนะนำตัว</dt><dd>{user.bio || <span className="muted">{notFilled}</span>}</dd></div>
        <div>
          <dt>กำลังเรียนหรือทำงาน</dt>
          <dd>{currentRoleLine(user) || <span className="muted">{notFilled}</span>}</dd>
        </div>
        <div>
          <dt>ระดับการศึกษา</dt>
          <dd>{user.educationLevel && user.educationLevel !== 'open'
            ? personLevels[user.educationLevel as PersonLevel]
            : <span className="muted">{notFilled}</span>}</dd>
        </div>
      </dl>
    </section>

    <section className="panel profile-block">
      <h2><KeyRound size={18} aria-hidden="true" />บัญชีและความปลอดภัย</h2>
      <dl className="fact-list">
        <div><dt>อีเมล</dt><dd>{user.email}</dd></div>
        <div>
          <dt>รหัสผ่าน</dt>
          <dd>{user.hasPassword ? 'ตั้งไว้แล้ว' : <span className="muted">ยังไม่ได้ตั้ง เข้าระบบด้วย Google อย่างเดียว</span>}</dd>
        </div>
        <div>
          <dt>เข้าสู่ระบบด้วย Google</dt>
          <dd>{user.googleLinked ? 'ผูกไว้แล้ว' : <span className="muted">ยังไม่ได้ผูก</span>}</dd>
        </div>
      </dl>
    </section>

    {data && <>
      <section className="panel profile-block">
        <h2><ShieldCheck size={18} aria-hidden="true" />การเป็นเมนเทอร์</h2>
        {mentor ? <p className="muted">โปรไฟล์เมนเทอร์ของคุณเผยแพร่แล้ว ดูหน้าสาธารณะได้ที่ <Link to={`/mentors/${mentor.id}`}>โปรไฟล์เมนเทอร์</Link></p>
          : data.applications.length ? <ul className="plain-list">
            {data.applications.map((item) => <li key={item.id}>
              <b>{applicationLabel[item.status] ?? item.status}</b>
              <small className="muted"> · ส่งเมื่อ {thaiTime(item.submittedAt)}</small>
            </li>)}
          </ul> : <>
            <p className="muted">แบ่งปันประสบการณ์จากเวทีที่เคยผ่านมา ช่วยทีมที่กำลังเตรียมตัวแข่ง</p>
            <p><Link className="primary-button" to="/mentors/apply">สมัครเป็นเมนเทอร์</Link></p>
          </>}
      </section>

      {mentor && <>
        <section className="panel profile-block">
          <h2><ShieldCheck size={18} aria-hidden="true" />ความถนัดที่ใช้จับคู่</h2>
          <p className="muted">
            ระบบประเมินจากประสบการณ์และผลงานที่ผู้ตรวจยืนยัน คุณยืนยันหรือปิดหมวดได้
            แต่แก้สถานะ “ผลงานผ่านตรวจ” เองไม่ได้
          </p>
          <ul className="score-list">
            {mentor.scores.map((score) => <li key={score.theme}>
              <div>
                <b>{themes[score.theme]}</b>
                <span className={score.active ? 'theme-pill' : 'theme-pill is-off'}>
                  {score.disabled ? 'ปิดไว้' : score.active ? 'ใช้จับคู่' : 'ยังไม่พอ'}
                </span>
                <small className="muted">{score.reasons.join(' · ') || 'ยังไม่มีหลักฐานในหมวดนี้'}</small>
              </div>
              <div className="score-actions">
                <button type="button" className="ghost-button" disabled={busy}
                  onClick={() => act(() => post('/journey/profile/themes', {
                    confirmed: toggle(mentor.confirmedThemes, score.theme),
                    disabled: mentor.disabledThemes,
                  }))}
                >{mentor.confirmedThemes.includes(score.theme) ? 'เอาการยืนยันออก' : 'ยืนยันว่าถนัด'}</button>
                <button type="button" className="link-button" disabled={busy}
                  onClick={() => act(() => post('/journey/profile/themes', {
                    confirmed: mentor.confirmedThemes,
                    disabled: toggle(mentor.disabledThemes, score.theme),
                  }))}
                >{score.disabled ? 'เปิดใช้อีกครั้ง' : 'ไม่รับงานหมวดนี้'}</button>
              </div>
            </li>)}
          </ul>
        </section>

        <section className="panel profile-block">
          <h2>งานที่ฉันช่วยได้</h2>
          <p className="muted">
            เลือก “ช่วยงานนี้” เพื่อขึ้นเป็นลำดับแรกของเวทีนั้น หรือ “ไม่รับงานนี้”
            เมื่อมีผลประโยชน์ขัดกัน เช่น เป็นกรรมการตัดสิน
          </p>
          <ul className="plain-list choice-list">
            {options.map((option) => <li key={option.slug}>
              <span>{option.name}</span>
              <label className="sr-only" htmlFor={`choice-${option.slug}`}>การรับงาน {option.name}</label>
              <select id={`choice-${option.slug}`} disabled={busy} value={choiceOf(option.id)}
                onChange={(event) => act(() => post('/journey/profile/choices', { slug: option.slug, choice: event.target.value }))}
              >
                <option value="auto">ตามความถนัด</option>
                <option value="help">ช่วยงานนี้</option>
                <option value="exclude">ไม่รับงานนี้</option>
              </select>
            </li>)}
            {!options.length && <li className="muted">ยังไม่มีเวทีที่จัดประเภทแล้วในระบบ</li>}
          </ul>
        </section>

        <SlotEditor slots={data.slots} busy={busy} act={act} />
      </>}

      <section className="panel profile-block">
        <h2><CalendarClock size={18} aria-hidden="true" />นัดของฉัน</h2>
        {data.bookings.length ? <ul className="booking-list">
          {data.bookings.map((booking) => {
            const asMentor = booking.mentorUserId === user.id;
            const open = booking.status === 'pending' || booking.status === 'confirmed';
            return <li key={booking.id}>
              <div>
                <b>{booking.title}</b>
                <small className="muted"> · {booking.eventName} · {asMentor ? 'คุณเป็นเมนเทอร์' : `เมนเทอร์ ${booking.mentorName}`}</small>
                <p>{thaiTime(booking.startsAt)} – {new Date(booking.endsAt).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' })}</p>
                <p className={`status-pill is-${booking.status}`}>{bookingLabel[booking.status] ?? booking.status}</p>
                {booking.reason && <p className="muted">เหตุผล: {booking.reason}</p>}
                {booking.roomId && <p><Link to={`/chats/${booking.roomId}`}>เปิดแชตของนัดนี้</Link></p>}
              </div>
              {open && <BookingActions booking={booking} asMentor={asMentor} busy={busy} act={act} />}
            </li>;
          })}
        </ul> : <p className="muted">ยังไม่มีนัด เริ่มจากเลือกเวทีที่ <Link to="/explore">อยากแข่งงานไหน</Link></p>}
      </section>
    </>}
  </main>;
}

const toggle = (list: Theme[], value: Theme) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

function SlotEditor({ slots, busy, act }: { slots: Slot[]; busy: boolean; act: (run: () => Promise<unknown>) => Promise<void> }) {
  const [when, setWhen] = useState('');

  function add(event: FormEvent) {
    event.preventDefault();
    if (!when) return;
    // ช่องกรอกเป็นเวลาในเครื่องผู้ใช้ ส่งเป็น ISO พร้อม offset ให้เซิร์ฟเวอร์เก็บ UTC
    void act(() => post('/journey/profile/slots', { startsAt: new Date(when).toISOString() })).then(() => setWhen(''));
  }

  return <section className="panel profile-block">
    <h2>ช่องเวลาที่เปิดให้จอง</h2>
    <p className="muted">ครั้งละ 60 นาที เวลาไทย ทีมที่สนใจจะเห็นเฉพาะช่องที่ยังว่าง</p>
    <form className="slot-form" onSubmit={add}>
      <label htmlFor="slot-start">เริ่มเมื่อ</label>
      <input id="slot-start" type="datetime-local" required value={when} onChange={(event) => setWhen(event.target.value)} />
      <button className="ghost-button" disabled={busy}>เปิดช่องเวลา</button>
    </form>
    {slots.length ? <ul className="plain-list slot-list">
      {slots.map((slot) => <li key={slot.id}>
        <span>{thaiTime(slot.startsAt)}</span>
        <button type="button" className="link-button" disabled={busy}
          onClick={() => act(() => api(`/journey/profile/slots/${slot.id}`, { method: 'DELETE' }))}
        >ปิดช่องนี้</button>
      </li>)}
    </ul> : <p className="muted">ยังไม่ได้เปิดช่องเวลา ทีมจึงยังขอจองไม่ได้</p>}
  </section>;
}

function BookingActions({ booking, asMentor, busy, act }: {
  booking: Booking; asMentor: boolean; busy: boolean; act: (run: () => Promise<unknown>) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [noConflict, setNoConflict] = useState(false);
  const canAnswer = asMentor && booking.status === 'pending';

  return <div className="booking-actions">
    {canAnswer && <>
      <label className="chat-check">
        <input type="checkbox" checked={noConflict} onChange={(event) => setNoConflict(event.target.checked)} />
        ยืนยันว่าไม่ได้เป็นกรรมการตัดสินทีมนี้
      </label>
      <button type="button" className="primary-button" disabled={busy}
        onClick={() => act(() => post(`/journey/bookings/${booking.id}/respond`, { action: 'accept', noConflict }))}
      >รับคำขอและเปิดแชต</button>
    </>}
    <label>เหตุผล (ต้องกรอกเมื่อปฏิเสธหรือยกเลิก)
      <input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} />
    </label>
    <div className="booking-buttons">
      {canAnswer && <button type="button" className="ghost-button" disabled={busy}
        onClick={() => act(() => post(`/journey/bookings/${booking.id}/respond`, { action: 'decline', reason }))}
      >ปฏิเสธ</button>}
      <button type="button" className="link-button" disabled={busy}
        onClick={() => act(() => post(`/journey/bookings/${booking.id}/respond`, { action: 'cancel', reason }))}
      >ยกเลิกนัด</button>
    </div>
  </div>;
}
