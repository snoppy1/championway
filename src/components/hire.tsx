import { useI18n } from '../i18n';
import { formatDateTime } from '../i18n/format';
import { hireStep } from '../data/consult';
import type { HireBase, HireStatus } from '../data/consult';
import '../consult.css';
import '../chat.css';

/* ชิ้นส่วนร่วมของการจ้างเมนเทอร์: ป้ายสถานะ บรรทัดขั้นตอน สรุปงาน และจุดแจ้งเตือนข้อความที่ยังไม่อ่าน
   หน้าโปรไฟล์เมนเทอร์ Consulting และ Mentor zone ใช้ชุดเดียวกัน หน้าตาและคำจึงตรงกันทุกที่ */

export function StatusPill({ status, reviewed = false }: { status: HireStatus; reviewed?: boolean }) {
  const { t } = useI18n();
  return <span className={`cx-pill cx-pill--${status}`}>
    {status === 'completed' && reviewed ? t.consult.reviewedPill : t.consult.status[status]}
  </span>;
}

/** บรรทัดขั้นตอนธรรมดา ขั้นปัจจุบันตัวหนา ไม่ใช้ชิปตัวเลข
    ขั้นมาจาก t.consult.steps ทั้งหมด เพิ่มขั้นจ่ายเงินหรือขั้น "เข้าห้องวิดีโอ" ได้โดยเพิ่มรายการในพจนานุกรมกับ hireStep() */
export function HireSteps({ status }: { status: HireStatus | null }) {
  const { t } = useI18n();
  const current = hireStep(status);
  return <p className="cx-steps" aria-label={t.consult.stepsLabel}>
    {t.consult.steps.map((step, index) => <span key={step}>
      {index > 0 && <span aria-hidden="true"> · </span>}
      {index === current ? <strong aria-current="step">{step}</strong> : step}
    </span>)}
  </p>;
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
