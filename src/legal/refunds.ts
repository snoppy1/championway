import { CONTACT_EMAIL, EFFECTIVE, OPERATOR } from './types';
import type { LegalPair } from './types';

/* นโยบายคืนเงิน: ไม่คืนเงินบางส่วน ยกเลิกได้ทุกเมื่อ (เจ้าของตัดสิน 5 ต.ค. 2569)
   ตอนนี้สิ่งเดียวที่เก็บเงินคือสมาชิก Rising Star ระบบตัดสิทธิ์เองเมื่อคืนเงินหรือถูกโต้แย้งยอด (server/lib/billing.ts) */

export const refunds: LegalPair = {
  th: {
    title: 'นโยบายการยกเลิกและคืนเงิน',
    updated: `มีผลตั้งแต่วันที่ ${EFFECTIVE.th}`,
    intro: 'ตอนนี้สิ่งเดียวที่ ChampionWays เก็บเงินคือสมาชิก Rising Star สำหรับเมนเทอร์ (99 บาทต่อเดือน) การปรึกษาระหว่างนักเรียนกับเมนเทอร์ตกลงและจ่ายกันเองนอกเว็บ เราจึงคืนเงินส่วนนั้นให้ไม่ได้',
    sections: [
      { id: 'cancel', heading: '1. การยกเลิก', blocks: [
        { list: [
          ['จ่ายด้วยบัตร: ', 'ยกเลิกได้ทุกเมื่อที่หน้าสำรวจ Mentor ปุ่ม "จัดการการสมัคร" การต่ออายุรอบถัดไปจะหยุด และคุณยังเป็น Rising Star ได้จนสิ้นรอบที่จ่ายแล้ว'],
          ['จ่ายด้วย PromptPay: ', 'ไม่ต่ออายุเองอยู่แล้ว ถ้าไม่จ่ายรอบใหม่ สมาชิกจะหมดเมื่อครบหนึ่งเดือน'],
        ] },
      ] },
      { id: 'policy', heading: '2. หลักการคืนเงิน', blocks: [
        'ค่าสมาชิกที่ชำระแล้วไม่คืนเงิน รวมถึงไม่คืนเงินบางส่วนสำหรับวันที่เหลือในเดือนนั้น เมื่อยกเลิก คุณยังใช้สิทธิ์ได้ครบจนสิ้นรอบที่จ่ายไว้',
      ] },
      { id: 'exceptions', heading: '3. กรณีที่เราคืนเงินเต็มจำนวน', blocks: [
        { list: [
          'ถูกตัดเงินซ้ำสำหรับรอบเดียวกัน',
          'ถูกตัดเงินหลังจากคุณยกเลิกเรียบร้อยแล้ว',
          'ถูกตัดเงินผิดจำนวนจากความผิดพลาดของระบบ',
          'เราปิดบริการ Rising Star ระหว่างรอบ (คืนตามสัดส่วนวันที่เหลือ)',
        ] },
        'กรณีเหล่านี้ แจ้งเราภายใน 30 วันนับจากวันที่ถูกตัดเงิน',
      ] },
      { id: 'no-refund', heading: '4. กรณีที่ไม่คืนเงิน', blocks: [
        { list: [
          'ลืมยกเลิกก่อนวันต่ออายุ',
          'ไม่ได้ใช้สิทธิ์ หรือมีนักเรียนติดต่อน้อยกว่าที่คาด',
          'บัญชีถูกระงับเพราะทำผิดข้อกำหนดการใช้งาน',
        ] },
      ] },
      { id: 'how', heading: '5. วิธีขอคืนเงิน', blocks: [
        `ส่งอีเมลมาที่ ${CONTACT_EMAIL} จากอีเมลที่ใช้สมัคร บอกวันที่และจำนวนเงินที่ถูกตัด เราจะตอบภายใน 7 วัน ถ้าอนุมัติ เงินจะคืนผ่าน Stripe ไปยังช่องทางเดิมที่คุณจ่าย บัตรมักใช้เวลา 5–10 วันทำการขึ้นอยู่กับธนาคาร ถ้าคืนผ่านช่องทางเดิมไม่ได้ เราจะติดต่อคุณเพื่อโอนคืนทางอื่น`,
        'เมื่อคืนเงินแล้ว สิทธิ์ Rising Star ของรอบนั้นจะสิ้นสุดทันที',
      ] },
      { id: 'disputes', heading: '6. การโต้แย้งรายการกับธนาคาร', blocks: [
        'ถ้ามีปัญหาเรื่องการตัดเงิน กรุณาติดต่อเราก่อน เราแก้ให้ได้เร็วกว่า ถ้ามีการโต้แย้งรายการ (chargeback) กับธนาคาร สิทธิ์ Rising Star ของรอบนั้นจะสิ้นสุดทันที',
      ] },
      { id: 'contact', heading: '7. ติดต่อเรา', blocks: [`${OPERATOR} · ${CONTACT_EMAIL}`] },
    ],
  },
  en: {
    title: 'Cancellation and Refund Policy',
    updated: `Effective ${EFFECTIVE.en}`,
    intro: 'Right now the only thing ChampionWays charges for is the Rising Star membership for mentors (99 THB per month). Consultations between students and mentors are arranged and paid for off the site, so we cannot refund those.',
    sections: [
      { id: 'cancel', heading: '1. Cancelling', blocks: [
        { list: [
          ['Paid by card: ', 'cancel any time on the Mentors page with "Manage subscription". The next renewal stops, and you stay a Rising Star until the end of the period you paid for.'],
          ['Paid with PromptPay: ', 'it never renews by itself. If you do not pay again, membership ends after one month.'],
        ] },
      ] },
      { id: 'policy', heading: '2. Our refund rule', blocks: [
        'Membership fees already paid are not refunded, including partial refunds for the days left in a month. After you cancel, you keep full benefits until the end of the period you paid for.',
      ] },
      { id: 'exceptions', heading: '3. When we refund in full', blocks: [
        { list: [
          'You were charged twice for the same period',
          'You were charged after you had already cancelled',
          'You were charged the wrong amount because of a system error',
          'We shut down Rising Star during your period (refunded for the days left)',
        ] },
        'For these cases, tell us within 30 days of the charge.',
      ] },
      { id: 'no-refund', heading: '4. When we do not refund', blocks: [
        { list: [
          'You forgot to cancel before the renewal date',
          'You did not use the benefits, or fewer students contacted you than you expected',
          'Your account was suspended for breaking the Terms of Service',
        ] },
      ] },
      { id: 'how', heading: '5. How to ask for a refund', blocks: [
        `Email ${CONTACT_EMAIL} from the address on your account with the date and amount of the charge. We reply within 7 days. If approved, Stripe returns the money to the method you paid with; card refunds usually take 5–10 business days depending on your bank. If that is not possible, we will contact you to arrange another way.`,
        'Once refunded, Rising Star benefits for that period end immediately.',
      ] },
      { id: 'disputes', heading: '6. Bank disputes', blocks: [
        'If something is wrong with a charge, please contact us first; we can fix it faster. If a charge is disputed with your bank (a chargeback), Rising Star benefits for that period end immediately.',
      ] },
      { id: 'contact', heading: '7. Contact us', blocks: [`${OPERATOR} · ${CONTACT_EMAIL}`] },
    ],
  },
};
