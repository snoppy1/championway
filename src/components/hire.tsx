import { Check } from 'lucide-react';
import { useI18n } from '../i18n';
import { formatDateTime } from '../i18n/format';
import { contactStep, hireStep } from '../data/consult';
import type { ContactStatus, HireBase, HireStatus } from '../data/consult';
import '../consult.css';
import '../chat.css';

/* ชิ้นส่วนร่วมของการจ้างเมนเทอร์: ป้ายสถานะ บรรทัดขั้นตอน สรุปงาน และจุดแจ้งเตือนข้อความที่ยังไม่อ่าน
   หน้าโปรไฟล์เมนเทอร์ Consulting และ Mentor zone ใช้ชุดเดียวกัน หน้าตาและคำจึงตรงกันทุกที่ */

export function StatusPill({ status, reviewed = false, disputed = false }: { status: HireStatus; reviewed?: boolean; disputed?: boolean }) {
  const { t } = useI18n();
  // งานที่แจ้งปัญหายังเป็น paid ในฐานข้อมูล แต่คนอ่านต้องเห็นว่ากำลังรอทีมงานตัดสิน
  if (disputed && status === 'paid') return <span className="cx-pill cx-pill--disputed">{t.consult.disputedPill}</span>;
  return <span className={`cx-pill cx-pill--${status}`}>
    {status === 'completed' && reviewed ? t.consult.reviewedPill : t.consult.status[status]}
  </span>;
}

/** ตัวบอกขั้นตอน: จุดมีเลข ขั้นที่ผ่านแล้วเป็นเครื่องหมายถูก ขั้นปัจจุบันเติมสีม่วงและตัวหนา ชื่อขั้นไม่ตัดบรรทัดกลางคำ
    ขั้นมาจาก t.consult.steps ทั้งหมด เพิ่มขั้น "ชำระเงิน" หรือ "เข้าห้องวิดีโอ" ได้โดยเพิ่มรายการในพจนานุกรมกับ hireStep()
    ขั้นที่ผ่านแล้วบอกด้วยเครื่องหมายถูกและข้อความอ่านออกเสียง ไม่ใช้สีอย่างเดียว */
export function HireSteps({ status }: { status: HireStatus | null }) {
  const { t } = useI18n();
  const s = t.consult;
  return <Stepper steps={s.steps} current={hireStep(status)} label={s.stepsLabel} done={s.stepDone} stepOf={s.stepOf} />;
}

/** บรรทัดขั้นตอนของโหมดตัวกลาง (ติดต่อ → ได้รับคำแนะนำ → เมนเทอร์ยืนยัน → รีวิว) หน้าตาเดียวกับของงานจ้าง
    current = 4 คือครบทุกขั้นแล้ว (รีวิวแล้ว) */
export function ContactSteps({ status, reviewed = false, compact = false, barOnly = false }: { status: ContactStatus | null; reviewed?: boolean; compact?: boolean; barOnly?: boolean }) {
  const { t } = useI18n();
  const s = t.contact;
  return <Stepper steps={s.steps} current={contactStep(status, reviewed)} label={s.stepsLabel} done={s.stepDone} stepOf={s.stepOf} compact={compact} barOnly={barOnly} />;
}

/* compact: แสดงเป็น "ขั้นที่ 2 จาก 4 · …" กับแถบความคืบหน้าเสมอ (ใช้ในแถบข้างที่แคบ ไม่ให้แถวขั้นตอนตกบรรทัด)
   barOnly: จอแคบแสดงแค่แถบ ไม่มีข้อความขั้น (ข้อความบอกสถานะอยู่ในป้ายข้างบนแล้ว) */
function Stepper({ steps, current, label, done, stepOf, compact = false, barOnly = false }: {
  steps: readonly string[]; current: number; label: string; done: string; stepOf: (step: number, total: number, name: string) => string;
  compact?: boolean; barOnly?: boolean;
}) {
  // ครบทุกขั้นแล้ว ข้อความบรรทัดย่อยังบอกขั้นสุดท้าย
  const shown = Math.min(current, steps.length - 1);
  return <div className={`cx-steps-box${compact ? ' is-compact' : ''}${barOnly ? ' is-bar-only' : ''}`}>
    {/* จอแคบไม่มีที่พอให้ทุกขั้นเรียงกัน แสดงเป็น "ขั้นที่ 3 จาก 6 · ชำระเงิน" กับแถบความคืบหน้าบาง ๆ แทน
        รายการเต็มยังอยู่ใน DOM ให้โปรแกรมอ่านหน้าจอและจอกว้างใช้ */}
    <div className="cx-stepper-compact" aria-hidden="true">
      <p>{stepOf(shown + 1, steps.length, steps[shown])}</p>
      <div className="cx-stepper-compact__bar"><span style={{ width: `${(Math.min(current + 1, steps.length) / steps.length) * 100}%` }} /></div>
    </div>
    <ol className="cx-stepper" aria-label={label}>
      {steps.map((step, index) => <li key={step} aria-current={index === current ? 'step' : undefined}
        className={index < current ? 'is-done' : index === current ? 'is-current' : undefined}>
        <span className="cx-stepper__dot" aria-hidden="true">{index < current ? <Check size={14} /> : index + 1}</span>
        <span className="cx-stepper__label">{step}{index < current && <span className="sr-only"> ({done})</span>}</span>
      </li>)}
    </ol>
  </div>;
}

/** ตัวเลขข้อความที่ยังไม่อ่าน ไม่ขึ้นถ้าเป็นศูนย์ ข้อความสำหรับโปรแกรมอ่านหน้าจออยู่ใน sr-only (ตัวเลขอย่างเดียวไม่มีความหมาย) */
export function UnreadBadge({ count }: { count: number }) {
  const { t } = useI18n();
  if (count <= 0) return null;
  return <span className="cx-unread">
    <span aria-hidden="true">{count > 99 ? '99+' : count}</span>
    <span className="sr-only">{t.chat.unreadMessages(count)}</span>
  </span>;
}

/** สรุปสิ่งที่ตกลงกัน: เวที ระยะเวลา ราคารวม เวลาที่อยากนัด และข้อความขอ
    ที่ว่างข้างราคารวมไว้ให้ขั้นการชำระเงินเติมสถานะการจ่ายได้โดยไม่ต้องจัดหน้าใหม่ */
export function HireSummary({ hire }: { hire: HireBase }) {
  const { t, lang } = useI18n();
  const s = t.consult;
  return <dl className="cx-summary">
    {hire.competition && <div><dt>{s.summaryCompetition}</dt><dd>{hire.competition.name}</dd></div>}
    <div><dt>{s.summaryLength}</dt><dd>{s.duration(hire.minutes)}</dd></div>
    <div><dt>{s.summaryTotal}</dt><dd>{t.price.total(hire.price)}</dd></div>
    <div><dt>{s.summaryWhen}</dt><dd>{hire.preferredAt ? formatDateTime(hire.preferredAt, lang) : s.summaryAnyTime}</dd></div>
    {hire.note && <div className="cx-summary__wide"><dt>{s.summaryNote}</dt><dd className="cx-prose">{hire.note}</dd></div>}
    {hire.reason && <div className="cx-summary__wide"><dt>{s.summaryReason}</dt><dd className="cx-prose">{hire.reason}</dd></div>}
  </dl>;
}
