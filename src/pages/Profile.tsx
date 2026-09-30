import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { KeyRound, MessagesSquare, Pencil, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../data/auth';
import { api, post, ApiError } from '../lib/api';
import { VerifyEmailNotice } from '../components/VerifyEmailNotice';
import { useApi } from '../lib/useApi';
import type { Theme } from '../data/focus';
import type { ScoreReason } from '../data/focus';
import { currentRoleLine } from '../data/profile';
import type { PersonLevel } from '../data/profile';
import { useI18n } from '../i18n';
import { formatDateTime } from '../i18n/format';
import '../journey.css';

/* หน้าโปรไฟล์เป็นศูนย์รวมของผู้ใช้คนเดียว: บัญชี สถานะยืนยันอีเมล และใบสมัครเมนเทอร์
   การจองและแชตในเว็บปิดถาวรแล้ว นักเรียนติดต่อเมนเทอร์นอกเว็บ (ดูหน้า Consulting กับ Mentor zone)

   ข้อมูลเมนเทอร์อ่านจาก /api/journey/profile คำขอเดียว เพื่อให้สถานะที่เห็นเป็นชุดเดียวกันเสมอ */

type Score = { theme: Theme; score: number; active: boolean; disabled: boolean; reasons: ScoreReason[] };
type Mentor = {
  id: string; name: string; avatar: string; bio: string;
  scores: Score[]; awards: { title: string; year: number; themes: Theme[] }[];
  /* สองรายการนี้คือสิ่งที่เมนเทอร์กดเอง ไม่ใช่ผลการคำนวณ ต้องส่งกลับไปทั้งชุดทุกครั้งที่บันทึก
     ถ้าเดาจากคะแนนแทน หมวดที่ได้คะแนนจากผลงานจะถูกนับเป็น "ยืนยันเอง" ไปด้วย */
  confirmedThemes: Theme[]; disabledThemes: Theme[];
};
type Profile = {
  user: { id: string; name: string; email: string; role: string };
  applications: { id: string; status: string; submittedAt: string }[];
  mentor: Mentor | null;
};

// ข้อความ error จากเซิร์ฟเวอร์แปลมาให้แล้วตาม x-lang ส่วนกรณีติดต่อเซิร์ฟเวอร์ไม่ได้ใช้ข้อความสำรองของหน้านี้
const errorText = (failure: unknown, fallback: string) => (failure instanceof ApiError ? failure.message : fallback);

export function Profile() {
  const { t, lang } = useI18n();
  const s = t.profile;
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<Profile>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: me } = useApi<{ mentorId: string | null }>(user ? '/consult/me' : null);

  const load = useCallback(async () => {
    try { setData(await api<Profile>('/journey/profile')); } catch (failure) { setError(errorText(failure, s.unreachable)); }
  }, [s.unreachable]);

  useEffect(() => {
    document.title = `${s.pageTitle} — ChampionWays`;
    if (!user) return;
    void load();
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
        {me?.mentorId
          ? <Link className="ghost-button" to="/mentor-zone"><MessagesSquare size={16} aria-hidden="true" />{s.mentorZone}</Link>
          : <Link className="ghost-button" to="/consulting"><MessagesSquare size={16} aria-hidden="true" />{s.consulting}</Link>}
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

    {!user.emailVerified && <VerifyEmailNotice />}

    <section className="panel profile-block">
      <h2><KeyRound size={18} aria-hidden="true" />{s.accountSecurity}</h2>
      <dl className="fact-list">
        <div><dt>{s.email}</dt><dd>{user.email}</dd></div>
        <div>
          <dt>{s.emailStatus}</dt>
          <dd>{user.emailVerified
            ? <><span className="cx-pill cx-pill--confirmed">{t.consult.verifiedPill}</span> <span className="muted">{s.emailVerifiedText}</span></>
            : <span className="cx-pill cx-pill--cancelled">{t.consult.unverifiedPill}</span>}</dd>
        </div>
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
        {mentor ? <>
          <p className="muted">{s.mentorPublishedBefore}<Link to={`/mentors/${mentor.id}`}>{s.mentorPublishedLink}</Link></p>
          <p className="muted">{s.mentorZoneBefore}<Link to="/mentor-zone">{s.mentorZoneLink}</Link></p>
        </>
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
      </>}

    </>}
  </main>;
}

const toggle = (list: Theme[], value: Theme) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
