import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { useAuth } from '../data/auth';
import { ApiError, post } from '../lib/api';
import { useI18n } from '../i18n';
import '../consult.css';

/* หน้าที่ลิงก์ในอีเมลยืนยันพามาเปิด (/verify-email?token=…) ส่ง token ตอนโหลดหน้าเลย ไม่ต้องกดปุ่มอีก
   token ใช้ได้ครั้งเดียว และ StrictMode ตอน dev เรียก effect สองรอบ ถ้ายิงสองครั้งรอบสองจะได้ "ใช้ไปแล้ว"
   จึงเก็บคำขอของแต่ละ token ไว้ที่ระดับโมดูล ให้ทั้งสองรอบรอผลของคำขอเดียวกัน */

type Phase = 'working' | 'ok' | 'failed' | 'unreachable' | 'missing';
const attempts = new Map<string, Promise<void>>();

function verify(token: string) {
  let attempt = attempts.get(token);
  if (!attempt) {
    attempt = post<unknown>('/auth/email/verify', { token }).then(() => undefined);
    attempts.set(token, attempt);
    // ลองใหม่ได้เมื่อเครือข่ายล้ม แต่ถ้าเซิร์ฟเวอร์ปฏิเสธแล้ว (ใช้ไปแล้วหรือหมดอายุ) ผลนั้นคือคำตอบสุดท้าย
    attempt.catch((failure: unknown) => { if (!(failure instanceof ApiError)) attempts.delete(token); });
  }
  return attempt;
}

export function VerifyEmail() {
  const { t } = useI18n();
  const s = t.verifyEmail;
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { user, refresh } = useAuth();
  const [phase, setPhase] = useState<Phase>(token ? 'working' : 'missing');
  const [tries, setTries] = useState(0);

  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);

  useEffect(() => {
    if (!token) { setPhase('missing'); return; }
    let cancelled = false;
    setPhase('working');
    verify(token)
      .then(async () => {
        await refresh();
        if (!cancelled) setPhase('ok');
      })
      .catch((failure: unknown) => {
        if (!cancelled) setPhase(failure instanceof ApiError ? 'failed' : 'unreachable');
      });
    return () => { cancelled = true; };
  }, [token, tries, refresh]);

  return <main id="main" tabIndex={-1} className="shell page cx-page">
    <div className="cx-verify" role={phase === 'working' ? 'status' : undefined}>
      {phase === 'working' && <>
        <LoaderCircle className="cx-verify__icon cx-spin" aria-hidden="true" />
        <h1>{s.verifying}</h1>
      </>}
      {phase === 'ok' && <>
        <CircleCheck className="cx-verify__icon cx-verify__icon--ok" aria-hidden="true" />
        <h1>{s.successTitle}</h1>
        <p>{s.successText}</p>
        <div className="cx-row cx-row--center">
          <Link className="primary-button cx-button" to="/explore">{s.toExplore}</Link>
          <Link className="ghost-button cx-button" to="/consulting">{s.toConsulting}</Link>
        </div>
      </>}
      {(phase === 'failed' || phase === 'missing') && <>
        <CircleAlert className="cx-verify__icon cx-verify__icon--bad" aria-hidden="true" />
        <h1>{phase === 'missing' ? s.missingTitle : s.failTitle}</h1>
        <p>{phase === 'missing' ? s.missingText : s.failText}</p>
        <div className="cx-row cx-row--center">
          {/* ขอลิงก์ใหม่ทำได้จากส่วนบัญชีในหน้าโปรไฟล์ */}
          <Link className="primary-button cx-button" to={user ? '/profile' : '/signin?next=/profile'}>
            {user ? s.requestNew : s.signInToRequest}
          </Link>
        </div>
      </>}
      {phase === 'unreachable' && <>
        <CircleAlert className="cx-verify__icon cx-verify__icon--bad" aria-hidden="true" />
        <h1>{s.failTitle}</h1>
        <p role="alert">{s.unreachable}</p>
        <div className="cx-row cx-row--center">
          <button type="button" className="primary-button cx-button" onClick={() => setTries((count) => count + 1)}>{s.retry}</button>
        </div>
      </>}
    </div>
  </main>;
}
