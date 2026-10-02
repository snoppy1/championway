import { env, demoToolsEnabled } from './env.js';

/* ชั้นกลางระหว่างระบบจ้างกับผู้ให้บริการรับจ่ายเงิน

   ตอนนี้ยังรอคีย์ Opn Payments จึงมีตัวจำลอง ('simulated') ไว้ใช้ตอนพัฒนาและในเทส
   ตัวจำลองใช้ได้เฉพาะนอก Production (demoToolsEnabled) บน Production ถ้ายังไม่ได้ตั้งผู้ให้บริการจริง
   ปุ่มจ่ายเงินจะตอบว่ายังไม่เปิด ไม่มีทางทำให้งานกลายเป็น "จ่ายแล้ว" โดยไม่มีเงินเข้าจริง

   หลักที่ทุกผู้ให้บริการต้องทำตาม
   - ยอดเงินมาจากแถวการจ้างในฐานข้อมูลเสมอ ไม่รับยอดจากหน้าเว็บ
   - "จ่ายแล้ว" ต้องยืนยันจากฝั่งผู้ให้บริการ (webhook ที่ตรวจลายเซ็น หรือถามสถานะกลับไป) ไม่เชื่อหน้า return ของเบราว์เซอร์
   - คืนเงินกับโอนให้เมนเทอร์ทำจากเซิร์ฟเวอร์เท่านั้น */

export type CheckoutInput = { paymentId: string; hireId: string; amount: number; description: string; email: string };
export type CheckoutResult = { url: string; providerRef: string };

export interface PaymentProvider {
  name: string;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /** ถามผู้ให้บริการว่ารายการนี้จ่ายสำเร็จจริงไหม ใช้ทั้งตอน webhook มาและตอนผู้ใช้กลับมาที่เว็บ */
  isPaid(providerRef: string): Promise<boolean>;
  refund(providerRef: string, amount: number): Promise<void>;
}

/** ตัวจำลอง: หน้า "จ่ายเงิน" เป็นหน้าในเว็บเราเอง (/pay/simulated) กดยืนยันแล้วถือว่าจ่าย ใช้ได้เฉพาะ dev/test */
const simulated: PaymentProvider = {
  name: 'simulated',
  async createCheckout(input) {
    const providerRef = `sim_${input.paymentId}`;
    return { providerRef, url: `${env.appOrigin}/pay/simulated?payment=${encodeURIComponent(input.paymentId)}` };
  },
  async isPaid() { return true; },
  async refund() { /* ไม่มีเงินจริงให้คืน */ },
};

/** ผู้ให้บริการที่ใช้อยู่ null แปลว่ายังเปิดรับเงินไม่ได้ในสภาพแวดล้อมนี้ */
export function paymentProvider(): PaymentProvider | null {
  // ต่อ Opn เมื่อได้คีย์: if (process.env.OPN_SECRET_KEY) return opn;
  return demoToolsEnabled() ? simulated : null;
}
