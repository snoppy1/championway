import { randomBytes, randomUUID } from 'node:crypto';

/** id ของแถวทั่วไป อ่านออกว่ามาจากตารางไหนเวลาดู log */
export function newId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

/** ใช้กับ session และค่าที่เดาไม่ได้เป็นสำคัญ 32 ไบต์จากเครื่องสุ่มของระบบ */
export function newToken() {
  return randomBytes(32).toString('base64url');
}

/** slug จากชื่องาน ภาษาไทยเก็บไว้ทั้งคำเพราะตัดคำเองไม่ได้
    ต้องเก็บ \p{M} ไว้ด้วย เพราะสระและวรรณยุกต์ไทยเป็น Mark ไม่ใช่ Letter
    ถ้าตัดทิ้งจะได้ slug อย่าง "หน-งส-นสามนาท" ซึ่งอ่านไม่ออก */
export function slugify(name: string, fallback: string) {
  const slug = name.toLowerCase().trim()
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}
