import type { Mentor } from './mentors.js';

/* เมนเทอร์ รางวัล และราคาทั้งหมดเป็นข้อมูลสมมติสำหรับต้นแบบ เป็นเนื้อหาตัวอย่าง ไม่ใช่ข้อความของหน้าเว็บ
   จึงเขียนเป็นภาษาไทยอย่างเดียว ไม่ผ่านพจนานุกรม i18n (check-i18n ยกเว้นไฟล์นี้ไว้)
   ข้อมูลจริงมาจากฐานข้อมูล ข้อมูลตัวอย่างนี้ใช้เติมฐานข้อมูลตอน seed เท่านั้น */

export const mentors: Mentor[] = [
  {
    id: 'mentor-mind', name: 'พี่มายด์ ก.', avatar: 'มายด์',
    bio: 'บริหารธุรกิจ ปี 4 · มหาวิทยาลัยตัวอย่าง', replyTime: '2 ชั่วโมง',
    wonSlug: 'venture-ignite', category: 'business', topics: [0, 4], price: 800,
    best: 'ช่วยเปลี่ยนโจทย์กว้างให้เป็นไอเดียที่อธิบายได้ใน 1 นาที',
    cannot: 'ไม่รับทำแผนธุรกิจหรือเขียนสไลด์แทนทีม',
    firstSlotInDays: 1, verified: true, weeklyRank: 1, weeklyFocus: 'วิเคราะห์โจทย์และฝึก Pitching',
  },
  {
    id: 'mentor-jay', name: 'พี่เจ ธ.', avatar: 'เจ',
    bio: 'วิศวกรรมคอมพิวเตอร์ ปี 4 · มหาวิทยาลัยตัวอย่าง', replyTime: '2 ชั่วโมง',
    wonSlug: 'bangkok-hack-48', category: 'technology', topics: [1, 2], price: 900,
    best: 'ช่วยวางแผน MVP และเลือกสิ่งที่ควรทำก่อน',
    cannot: 'ไม่รับพัฒนาระบบจริงแทนทั้งทีม',
    firstSlotInDays: 2, verified: true, weeklyRank: 2, weeklyFocus: 'พัฒนาต้นแบบและเทคโนโลยี',
  },
  {
    id: 'mentor-nut', name: 'พี่นัท ว.', avatar: 'นัท',
    bio: 'Product Designer · Design Studio ตัวอย่าง', replyTime: '6 ชั่วโมง',
    wonSlug: 'poster-unbound', category: 'design', topics: [0, 5], price: 700,
    best: 'ช่วยวิเคราะห์ฟีดแบ็กและหาจุดที่งานยังไม่ตอบโจทย์',
    cannot: 'ไม่รับออกแบบชิ้นงานส่งประกวดแทน',
    firstSlotInDays: 3, verified: true, weeklyRank: 3, weeklyFocus: 'ออกแบบแนวคิดและผลงาน',
  },
  {
    id: 'mentor-tae', name: 'พี่เต้ ส.', avatar: 'เต้',
    bio: 'Business Analyst · Studio ตัวอย่าง', replyTime: '4 ชั่วโมง',
    wonSlug: 'retail-growth-case-challenge', category: 'business', topics: [0, 1], price: 600,
    best: 'ช่วยตัดขอบเขตงานและแบ่งหน้าที่ให้ทีมทำทัน',
    cannot: 'ไม่ช่วยเขียนโค้ดหรือทำโมเดลการเงินเชิงลึก',
    firstSlotInDays: 2, verified: true,
  },
  {
    id: 'mentor-pim', name: 'พี่พิม พ.', avatar: 'พิม',
    bio: 'นิเทศศาสตร์ ปี 4 · มหาวิทยาลัยตัวอย่าง', replyTime: '3 ชั่วโมง',
    wonSlug: null, category: null, topics: [3, 4], price: 500,
    best: 'ช่วยเรียงเรื่องและซ้อมตอบคำถามให้กรรมการเข้าใจ',
    cannot: 'ไม่รับตรวจความถูกต้องเชิงวิศวกรรม',
    firstSlotInDays: 1, verified: false,
  },
  {
    id: 'mentor-aom', name: 'พี่ออม ร.', avatar: 'ออม',
    bio: 'ที่ปรึกษาโครงการ · Innovation Lab ตัวอย่าง', replyTime: '5 ชั่วโมง',
    wonSlug: 'venture-ignite', category: 'business', topics: [0, 5], price: 1000,
    best: 'ช่วยทบทวนจุดอ่อนของไอเดียและหลักฐานที่ยังขาด',
    cannot: 'ไม่รับประกันรางวัลหรือผลการเข้ารอบ',
    firstSlotInDays: 25, verified: true,
  },
];
