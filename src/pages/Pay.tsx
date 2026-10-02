import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { useAuth } from '../data/auth';
import { ApiError, api, post } from '../lib/api';
import { useApi } from '../lib/useApi';
import type { MemberHire } from '../data/consult';
import { useI18n } from '../i18n';
import '../consult.css';

/* หน้าเกี่ยวกับการจ่ายเงินของงานจ้าง (ผู้ให้บริการจริงคือ Opn Payments ยังไม่ต่อ)
   /pay/simulated  หน้าจ่ายเงินจำลองสำหรับ dev และเทส บอกชัดว่าไม่มีเงินจริง ไม่มีบน Production (เซิร์ฟเวอร์ตอบ 404)
   /pay/return     หน้าที่ผู้ให้บริการพากลับมาหลังจ่าย ถามสถานะจนรู้ผล (ผู้ให้บริการยืนยันผ่าน webhook อาจช้ากว่าที่ผู้ใช้กลับมา)
   ยอดเงินมาจากเซิร์ฟเวอร์เสมอ หน้านี้แค่แสดงและส่งคำสั่ง */

type Payment = {
  status: 'pending' | 'paid' | 'failed' | 'refunded'; amount: number; provider: string;
  hire: { id: string; status: string; roomId: string | null };
};

function useCurrent(path: string) {
  const { t } = useI18n();
  const { user, loading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const payment = params.get('payment') ?? '';
  const state = useApi<Payment>(user && payment ? `/consult/payments/${encodeURIComponent(payment)}` : null);
  useEffect(() => { document.title = `${t.pay.pageTitle} — ChampionWays`; }, [t.pay.pageTitle]);
  return { payment, user, authLoading, next: `${path}?payment=${encodeURIComponent(payment)}`, ...state };
}

export function PaySimulated() {
  const { t } = useI18n();
  const s = t.pay;
  const navigate = useNavigate();
  const { payment, user, authLoading, next, data, error, loading, reload } = useCurrent('/pay/simulated');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  // บรรทัดสรุปว่าจ่ายให้ใคร: ชื่อเมนเทอร์ ระยะเวลา เวที มาจาก /consult/mine ตาม id งาน (รายการจ่ายเงินไม่มีข้อมูลเหล่านี้)
  const mine = useApi<{ items: MemberHire[] }>(data ? '/consult/mine' : null);
  const hireInfo = mine.data?.items.find((item) => item.id === data?.hire.id);

  if (authLoading) return <main id="main" tabIndex={-1} className="shell page"><p className="side-note" role="status">{s.loading}</p></main>;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(next)}`} replace />;

  async function simulate() {
    setBusy(true);
    setMessage('');
    setFailed(false);
    try {
      const result = await post<{ roomId: string | null; opened: boolean }>(`/consult/payments/${encodeURIComponent(payment)}/simulate`, {});
      if (result.opened && result.roomId) {
        setMessage(s.paid);
        navigate(`/consulting#room-${result.roomId}`);
        return;
      }
      // จ่ายซ้อนจากอีกแท็บหลังงานถูกจ่ายหรือปิดไปแล้ว: เซิร์ฟเวอร์คืนเงินให้และไม่เปิดแชตซ้ำ
      setMessage(s.refunded);
      reload();
    } catch (failure) {
      setFailed(true);
      setMessage(failure instanceof ApiError && failure.status === 409 ? s.alreadyPaid : t.errors.unreachable);
      reload();
    } finally {
      setBusy(false);
    }
  }

  return <main id="main" tabIndex={-1} className="shell page cx-page">
    <div className="cx-pay panel">
      <h1>{s.pageTitle}</h1>
      <p className="cx-test-banner"><span className="cx-tag">{s.testTag}</span>{s.testBanner}</p>
      <p className="cx-hint">{s.testOnly}</p>
      {loading && !data && <p className="side-note" role="status">{s.loading}</p>}
      {error && !data && <div className="cx-state cx-state--error" role="alert">
        <h2>{s.errorTitle}</h2>
        <p>{error}</p>
        <button type="button" className="ghost-button cx-button" onClick={reload}>{s.retry}</button>
      </div>}
      {data && <>
        <div>
          {hireInfo && <p className="cx-pay__for">{[hireInfo.mentor.name, t.consult.duration(hireInfo.minutes), hireInfo.competition?.name].filter(Boolean).join(' · ')}</p>}
          <p className="cx-hint">{s.amountLabel}</p>
          <p className="cx-pay__amount">{t.price.total(data.amount)}</p>
        </div>
        {data.status === 'pending' && <div className="cx-paybox">
          <button type="button" className="primary-button cx-button" disabled={busy} onClick={() => { void simulate(); }}>
            {busy ? s.paying : s.payTest}</button>
          <p className="cx-hint cx-paybox__promise">{s.heldNote}</p>
        </div>}
        {data.status === 'paid' && <p className="cx-note">{s.alreadyPaid}</p>}
        {data.status === 'refunded' && <p className="cx-note">{s.refunded}</p>}
        {data.status === 'failed' && <p className="cx-note">{s.failed}</p>}
        <p className={failed ? 'cx-message cx-message--error' : 'cx-message cx-message--ok'} role={failed ? 'alert' : 'status'}>{message}</p>
        <Link className="link-button cx-link cx-link--back" to={data.hire.roomId ? `/consulting#room-${data.hire.roomId}` : `/consulting#hire-${data.hire.id}`}>
          <ArrowLeft size={16} aria-hidden="true" />{s.toConsulting}</Link>
      </>}
    </div>
  </main>;
}

/** ถามสถานะทุก 2 วินาที สูงสุดราว 90 วินาที เกิน 20 วินาทีแล้วบอกให้รอหรือกลับมาดูทีหลัง */
export function PayReturn() {
  const { t } = useI18n();
  const s = t.pay;
  const navigate = useNavigate();
  const { payment, user, authLoading, next } = useCurrent('/pay/return');
  const [result, setResult] = useState<Payment | null>(null);
  const [slow, setSlow] = useState(false);
  const stopped = useRef(false);

  useEffect(() => {
    if (!user || !payment) return;
    stopped.current = false;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const current = await api<Payment>(`/consult/payments/${encodeURIComponent(payment)}`);
        if (stopped.current) return;
        if (current.status === 'paid' && current.hire.roomId) { setResult(current); navigate(`/consulting#room-${current.hire.roomId}`, { replace: true }); return; }
        if (current.status === 'failed' || current.status === 'refunded') { setResult(current); return; }
      } catch { /* ถามรอบหน้าต่อ */ }
      if (Date.now() - started > 20_000) setSlow(true);
      if (Date.now() - started < 90_000) timer = setTimeout(() => { void poll(); }, 2000);
    };
    void poll();
    return () => { stopped.current = true; clearTimeout(timer); };
  }, [user, payment, navigate]);

  if (authLoading) return <main id="main" tabIndex={-1} className="shell page"><p className="side-note" role="status">{s.loading}</p></main>;
  if (!user) return <Navigate to={`/signin?next=${encodeURIComponent(next)}`} replace />;

  const failedNow = result && result.status !== 'paid';
  return <main id="main" tabIndex={-1} className="shell page cx-page">
    <div className="cx-verify" role={failedNow ? 'alert' : 'status'}>
      {!failedNow && <>
        <LoaderCircle className="cx-verify__icon cx-spin" aria-hidden="true" />
        <h1>{s.returnChecking}</h1>
        {slow && <p>{s.returnSlow}</p>}
      </>}
      {failedNow && <>
        <CircleAlert className="cx-verify__icon cx-verify__icon--bad" aria-hidden="true" />
        <h1>{s.pageTitle}</h1>
        <p>{result.status === 'refunded' ? s.refunded : s.returnFailed}</p>
      </>}
      {result?.status === 'paid' && <>
        <CircleCheck className="cx-verify__icon cx-verify__icon--ok" aria-hidden="true" />
        <p>{s.returnPaid}</p>
      </>}
      <div className="cx-row cx-row--center"><Link className="link-button cx-link cx-link--back" to="/consulting"><ArrowLeft size={16} aria-hidden="true" />{s.toConsulting}</Link></div>
    </div>
  </main>;
}
