import { inDays } from './dates.js';
import type { CompetitionSubmission, MentorSubmission, SubmissionStatus } from './submissions.js';

/* ใบส่งเวทีและใบสมัครเมนเทอร์ตัวอย่างทั้งหมดเป็นข้อมูลสมมติสำหรับต้นแบบ ไม่ใช่ข้อมูลของบุคคลหรือหน่วยงานจริง
   รวมถึงข้อความสำหรับทีมตรวจ ซึ่งใช้ภาษาไทยอย่างเดียวเหมือนหน้าจัดการ
   เป็นเนื้อหาตัวอย่าง ไม่ใช่ข้อความของหน้าเว็บ จึงไม่ผ่านพจนานุกรม i18n (check-i18n ยกเว้นไฟล์นี้ไว้)
   ข้อมูลจริงมาจากฐานข้อมูล ข้อมูลตัวอย่างนี้ใช้เติมฐานข้อมูลตอน seed เท่านั้น */

export const statusLabels: Record<SubmissionStatus, string> = {
  pending: 'รอตรวจ', info: 'ขอข้อมูลเพิ่ม', published: 'เผยแพร่แล้ว', rejected: 'ไม่ผ่าน',
};

export const competitionSubmissions: CompetitionSubmission[] = [
  {
    id: 'cs-104', status: 'pending', submittedAt: inDays(-4),
    organizerName: 'ชมรมภาพยนตร์นักศึกษา', contactName: 'ปรียา ส.', contactRole: 'ประธานชมรม',
    contactEmail: 'preeya@example.ac.th', contactPhone: '08x-xxx-1240',
    organizerUrl: 'https://example.ac.th/filmclub',
    name: 'Short Film Lab: หนังสั้นสามนาที',
    categories: ['film', 'society'], type: 'contest',
    description: 'ส่งหนังสั้นไม่เกิน 3 นาที หัวข้อ “เมืองที่ฉันอยากอยู่” รอบชิงฉายในโรงจริง',
    levels: ['secondary', 'university'], teamMin: 1, teamMax: 4,
    closesAt: inDays(24), eventDate: inDays(38), region: 'bangkok', venue: 'หอศิลป์กรุงเทพฯ',
    prizeValue: 60000, rewards: ['certificate', 'trophy', 'publish'],
    sourceUrl: 'https://example.ac.th/filmclub/shortfilmlab',
    registerUrl: 'https://example.ac.th/filmclub/shortfilmlab/register',
  },
  {
    id: 'cs-103', status: 'pending', submittedAt: inDays(-2),
    organizerName: 'สหกรณ์ผู้ปลูกกาแฟภาคเหนือ', contactName: 'วรุณ ท.', contactRole: 'ฝ่ายประชาสัมพันธ์',
    contactEmail: 'warun@example.co.th', contactPhone: '08x-xxx-7781',
    organizerUrl: 'https://example.co.th/northcoffee',
    name: 'Bean to Cup Challenge 2569',
    categories: ['food', 'business'], type: 'contest',
    description: 'แข่งคั่วและออกแบบเมนูกาแฟจากเมล็ดในพื้นที่ พร้อมแผนขายจริงหนึ่งหน้า',
    levels: ['university', 'open'], teamMin: 2, teamMax: 3,
    opensAt: inDays(6), closesAt: inDays(40), region: 'north', venue: 'เชียงใหม่',
    prizeValue: 80000, rewards: ['certificate', 'partnership'], fee: 200,
    sourceUrl: 'https://example.co.th/northcoffee/beantocup',
  },
  {
    id: 'cs-102', status: 'info', submittedAt: inDays(-9),
    reviewedAt: inDays(-7), reviewedBy: 'ทีมตรวจ A',
    reviewNote: 'ลิงก์ประกาศต้นทางเปิดไม่ได้ และเงินรางวัลในฟอร์มไม่ตรงกับที่โพสต์ไว้ รบกวนส่งลิงก์ประกาศที่เปิดได้และยืนยันยอดรางวัลอีกครั้ง',
    organizerName: 'บริษัทตัวอย่างเทคโนโลยี', contactName: 'ธนกร ล.', contactRole: 'HR',
    contactEmail: 'thanakorn@example.com', contactPhone: '08x-xxx-3355',
    organizerUrl: 'https://example.com',
    name: 'Code Sprint ชิงทุนฝึกงาน',
    categories: ['technology'], type: 'contest',
    description: 'แข่งเขียนโปรแกรมแก้โจทย์ 5 ข้อใน 4 ชั่วโมง ผู้ชนะได้สิทธิ์สัมภาษณ์ฝึกงาน',
    levels: ['university'], teamMin: 1, teamMax: 1,
    closesAt: inDays(18), region: 'online',
    prizeValue: 0, prizeNote: 'สิทธิ์สัมภาษณ์ฝึกงาน', rewards: ['certificate', 'internship'],
    sourceUrl: 'https://example.com/careers/codesprint',
  },
  {
    id: 'cs-101', status: 'published', submittedAt: inDays(-16),
    reviewedAt: inDays(-15), reviewedBy: 'ทีมตรวจ A', reviewNote: 'ตรวจครบทุกข้อ เผยแพร่แล้ว',
    organizerName: 'มูลนิธิดนตรีเยาวชน', contactName: 'อารยา พ.', contactRole: 'ผู้ประสานงาน',
    contactEmail: 'araya@example.org', contactPhone: '08x-xxx-9012',
    organizerUrl: 'https://example.org/youthmusic',
    name: 'Youth Ensemble Contest',
    categories: ['performing'], type: 'contest',
    description: 'วงดนตรีเยาวชนบรรเลงเพลงบังคับหนึ่งเพลงและเพลงเลือกหนึ่งเพลง',
    levels: ['primary', 'secondary'], teamMin: 4, teamMax: 12,
    closesAt: inDays(27), eventDate: inDays(45), region: 'central', venue: 'หอประชุมจังหวัดนนทบุรี',
    prizeValue: 50000, rewards: ['certificate', 'trophy'],
    sourceUrl: 'https://example.org/youthmusic/ensemble',
  },
];

export const mentorSubmissions: MentorSubmission[] = [
  {
    id: 'ms-057', status: 'pending', submittedAt: inDays(-5),
    firstName: 'ณิชา', lastName: 'ภัทรวงศ์', nickname: 'นิช',
    email: 'nicha@example.com', phone: '08x-xxx-4410',
    occupation: 'นักศึกษา', organization: 'มหาวิทยาลัยตัวอย่าง', role: 'ปี 4 คณะวิศวกรรมศาสตร์',
    experience: 'ลงแข่งแฮกกาธอนมา 6 รายการใน 2 ปี เป็นคนคุมสโคปและตัดฟีเจอร์ให้ทีมส่งทัน',
    awards: [
      { title: 'ชนะเลิศ Bangkok Hack 48', competitionSlug: 'bangkok-hack-48', year: '2568', evidence: 'ประกาศผลบนเว็บผู้จัด + ภาพถ่ายรับรางวัล' },
      { title: 'รองชนะเลิศ Data Story Awards', competitionSlug: 'data-story-awards', year: '2567', evidence: 'เกียรติบัตร' },
    ],
    portfolio: 'https://example.com/nicha',
    best: 'ช่วยตัดขอบเขตงานให้ทีมส่งทันเวลา และซ้อมเดโมที่ไม่พังหน้างาน',
    cannot: 'ไม่เขียนโค้ดให้ ไม่ทำสไลด์ให้ และไม่รับงานที่ตัวเองเป็นกรรมการ',
    topics: ['วางแผนและแบ่งงาน', 'พัฒนาต้นแบบ'],
    price: 900, paidSlot: inDays(3), freeSlot: inDays(2),
  },
  {
    id: 'ms-056', status: 'pending', submittedAt: inDays(-1),
    firstName: 'กันตพงศ์', lastName: 'ศรีสุวรรณ', nickname: 'กันต์',
    email: 'kantapong@example.com', phone: '08x-xxx-2266',
    occupation: 'พนักงานบริษัท', organization: 'บริษัทตัวอย่างการตลาด', role: 'Marketing Associate',
    experience: 'เคยเข้ารอบชิงเคสแข่งการตลาด 3 เวที และเป็นพี่เลี้ยงชมรมมา 1 ปี',
    awards: [
      { title: 'ชนะเลิศ Marketing Case Cup ระดับภูมิภาค', competitionSlug: null, year: '2568', evidence: 'ยังไม่แนบหลักฐาน' },
    ],
    portfolio: '',
    best: 'ช่วยจัดโครงเรื่องการพรีเซนต์และซ้อมตอบคำถามกรรมการ',
    cannot: 'ไม่ทำสไลด์ให้ และไม่รับปรึกษาทีมที่แข่งเวทีเดียวกับที่ตัวเองเป็นกรรมการ',
    topics: ['ออกแบบสไลด์', 'Pitching และตอบคำถาม'],
    price: 700, paidSlot: inDays(4), freeSlot: inDays(3),
  },
  {
    id: 'ms-055', status: 'rejected', submittedAt: inDays(-12),
    reviewedAt: inDays(-11), reviewedBy: 'ทีมตรวจ B',
    reviewNote: 'ข้อความในช่อง “ช่วยไม่ได้” ระบุว่ารับทำสไลด์ให้ ซึ่งขัดกับเงื่อนไขที่ยอมรับไว้ว่าจะให้คำแนะนำเท่านั้น หากแก้ขอบเขตแล้วส่งใหม่ได้',
    firstName: 'ภูริ', lastName: 'ตันติวงศ์', nickname: 'ภู',
    email: 'phuri@example.com', phone: '08x-xxx-8899',
    occupation: 'ฟรีแลนซ์', organization: '-', role: 'กราฟิกดีไซเนอร์',
    experience: 'รับออกแบบสไลด์ให้ทีมแข่งมาแล้วหลายทีม',
    awards: [],
    portfolio: 'https://example.com/phuri',
    best: 'ทำสไลด์และอาร์ตเวิร์กให้ทีมจนจบงาน',
    cannot: '-',
    topics: ['ออกแบบสไลด์'],
    price: 1500, paidSlot: inDays(6), freeSlot: inDays(5),
  },
];

export const competitionChecks = [
  'ลิงก์ประกาศต้นทางเปิดได้จริง และเป็นประกาศของงานนี้',
  'ชื่อหน่วยงานตรงกับที่ปรากฏในประกาศ',
  'วันปิดรับยังไม่ผ่าน และตรงกับต้นทาง',
  'เงินรางวัลและค่าสมัครตรงกับต้นทาง',
  'คำบรรยายไม่ใช่ข้อความคัดลอกมาทั้งก้อนจากเว็บอื่น',
  'ไม่ใช่การขายของหรือรับสมัครงานที่แฝงมาเป็นการแข่งขัน',
];

export const mentorChecks = [
  'ตัวตนและที่ทำงานตรวจสอบได้จากข้อมูลที่ให้มา',
  'หลักฐานรางวัลเป็นของผู้สมัครจริง และตรงกับเวทีที่อ้าง',
  'ขอบเขตช่วยได้และช่วยไม่ได้เขียนชัด และไม่ขัดกับกติกาของเวที',
  'ราคาของแต่ละงานสมเหตุสมผล และช่องทางติดต่อดูเป็นของผู้สมัครจริง',
];
