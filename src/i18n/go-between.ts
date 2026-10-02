import type { Messages } from './en';

/* ถ้อยคำของโหมดตัวกลาง (ใช้อยู่ตอนนี้): ChampionWays ให้นักเรียนกับเมนเทอร์ติดต่อกันนอกเว็บ ไม่จ้าง ไม่แชต ไม่รับเงิน
   ข้อความหลักใน en.ts/th.ts ยังเป็นของโหมดจ้าง (พักไว้ เปิดกลับได้ด้วย HIRING_ENABLED) ข้อความที่ต่างกันอยู่ที่นี่
   I18nProvider ซ้อนทับให้เองเมื่อสวิตช์ปิด หน้าที่ใช้ t.xxx จึงได้ถ้อยคำที่ถูกโหมดโดยไม่ต้องเช็กเองทีละหน้า
   ชนิดผูกกับ Messages ถ้าคีย์หรือรูปแบบฟังก์ชันไม่ตรง build จะไม่ผ่าน */

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: infer A) => infer R ? (...args: A) => R
    : T[K] extends readonly unknown[] ? T[K]
      : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export const enGoBetween: DeepPartial<Messages> = {
  risingStar: {
    lead: 'The mentors with the highest average rating each month. Only reviews written that month, after a confirmed consultation, count.',
    memberNoReviews: 'You have no reviews this month yet. Reviews from confirmed consultations decide your rank.',
  },
  mentorApply: {
    lead: 'Tell us what you are good at, with evidence that gives teams confidence before they contact you.',
    asideSeeText: 'Only your name and last initial are shown. Your application email and evidence files are used for review only. Students see the contact details you add only after they press Contact mentor.',
    consent: {
      replies: 'I agree to reply to students who contact me, and to confirm a consultation on ChampionWays once it has happened.',
      payment: 'I understand that ChampionWays does not take payment. I agree the price and how to pay directly with each student.',
    },
    cannotHint: 'Required, so teams know your limits before they contact you',
    previewFooter: 'Students contact you outside ChampionWays, then ask you to confirm. Nothing is charged through this site.',
  },
  profile: {
    emailVerifiedText: 'Verified. You can see mentor contact details and write reviews.',
    mentorZoneBefore: 'Manage your contact details, competitions, prices, and consultations in your ',
  },
  profileEdit: {
    lead: 'The name and photo you add appear in the site header.',
  },
  detail: {
    mentorsLead: 'Mentors who help teams with this competition. Talk with them outside ChampionWays, then confirm the guidance here.',
  },
  mentorProfile: {
    reviewsEmpty: 'No reviews yet. Reviews appear after a mentor confirms a consultation.',
  },
  verifyEmail: {
    successText: 'You can now see mentor contact details and write reviews.',
  },
  consult: {
    verifyText: (email: string) => `You need a verified email to see mentor contact details and to write reviews. We send a link to ${email}.`,
  },
};

export const thGoBetween: DeepPartial<Messages> = {
  risingStar: {
    lead: 'เมนเทอร์ที่ได้คะแนนรีวิวเฉลี่ยสูงสุดในแต่ละเดือน นับเฉพาะรีวิวที่เขียนในเดือนนั้น หลังเมนเทอร์ยืนยันการปรึกษาแล้ว',
    memberNoReviews: 'เดือนนี้คุณยังไม่มีรีวิว อันดับของคุณขึ้นอยู่กับรีวิวจากการปรึกษาที่เมนเทอร์ยืนยันแล้ว',
  },
  mentorApply: {
    lead: 'บอกสิ่งที่คุณถนัด พร้อมหลักฐานที่ช่วยให้ทีมมั่นใจก่อนติดต่อคุณ',
    asideSeeText: 'แสดงชื่อและนามสกุลย่อ ส่วนอีเมลในใบสมัครกับไฟล์หลักฐานใช้สำหรับตรวจสอบเท่านั้น นักเรียนจะเห็นช่องทางติดต่อที่คุณเพิ่มหลังกด “ติดต่อเมนเทอร์” เท่านั้น',
    consent: {
      replies: 'ยอมรับว่าจะตอบนักเรียนที่ติดต่อมา และยืนยันการปรึกษาบน ChampionWays เมื่อการปรึกษานั้นเกิดขึ้นแล้ว',
      payment: 'รับทราบว่า ChampionWays ไม่รับชำระเงิน และฉันตกลงราคากับวิธีชำระเงินกับนักเรียนแต่ละคนเอง',
    },
    cannotHint: 'บังคับกรอก เพื่อให้ทีมรู้ขอบเขตก่อนติดต่อคุณ',
    previewFooter: 'นักเรียนติดต่อคุณนอก ChampionWays แล้วขอให้คุณยืนยัน เว็บนี้ไม่เก็บเงินใด ๆ',
  },
  profile: {
    emailVerifiedText: 'ยืนยันแล้ว คุณเห็นช่องทางติดต่อเมนเทอร์และเขียนรีวิวได้',
    mentorZoneBefore: 'จัดการช่องทางติดต่อ เวทีที่รับปรึกษา ราคา และการยืนยันการปรึกษาได้ที่ ',
  },
  profileEdit: {
    lead: 'ชื่อและรูปที่ใส่ไว้จะแสดงบนหัวเว็บ',
  },
  detail: {
    mentorsLead: 'เมนเทอร์ที่ช่วยทีมในเวทีนี้ คุยกับเมนเทอร์นอก ChampionWays แล้วกลับมายืนยันคำแนะนำที่ได้รับที่นี่',
  },
  mentorProfile: {
    reviewsEmpty: 'ยังไม่มีรีวิว รีวิวจะขึ้นเมื่อเมนเทอร์ยืนยันการปรึกษา',
  },
  verifyEmail: {
    successText: 'ตอนนี้คุณเห็นช่องทางติดต่อเมนเทอร์และเขียนรีวิวได้แล้ว',
  },
  consult: {
    verifyText: (email: string) => `ต้องยืนยันอีเมลก่อนจึงจะเห็นช่องทางติดต่อเมนเทอร์และเขียนรีวิวได้ เราจะส่งลิงก์ไปที่ ${email}`,
  },
};

const isPlain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** ซ้อนทับถ้อยคำทีละคีย์ (ลึกได้) ไม่แตะอ็อบเจกต์ต้นฉบับ */
export function withGoBetween(base: Messages, overrides: DeepPartial<Messages>): Messages {
  const merge = (target: unknown, patch: unknown): unknown => {
    if (!isPlain(target) || !isPlain(patch)) return patch;
    const out: Record<string, unknown> = { ...target };
    for (const key of Object.keys(patch)) out[key] = merge(target[key], patch[key]);
    return out;
  };
  return merge(base, overrides) as Messages;
}
