import { useId, useState } from 'react';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../data/auth';
import { ApiError, post } from '../lib/api';
import { useI18n } from '../i18n';
import '../consult.css';

/* บัญชีที่ยังไม่ยืนยันอีเมลเห็นช่องทางติดต่อเมนเทอร์และรีวิวไม่ได้ กล่องนี้บอกเหตุผลและให้ส่งลิงก์ยืนยันได้ตรงนั้นเลย
   บัญชี Google ยืนยันแล้วตั้งแต่สมัคร จึงไม่เห็นกล่องนี้ เซิร์ฟเวอร์จำกัดการส่งซ้ำไว้ที่ 60 วินาที (ตอบ 429) */
type Phase = 'idle' | 'sending' | 'sent' | 'failed';

export function VerifyEmailNotice() {
  const { t } = useI18n();
  const s = t.consult;
  const { user, refresh } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const titleId = useId();
  if (!user || user.emailVerified) return null;

  async function send() {
    setPhase('sending');
    setMessage('');
    try {
      const result = await post<{ ok: boolean; alreadyVerified: boolean }>('/auth/email/verify/send', {});
      // ยืนยันไปแล้วในอีกแท็บ อ่านสถานะใหม่ กล่องนี้จะหายไปเอง
      if (result.alreadyVerified) { await refresh(); return; }
      setPhase('sent');
      setMessage(s.verifySent(user!.email));
    } catch (failure) {
      setPhase('failed');
      setMessage(failure instanceof ApiError && failure.status === 429 ? s.verifyTooSoon : s.verifyFailed);
    }
  }

  return <section className="cx-notice" aria-labelledby={titleId}>
    <MailCheck className="cx-notice__icon" aria-hidden="true" />
    <div className="cx-notice__body">
      <p className="cx-notice__title" id={titleId}>{s.verifyTitle}</p>
      <p>{s.verifyText(user.email)}</p>
      <button type="button" className="ghost-button cx-button" disabled={phase === 'sending'} onClick={() => { void send(); }}>
        {phase === 'sending' ? s.verifySending : s.verifySend}
      </button>
      <p className={phase === 'failed' ? 'cx-message cx-message--error' : 'cx-message'} role={phase === 'failed' ? 'alert' : 'status'}>{message}</p>
    </div>
  </section>;
}
