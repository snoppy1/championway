import type { Messages } from './en';

/* ภาษาไทย ต้องมีคีย์ครบเท่าภาษาอังกฤษทุกตัว TypeScript ตรวจให้ตอน build
   ใช้คำตามอภิธานศัพท์ใน markdown/i18n.md ให้ตรงกันทั้งเว็บ */

export const th: Messages = {
  common: {
    skipToContent: 'ข้ามไปเนื้อหาหลัก',
    homeLink: 'ChampionWays หน้าแรก',
    comingSoon: 'เปิดเร็ว ๆ นี้',
    soonTag: 'เร็ว ๆ นี้',
  },
  errors: {
    unreachable: 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ ลองใหม่อีกครั้ง',
    serverStatus: (status) => `เซิร์ฟเวอร์ตอบผิดพลาด (HTTP ${status})`,
  },
  nav: {
    mainMenu: 'เมนูหลัก',
    explore: 'สำรวจการแข่งขัน',
    profile: 'โปรไฟล์',
    chats: 'แชตของฉัน',
    library: 'คลังความรู้',
    admin: 'หน้าจัดการ',
    signIn: 'เข้าสู่ระบบ',
    signUp: 'สมัครสมาชิก',
    signOut: 'ออกจากระบบ',
    openMenu: 'เปิดเมนู',
    closeMenu: 'ปิดเมนู',
    language: 'ภาษา',
    profileTitle: (email) => `โปรไฟล์ของฉัน · ${email}`,
    savedItems: (count) => `รายการที่บันทึก ${count} รายการ`,
  },
  footer: {
    tagline: 'เส้นทางของแชมป์เริ่มจากเวทีแรก — เรารวมการแข่งขันไว้ให้ค้นหาง่าย และเก็บเวทีที่สนใจไว้ในที่เดียว',
    find: 'ค้นหา',
    forOrganizers: 'สำหรับผู้จัดการแข่งขัน',
    listForFree: 'ลงงานแข่งขันฟรี',
    suggestCompetition: 'แจ้งเพิ่มเวทีแข่งขัน',
    bottomLine: 'ChampionWays · ค้นหาเวทีที่สนใจ และเตรียมพร้อมไปกับเมนเทอร์',
  },
};
