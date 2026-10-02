import { useHiring } from '../data/hiring';
import { useI18n } from '../i18n';
import { HireMentorZone } from './MentorZone';
import { ContactMentorZone } from './ContactMentorZone';

/** จ้างพักไว้ (ตอนนี้) = Mentor zone แบบตัวกลาง: ยืนยัน ช่องทางติดต่อ เวทีของฉัน
    เปิดจ้างเมื่อไร หน้านี้กลับเป็นคำขอจ้าง งานและแชต การรับเงิน เวทีของฉัน ตามเดิม */
export function MentorZone() {
  const hiring = useHiring();
  const { t } = useI18n();
  if (hiring === null) return <main id="main" tabIndex={-1} className="shell page cx-page"><p className="side-note" role="status">{t.mentorZone.loading}</p></main>;
  return hiring ? <HireMentorZone /> : <ContactMentorZone />;
}
