/* ลำดับเมนเทอร์ในหน้าเวที (ผู้ใช้ตัดสิน 4 ต.ค. 2569 กับทีม)
   สมาชิก Rising Star ขึ้นก่อนเสมอ ภายในแต่ละกลุ่มเรียงด้วยคะแนนรวมสามส่วน แล้วให้นักเรียนเลือกเอง
   - รีวิวทั้งหมด 50%: เฉลี่ยแบบดึงเข้าหาค่ากลาง คนที่มีรีวิวน้อยไม่ได้คะแนนสูงเกินจริงจากรีวิวไม่กี่อัน
   - จำนวนครั้งที่ปรึกษาสำเร็จ (เมนเทอร์ยืนยันแล้ว) 25%: เพิ่มช้าลงเรื่อย ๆ คนเก่าไม่กินขาดคนใหม่ เต็มที่ 20 ครั้ง
   - ผลงานในเวทีนี้ 25%: ได้รางวัล > เข้ารอบชิง > เข้าร่วม
   เมนเทอร์ใหม่ที่ยังไม่มีรีวิวยังขึ้นได้ ถ้ามีผลงานในเวทีนั้นดี */

export type CompetitionResult = 'winner' | 'finalist' | 'participant';

const RESULT_WEIGHT: Record<CompetitionResult, number> = { winner: 1, finalist: 0.6, participant: 0.3 };
const PRIOR_STARS = 3.5;
const PRIOR_REVIEWS = 3;
const FULL_CONSULTATIONS = 20;

export function mentorScore(input: { average: number | null; reviews: number; consultations: number; result: CompetitionResult | null }) {
  const stars = (PRIOR_STARS * PRIOR_REVIEWS + (input.average ?? 0) * input.reviews) / (PRIOR_REVIEWS + input.reviews);
  const reviews = stars / 5;
  const consultations = Math.min(1, Math.log(1 + input.consultations) / Math.log(1 + FULL_CONSULTATIONS));
  const result = input.result ? RESULT_WEIGHT[input.result] : 0;
  return 0.5 * reviews + 0.25 * consultations + 0.25 * result;
}

const order: CompetitionResult[] = ['winner', 'finalist', 'participant'];
/** ผลที่ดีที่สุดของเมนเทอร์ในเวทีหนึ่ง ผลเท่ากันใช้ปีล่าสุด */
export function bestResult(rows: { result: CompetitionResult; year: string }[]) {
  return [...rows].sort((a, b) => order.indexOf(a.result) - order.indexOf(b.result) || b.year.localeCompare(a.year))[0] ?? null;
}
