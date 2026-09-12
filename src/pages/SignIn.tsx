import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../data/auth';
import { ApiError } from '../lib/api';
import { safeNext } from '../lib/safe-next';


export function SignIn({ mode }: { mode: 'signin' | 'signup' }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, loading, googleEnabled, signIn, signUp } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState(params.get('error') ?? '');
  const [busy, setBusy] = useState(false);

  const next = safeNext(params.get('next'));
  const signup = mode === 'signup';

  useEffect(() => {
    document.title = `${signup ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'} — ChampionWays`;
  }, [signup]);

  // ล็อกอินอยู่แล้วก็ไม่ต้องเห็นหน้านี้
  useEffect(() => {
    if (!loading && user) navigate(next, { replace: true });
  }, [loading, user, next, navigate]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      if (signup) await signUp(name.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
      navigate(next, { replace: true });
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return <main id="main" tabIndex={-1} className="shell page auth-page">
    <div className="auth-card">
      <p className="eyebrow">ChampionWays</p>
      <h1>{signup ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</h1>
      <p className="auth-lead">
        {signup
          ? 'สมัครไว้เพื่อลงงานแข่ง สมัครเป็นเมนเทอร์ และตามสถานะใบที่ส่งไว้'
          : 'เข้าสู่ระบบเพื่อลงงานแข่ง สมัครเป็นเมนเทอร์ และดูใบที่ส่งไว้'}
      </p>

      {googleEnabled && <>
        {/* ลิงก์ธรรมดา ไม่ใช่ fetch เพราะต้องให้เบราว์เซอร์พาไปหน้า Google จริง */}
        <a className="google-button" href={`/api/auth/google?next=${encodeURIComponent(next)}`}>
          <GoogleMark />เข้าสู่ระบบด้วย Google
        </a>
        <p className="auth-divider"><span>หรือใช้อีเมล</span></p>
      </>}

      <form onSubmit={submit} noValidate>
        {signup && <label>
          ชื่อที่ใช้แสดง
          <input
            value={name} onChange={(event) => setName(event.target.value)}
            autoComplete="name" required maxLength={80}
          />
        </label>}

        <label>
          อีเมล
          <input
            type="email" value={email} onChange={(event) => setEmail(event.target.value)}
            autoComplete="email" required
          />
        </label>

        <label>
          รหัสผ่าน
          <input
            type="password" value={password} onChange={(event) => setPassword(event.target.value)}
            autoComplete={signup ? 'new-password' : 'current-password'} required
          />
          {signup && <small>อย่างน้อย 10 ตัวอักษร ยาวสำคัญกว่าอักขระพิเศษ</small>}
        </label>

        <p className="auth-message" role="alert">{message}</p>

        <button className="primary-button auth-submit" type="submit" disabled={busy}>
          {signup ? <UserPlus size={17} aria-hidden="true" /> : <LogIn size={17} aria-hidden="true" />}
          {busy ? 'กำลังดำเนินการ' : signup ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}
        </button>
      </form>

      <p className="auth-swap">
        {signup ? 'มีบัญชีอยู่แล้ว' : 'ยังไม่มีบัญชี'}
        <Link to={`${signup ? '/signin' : '/signup'}${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`}>
          {signup ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}<ArrowRight size={14} aria-hidden="true" />
        </Link>
      </p>

      {pathname === '/signin' && <p className="auth-note">
        บัญชีทีมตรวจสร้างจากฝั่งเซิร์ฟเวอร์เท่านั้น สมัครเองแล้วจะยังเป็นสมาชิกทั่วไป
      </p>}
    </div>
  </main>;
}

function GoogleMark() {
  return <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z" />
    <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.27-3.15.76-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19Z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
  </svg>;
}
