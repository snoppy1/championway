import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, KeyRound, Mail } from 'lucide-react';
import { ApiError, post } from '../lib/api';
import { useI18n } from '../i18n';

/* ลืมรหัสผ่าน: /forgot-password ขอลิงก์ทางอีเมล แล้วลิงก์ในอีเมลพามาที่ /reset-password?token=… เพื่อตั้งรหัสใหม่
   อยู่ใต้ AuthLayout เหมือนหน้าเข้าสู่ระบบ ตั้งรหัสเสร็จแล้วต้องเข้าสู่ระบบใหม่ เพราะเซิร์ฟเวอร์เตะทุกอุปกรณ์ออก */

export function ForgotPassword() {
  const { t } = useI18n();
  const s = t.passwordReset;
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = `${s.forgotTitle} — ChampionWays`; }, [s.forgotTitle]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      await post<unknown>('/auth/password/forgot', { email: email.trim() });
      setSent(true);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : t.signIn.unreachable);
    } finally {
      setBusy(false);
    }
  }

  return <main id="main" tabIndex={-1} className="auth-main">
    <div className="auth-card">
      <span className="auth-tape auth-tape--card" aria-hidden="true" />
      <p className="eyebrow">ChampionWays</p>
      <h1>{s.forgotTitle}</h1>
      {sent ? <>
        {/* ข้อความเดียวกันไม่ว่าจะมีบัญชีหรือไม่ ไม่บอกว่าอีเมลนี้สมัครไว้ */}
        <p className="auth-lead" role="status">{s.sentText(email.trim())}</p>
        <button type="button" className="ghost-button auth-submit" onClick={() => setSent(false)}>{s.sendAgain}</button>
      </> : <>
        <p className="auth-lead">{s.forgotLead}</p>
        <form onSubmit={submit} noValidate>
          <label>
            {t.signIn.email}
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          </label>
          <p className="auth-message" role="alert">{message}</p>
          <button className="primary-button auth-submit" type="submit" disabled={busy}>
            <Mail size={17} aria-hidden="true" />{busy ? t.signIn.busy : s.sendLink}
          </button>
        </form>
      </>}
      <p className="auth-swap">
        {s.remembered}
        <Link to="/signin">{t.signIn.titleIn}<ArrowRight size={14} aria-hidden="true" /></Link>
      </p>
    </div>
  </main>;
}

export function ResetPassword() {
  const { t } = useI18n();
  const s = t.passwordReset;
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = `${s.resetTitle} — ChampionWays`; }, [s.resetTitle]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) { setMessage(s.mismatch); return; }
    setMessage('');
    setBusy(true);
    try {
      await post<unknown>('/auth/password/reset', { token, password });
      setDone(true);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : t.signIn.unreachable);
    } finally {
      setBusy(false);
    }
  }

  return <main id="main" tabIndex={-1} className="auth-main">
    <div className="auth-card">
      <span className="auth-tape auth-tape--card" aria-hidden="true" />
      <p className="eyebrow">ChampionWays</p>
      {done ? <>
        <h1>{s.doneTitle}</h1>
        <p className="auth-lead" role="status">{s.doneText}</p>
        <Link className="primary-button auth-submit" to="/signin">{t.signIn.titleIn}</Link>
      </> : !token ? <>
        <h1>{s.resetTitle}</h1>
        <p className="auth-lead">{s.missingToken}</p>
        <Link className="primary-button auth-submit" to="/forgot-password">{s.requestNew}</Link>
      </> : <>
        <h1>{s.resetTitle}</h1>
        <p className="auth-lead">{s.resetLead}</p>
        <form onSubmit={submit} noValidate>
          <label>
            {s.newPassword}
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
            <small>{t.signIn.passwordHint}</small>
          </label>
          <label>
            {s.confirmPassword}
            <input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" required />
          </label>
          <p className="auth-message" role="alert">{message}</p>
          <button className="primary-button auth-submit" type="submit" disabled={busy}>
            <KeyRound size={17} aria-hidden="true" />{busy ? t.signIn.busy : s.save}
          </button>
        </form>
        <p className="auth-swap"><Link to="/forgot-password">{s.requestNew}<ArrowRight size={14} aria-hidden="true" /></Link></p>
      </>}
    </div>
  </main>;
}
