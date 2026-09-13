import type { Kind, Theme } from './focus';
/* หมวดหมู่ ประเภทโอกาส ภูมิภาค และรางวัล ใช้ชุดเดียวกับเว็บรวมงานแข่งไทยที่ผู้จัดคุ้นเคย
   อยู่แล้ว รายละเอียดการตัดสินใจอยู่ใน competition-model.md */

export const categories = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'writing', label: 'เขียนและเรียงความ' },
  { id: 'performing', label: 'ดนตรีและการแสดง' },
  { id: 'film', label: 'ภาพยนตร์และภาพถ่าย' },
  { id: 'education', label: 'การศึกษาและการสอน' },
  { id: 'academic', label: 'วิจัยและวิชาการ' },
  { id: 'marketing', label: 'การตลาดและโฆษณา' },
  { id: 'technology', label: 'เทคโนโลยีและนวัตกรรม' },
  { id: 'design', label: 'ศิลปะและออกแบบ' },
  { id: 'health', label: 'สุขภาพและสุขภาวะ' },
  { id: 'society', label: 'สังคมและไลฟ์สไตล์' },
  { id: 'environment', label: 'เกษตรและสิ่งแวดล้อม' },
  { id: 'food', label: 'อาหารและเครื่องดื่ม' },
  { id: 'business', label: 'ธุรกิจและผู้ประกอบการ' },
] as const;

export type CategoryId = Exclude<(typeof categories)[number]['id'], 'all'>;
export const categoryIds = categories.filter((item) => item.id !== 'all').map((item) => item.id) as CategoryId[];

export type Level = 'primary' | 'secondary' | 'university' | 'open';
export const levelLabels: Record<Level, string> = {
  primary: 'ประถมศึกษา', secondary: 'มัธยมศึกษา', university: 'อุดมศึกษา', open: 'เปิดทุกระดับ',
};

export type OpportunityType = 'contest' | 'camp' | 'workshop' | 'scholarship' | 'internship';
export const typeLabels: Record<OpportunityType, string> = {
  contest: 'การแข่งขัน', camp: 'ค่าย', workshop: 'เวิร์กชอป', scholarship: 'ทุน', internship: 'ฝึกงาน',
};

export type Region = 'online' | 'bangkok' | 'central' | 'north' | 'northeast' | 'east' | 'south';
export const regionLabels: Record<Region, string> = {
  online: 'ออนไลน์', bangkok: 'กรุงเทพฯ และปริมณฑล', central: 'ภาคกลาง', north: 'ภาคเหนือ',
  northeast: 'ภาคอีสาน', east: 'ภาคตะวันออก', south: 'ภาคใต้',
};

export type Reward = 'certificate' | 'trophy' | 'publish' | 'internship' | 'partnership';
export const rewardLabels: Record<Reward, string> = {
  certificate: 'เกียรติบัตร', trophy: 'ถ้วยหรือเหรียญ', publish: 'ได้เผยแพร่ผลงาน',
  internship: 'ฝึกงาน', partnership: 'ร่วมงานกับบริษัท',
};

export type Source = 'editorial' | 'organiser' | 'partner';
export const sourceLabels: Record<Source, string> = {
  editorial: 'ทีมงานคัดมาจากประกาศต้นทาง', organiser: 'ผู้จัดงานส่งข้อมูลเอง', partner: 'ได้รับจากพาร์ตเนอร์',
};

/* ประเภทงานและหมวดของเส้นทางใหม่ แยกจาก taxonomy 13 หมวดเดิมโดยตั้งใจ
   หมวดเดิมยังใช้กับสีปก ป้าย และการค้นหา ส่วนสองช่องนี้ใช้กับหน้าสำรวจและการจับคู่เมนเทอร์
   เป็นค่าที่ไม่บังคับ เพราะเวทีที่บันทึกไว้ก่อนหน้านี้ยังไม่ได้จัดประเภท */
export interface Competition {
  /** รหัสในฐานข้อมูล ใช้ตอนขอจองเมนเทอร์ ข้อมูลตัวอย่างในไฟล์นี้ไม่มี */
  id?: string;
  kind?: Kind | null;
  themes?: Theme[];
  slug: string;
  name: string;
  /** หมวดแรกคือหมวดหลัก ใช้กับสีปก ป้ายบนการ์ด และการจับคู่เมนเทอร์ */
  categories: [CategoryId, ...CategoryId[]];
  type: OpportunityType;
  org: string;
  /** วันปิดรับแบบ ISO ข้อมูลตัวอย่างใช้ inDays() เพื่อไม่ให้นับถอยหลังหมดอายุ */
  closesAt: string;
  opensAt?: string;
  eventDate?: string;
  region: Region;
  /** ชื่อสถานที่ ไม่ใส่เมื่อ region เป็น online */
  venue?: string;
  /** 0 คือไม่มีเงินรางวัล ป้ายที่แสดงคำนวณจากค่านี้ ไม่เก็บข้อความซ้ำ */
  prizeValue: number;
  /** รางวัลที่ไม่ใช่เงิน ใช้แทนป้ายเมื่อ prizeValue เป็น 0 */
  prizeNote?: string;
  rewards: Reward[];
  /** ค่าสมัคร ไม่ใส่คือสมัครฟรี */
  fee?: number;
  levels: Level[];
  /** ขนาดทีมเก็บเป็นตัวเลขเพื่อให้กรองได้ ป้ายคำนวณจากคู่นี้ด้วย teamLabel */
  teamMin: number;
  teamMax: number;
  description: string;
  keywords: string[];
  featured?: boolean;
  /** ลิงก์ประกาศต้นทาง ข้อมูลตัวอย่างเว้นว่างไว้เพราะงานเหล่านี้ไม่มีอยู่จริง */
  sourceUrl: string;
  source: Source;
  lastVerifiedAt: string;
  registerUrl?: string;
  /** ห้าส่วนนี้ทีมงานเขียนเอง ผู้จัดไม่ได้กรอกมา จึงไม่บังคับ */
  overview?: string;
  audience?: string;
  format?: string[];
  deliverables?: string[];
  preparation?: string[];
}

/** คืนวันที่แบบ ISO นับจากวันนี้ ใช้กับข้อมูลตัวอย่างเพื่อไม่ให้วันปิดรับหมดอายุ */
export function inDays(offset: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

// ข้อมูลด้านล่างเป็นเวที ผู้จัด วันปิดรับ และเงินรางวัลสมมติทั้งหมด

export const competitions: Competition[] = [
  {
    slug: 'venture-ignite', name: 'Venture Ignite: แผนธุรกิจระดับมหาวิทยาลัย',
    kind: 'case_competition', themes: ['business'],
    categories: ['business'], type: 'contest', org: 'สมาคมผู้ประกอบการรุ่นใหม่',
    closesAt: inDays(6), region: 'bangkok', venue: 'ศูนย์ประชุมแห่งชาติ',
    prizeValue: 300000, rewards: ['certificate', 'trophy', 'partnership'], featured: true,
    levels: ['university'], teamMin: 2, teamMax: 4,
    sourceUrl: '', source: 'editorial', lastVerifiedAt: inDays(-2),
    description: 'ส่งแผนธุรกิจ 10 หน้า รอบชิงพิทช์สด 7 นาทีต่อหน้านักลงทุน ทีมละ 2–4 คน',
    keywords: ['ธุรกิจ', 'แผนธุรกิจ', 'พิทช์', 'startup', 'venture', 'นักลงทุน'],
    overview: 'เวทีสำหรับทีมที่มีไอเดียธุรกิจและอยากรู้ว่ามันอยู่รอดจริงไหม รอบแรกวัดกันที่แผนธุรกิจ 10 หน้า ส่วนรอบชิงคือการพิทช์สดต่อหน้านักลงทุนที่ถามตรงและถามลึก จุดชี้ขาดคือสมมติฐานเรื่องลูกค้าและตัวเลขที่อธิบายที่มาได้',
    audience: 'นักศึกษาระดับอุดมศึกษาทุกสาขา ไม่จำเป็นต้องเรียนบริหาร ทีมที่มีทั้งคนเข้าใจลูกค้า คนทำตัวเลข และคนเล่าเรื่อง มักไปได้ไกลกว่าทีมที่มีทักษะด้านเดียว',
    format: ['ส่งแผนธุรกิจไม่เกิน 10 หน้าพร้อมประมาณการทางการเงิน', 'ทีมที่ผ่านรอบแรกเข้าเวิร์กชอปกับเมนเทอร์หนึ่งครั้งก่อนรอบชิง', 'พิทช์สด 7 นาที และตอบคำถามนักลงทุนอีก 8 นาที'],
    deliverables: ['แผนธุรกิจไม่เกิน 10 หน้า', 'ประมาณการรายได้และต้นทุน 3 ปี พร้อมระบุสมมติฐาน', 'สไลด์พิทช์ไม่เกิน 12 หน้า'],
    preparation: ['คุยกับลูกค้าเป้าหมายจริงอย่างน้อย 5 คนก่อนเขียนแผน', 'ฝึกอธิบายว่าทำไมตลาดนี้ถึงใหญ่พอ และคู่แข่งทำอะไรอยู่', 'ซ้อมตอบคำถามที่โจมตีสมมติฐานที่เปราะที่สุดของทีม'],
  },
  {
    slug: 'bangkok-hack-48', name: 'Bangkok Hack 48: แก้ปัญหาเมืองใน 2 วัน',
    kind: 'hackathon', themes: ['innovation'],
    categories: ['technology', 'society'], type: 'contest', org: 'ศูนย์ข้อมูลเมือง',
    closesAt: inDays(14), region: 'bangkok', venue: 'ศูนย์ข้อมูลเมือง',
    prizeValue: 150000, rewards: ['certificate', 'trophy', 'publish'],
    levels: ['secondary', 'university'], teamMin: 3, teamMax: 5,
    sourceUrl: '', source: 'editorial', lastVerifiedAt: inDays(-2),
    description: 'แฮกกาธอน 48 ชั่วโมง โจทย์จริงจากข้อมูลเปิดของเมือง มีเมนเทอร์ประจำทีม',
    keywords: ['hackathon', 'แฮกกาธอน', 'โค้ด', 'ข้อมูลเปิด', 'เมือง', 'แอป'],
    overview: 'แฮกกาธอน 48 ชั่วโมงที่ใช้ข้อมูลเปิดของเมืองจริง ตั้งแต่เส้นทางรถประจำทางไปจนถึงจุดน้ำท่วมซ้ำซาก ทีมเลือกโจทย์เองได้ภายในกรอบที่ผู้จัดวางไว้ และมีเมนเทอร์ประจำทีมคอยช่วยตัดขอบเขตให้ทำเสร็จทัน',
    audience: 'นักเรียนและนักศึกษาที่เขียนโค้ดได้ระดับหนึ่ง รับทั้งนักพัฒนา นักออกแบบ และคนที่ถนัดคุยกับผู้ใช้ ทีมข้ามสาขาได้เปรียบเพราะต้องทั้งสร้างและเล่าให้เข้าใจ',
    format: ['เลือกโจทย์และชุดข้อมูลในคืนแรก พร้อมกำหนดผู้ใช้เป้าหมาย', 'พัฒนาต้นแบบต่อเนื่อง 48 ชั่วโมงโดยมีเมนเทอร์เข้าตรวจสองรอบ', 'สาธิตการทำงาน 5 นาที และตอบคำถามกรรมการ 5 นาที'],
    deliverables: ['ต้นแบบที่เดินเส้นทางใช้งานหลักได้จริง', 'ซอร์สโค้ดพร้อมวิธีติดตั้ง', 'สไลด์สรุปปัญหา วิธีแก้ และข้อจำกัดที่เหลือ'],
    preparation: ['สำรวจชุดข้อมูลเปิดของเมืองล่วงหน้าว่ามีอะไรใช้ได้บ้าง', 'ตกลงกันเรื่องเครื่องมือและวิธีแบ่งงานก่อนวันแข่ง', 'ซ้อมสาธิตแบบที่ยังเล่าได้แม้อินเทอร์เน็ตล่ม'],
  },
  {
    slug: 'ai-for-good', name: 'AI for Good Challenge รุ่นที่ 4',
    kind: 'hackathon', themes: ['innovation', 'medical'],
    categories: ['technology', 'health'], type: 'contest', org: 'ศูนย์วิจัยปัญญาประดิษฐ์ไทย',
    closesAt: inDays(26), region: 'online',
    prizeValue: 200000, rewards: ['certificate', 'publish', 'internship'],
    levels: ['university'], teamMin: 1, teamMax: 3,
    sourceUrl: '', source: 'editorial', lastVerifiedAt: inDays(-2),
    description: 'สร้างโมเดลช่วยงานสาธารณสุขชุมชน ตัดสินจากผลลัพธ์บนชุดข้อมูลปิด',
    keywords: ['ai', 'machine learning', 'ข้อมูล', 'สาธารณสุข', 'โมเดล', 'เทคโนโลยี'],
    overview: 'โจทย์คือช่วยให้ทีมสาธารณสุขชุมชนวางแผนลงพื้นที่ได้แม่นขึ้น ผู้เข้าแข่งได้ชุดข้อมูลฝึกที่ผ่านการปกปิดตัวตนแล้ว และถูกตัดสินด้วยชุดข้อมูลปิดที่ไม่เคยเห็น คะแนนจึงวัดการทำนายที่ใช้ได้จริง ไม่ใช่การจำข้อมูลฝึก',
    audience: 'นักศึกษาที่พอมีพื้นฐาน machine learning และอ่านโค้ดคนอื่นได้ ทีมเล็กทำงานคล่องกว่า เพราะต้องทดลองหลายรอบในเวลาจำกัด',
    format: ['ลงทะเบียนและรับชุดข้อมูลฝึกพร้อมเอกสารอธิบายตัวแปร', 'ส่งผลทำนายขึ้นกระดานคะแนนได้วันละ 3 ครั้งตลอดช่วงแข่ง', 'ห้าทีมคะแนนสูงสุดนำเสนอวิธีการและตอบคำถามเรื่องอคติของโมเดล'],
    deliverables: ['ไฟล์ผลทำนายตามรูปแบบที่กำหนด', 'ซอร์สโค้ดที่รันซ้ำได้พร้อมค่า seed', 'รายงานสั้นอธิบายวิธีการและข้อจำกัดของโมเดล'],
    preparation: ['ฝึกทำ cross-validation ให้เชื่อถือได้ก่อนไล่ตามคะแนนบนกระดาน', 'ศึกษาว่าข้อมูลสาธารณสุขมีอคติแฝงตรงไหนได้บ้าง', 'จัดระเบียบโค้ดให้รันซ้ำได้ตั้งแต่วันแรก'],
  },
  {
    slug: 'young-innovator-prize', name: 'Young Innovator Prize: สิ่งประดิษฐ์เพื่อผู้สูงวัย',
    kind: 'hackathon', themes: ['innovation', 'medical'],
    categories: ['technology', 'health'], type: 'contest', org: 'มูลนิธิเพื่อผู้สูงวัย',
    closesAt: inDays(10), region: 'central', venue: 'อุทยานวิทยาศาสตร์ประเทศไทย',
    prizeValue: 120000, rewards: ['certificate', 'trophy', 'publish'],
    levels: ['secondary', 'university'], teamMin: 2, teamMax: 5,
    sourceUrl: '', source: 'editorial', lastVerifiedAt: inDays(-2),
    description: 'ต้องมีต้นแบบใช้งานได้จริงและผลทดลองกับผู้ใช้อย่างน้อย 5 คน',
    keywords: ['นวัตกรรม', 'สิ่งประดิษฐ์', 'ผู้สูงอายุ', 'ต้นแบบ', 'ออกแบบ'],
    overview: 'เวทีนี้ไม่ตัดสินที่ความล้ำของเทคโนโลยี แต่ตัดสินที่หลักฐานว่าผู้สูงวัยใช้แล้วชีวิตดีขึ้นจริง ทุกทีมต้องมีต้นแบบที่จับต้องได้และผลทดลองกับผู้ใช้จริงอย่างน้อย 5 คน พร้อมบันทึกว่าอะไรไม่เวิร์กบ้าง',
    audience: 'นักเรียนและนักศึกษาที่ชอบลงมือทำและพร้อมออกไปคุยกับผู้ใช้จริง ไม่จำเป็นต้องใช้เทคโนโลยีซับซ้อน ของง่าย ๆ ที่แก้ปัญหาได้จริงมีโอกาสชนะเสมอ',
    format: ['เลือกปัญหาและพูดคุยกับผู้สูงวัยและผู้ดูแลเพื่อเข้าใจบริบท', 'สร้างต้นแบบและทดลองใช้กับผู้ใช้จริงอย่างน้อย 5 คน', 'นำเสนอต้นแบบพร้อมผลทดลองและแผนพัฒนาต่อ'],
    deliverables: ['ต้นแบบที่สาธิตการทำงานได้', 'บันทึกการทดลองกับผู้ใช้ 5 คนพร้อมข้อค้นพบ', 'โปสเตอร์สรุปปัญหา วิธีแก้ และสิ่งที่ยังต้องพัฒนา'],
    preparation: ['ฝึกสังเกตและถามโดยไม่รีบเสนอทางแก้', 'เรียนรู้วิธีทำต้นแบบเร็วด้วยวัสดุที่หาได้', 'เตรียมวิธีขอความยินยอมก่อนเก็บข้อมูลผู้ทดลอง'],
  },
  {
    slug: 'poster-unbound', name: 'Poster Unbound: ประกวดโปสเตอร์เพื่อสังคม',
    kind: 'case_competition', themes: ['education'],
    categories: ['design', 'society'], type: 'contest', org: 'สมาคมนักออกแบบกราฟิก',
    closesAt: inDays(3), region: 'online',
    prizeValue: 80000, rewards: ['certificate', 'publish'],
    levels: ['secondary', 'university'], teamMin: 1, teamMax: 1,
    sourceUrl: '', source: 'editorial', lastVerifiedAt: inDays(-2),
    description: 'หัวข้อปีนี้ “เมืองที่เดินได้” ส่งได้ไม่เกิน 3 ผลงานต่อคน ขนาด B2',
    keywords: ['ออกแบบ', 'โปสเตอร์', 'กราฟิก', 'design', 'สังคม', 'เมือง'],
    overview: 'ประกวดโปสเตอร์เดี่ยวในหัวข้อ “เมืองที่เดินได้” กรรมการมองหางานที่สื่อสารความคิดเดียวได้ชัดในระยะสายตาสามเมตร ไม่ใช่งานที่สวยแต่ต้องยืนอ่านนาน เทคนิคเปิดกว้างทั้งวาดมือ ภาพถ่าย และงานดิจิทัล',
    audience: 'นักเรียนและนักศึกษาที่ออกแบบกราฟิกได้ระดับหนึ่ง ส่งแบบเดี่ยวเท่านั้น เหมาะกับคนที่อยากได้ผลงานลงพอร์ตและพร้อมรับคำวิจารณ์ตรง ๆ',
    format: ['ส่งผลงานได้ไม่เกิน 3 ชิ้นต่อคน ขนาด B2 แนวตั้ง', 'กรรมการคัดรอบแรกจากไฟล์ดิจิทัลโดยไม่เห็นชื่อผู้ส่ง', 'ผลงานที่เข้ารอบจัดแสดงจริงและเจ้าของงานร่วมตอบคำถามในวันตัดสิน'],
    deliverables: ['ไฟล์โปสเตอร์ความละเอียด 300 dpi ขนาด B2', 'คำอธิบายแนวคิดไม่เกิน 150 คำต่อชิ้น', 'ไฟล์ต้นฉบับที่แก้ไขได้สำหรับผลงานที่เข้ารอบ'],
    preparation: ['ฝึกลดองค์ประกอบจนเหลือความคิดเดียวที่ชัดที่สุด', 'ทดสอบงานด้วยการมองจากระยะไกลและย่อเป็นภาพเล็ก', 'ตรวจสิทธิ์การใช้ฟอนต์และภาพประกอบทุกชิ้นก่อนส่ง'],
  },
  {
    slug: 'fintech-sandbox-cup', name: 'FinTech Sandbox Cup',
    kind: 'hackathon', themes: ['innovation', 'business'],
    categories: ['business', 'technology'], type: 'contest', org: 'ชมรมการเงินดิจิทัล',
    closesAt: inDays(21), region: 'bangkok', venue: 'อาคารตลาดทุน',
    prizeValue: 250000, rewards: ['certificate', 'trophy', 'internship'], fee: 300,
    levels: ['university'], teamMin: 3, teamMax: 5,
    sourceUrl: '', source: 'editorial', lastVerifiedAt: inDays(-9),
    description: 'พัฒนาต้นแบบบริการการเงินบนสภาพแวดล้อมทดสอบ พร้อมแผนความเสี่ยง',
    keywords: ['fintech', 'การเงิน', 'ธุรกิจ', 'ต้นแบบ', 'ความเสี่ยง'],
    overview: 'ทีมพัฒนาบริการการเงินบนสภาพแวดล้อมทดสอบที่ผู้จัดเตรียมไว้ โดยไม่แตะเงินจริง สิ่งที่ทำให้ทีมชนะไม่ใช่ฟีเจอร์เยอะ แต่คือการตอบให้ได้ว่าบริการนี้จะพังตรงไหน และจะกันความเสียหายอย่างไร',
    audience: 'นักศึกษาที่สนใจการเงินหรือเทคโนโลยีการเงิน ทีมควรมีทั้งคนเขียนโค้ดและคนที่อ่านกฎเกณฑ์ได้ เพราะคะแนนส่วนหนึ่งมาจากแผนจัดการความเสี่ยง',
    format: ['รับสิทธิ์เข้าใช้สภาพแวดล้อมทดสอบและเอกสาร API', 'พัฒนาต้นแบบภายในหกสัปดาห์พร้อมส่งรายงานความคืบหน้ากลางทาง', 'นำเสนอ 10 นาที โดยมีช่วงถามตอบเรื่องความเสี่ยงโดยเฉพาะ'],
    deliverables: ['ต้นแบบที่ทำงานบนสภาพแวดล้อมทดสอบ', 'แผนจัดการความเสี่ยงและการคุ้มครองผู้ใช้', 'สไลด์นำเสนอไม่เกิน 15 หน้า'],
    preparation: ['ทำความเข้าใจกฎเกณฑ์พื้นฐานของบริการการเงินก่อนออกแบบ', 'ฝึกเขียนกรณีที่ระบบทำงานผิดพลาดและวิธีรับมือ', 'ทดสอบต้นแบบกับผู้ใช้ที่ไม่คุ้นเคยกับการเงินดิจิทัล'],
  },
  {
    slug: 'circular-design-lab', name: 'Circular Design Lab: ออกแบบบรรจุภัณฑ์ใช้ซ้ำ',
    kind: 'hackathon', themes: ['innovation'],
    categories: ['design', 'environment'], type: 'workshop', org: 'สถาบันวัสดุหมุนเวียน',
    closesAt: inDays(31), region: 'bangkok', venue: 'โรงงานต้นแบบบางพลี',
    prizeValue: 0, prizeNote: 'ได้ผลิตจริงกับโรงงานพันธมิตร', rewards: ['certificate', 'publish', 'partnership'],
    levels: ['university'], teamMin: 2, teamMax: 4,
    sourceUrl: '', source: 'editorial', lastVerifiedAt: inDays(-2),
    description: 'เวิร์กชอป 3 สัปดาห์ก่อนตัดสิน ผู้ชนะได้ผลิตจริงกับโรงงานพันธมิตร',
    keywords: ['ออกแบบ', 'บรรจุภัณฑ์', 'วัสดุ', 'ยั่งยืน', 'design', 'หมุนเวียน'],
    overview: 'ออกแบบบรรจุภัณฑ์ที่ถูกใช้ซ้ำได้จริงในร้านค้าปลีก ไม่ใช่แค่สวยในภาพเรนเดอร์ ทีมจะผ่านเวิร์กชอปสามสัปดาห์กับนักออกแบบและวิศวกรวัสดุ ก่อนตัดสินจากต้นแบบที่ผลิตได้จริงในต้นทุนที่กำหนด',
    audience: 'นักศึกษาสายออกแบบ วิศวกรรม หรือวิทยาศาสตร์วัสดุ ทีมที่มีทั้งคนออกแบบรูปทรงและคนคิดเรื่องต้นทุนการผลิตจะทำงานได้ครบกว่า',
    format: ['เข้าเวิร์กชอปสามสัปดาห์เรื่องวัสดุ ต้นทุน และการใช้ซ้ำ', 'พัฒนาต้นแบบและทดสอบการใช้งานซ้ำอย่างน้อย 20 รอบ', 'นำเสนอต้นแบบพร้อมต้นทุนต่อชิ้นและแผนการผลิต'],
    deliverables: ['ต้นแบบบรรจุภัณฑ์ที่จับต้องได้', 'ผลทดสอบการใช้ซ้ำและการทำความสะอาด', 'ตารางต้นทุนต่อชิ้นที่ปริมาณการผลิตสามระดับ'],
    preparation: ['ศึกษาข้อจำกัดของวัสดุที่สัมผัสอาหารได้', 'ฝึกคิดต้นทุนต่อชิ้นตั้งแต่ขั้นร่างแบบ', 'สังเกตว่าผู้ใช้จริงคืนบรรจุภัณฑ์หรือไม่ เพราะอะไร'],
  },
  {
    slug: 'robotics-frontier-league', name: 'Robotics Frontier League',
    kind: 'hackathon', themes: ['innovation', 'education'],
    categories: ['technology', 'education'], type: 'contest', org: 'ลีกหุ่นยนต์ประเทศไทย',
    closesAt: inDays(48), region: 'central', venue: 'สนามแข่งหุ่นยนต์ ปทุมธานี',
    prizeValue: 180000, rewards: ['certificate', 'trophy'], fee: 500,
    levels: ['secondary', 'university'], teamMin: 3, teamMax: 6,
    sourceUrl: '', source: 'editorial', lastVerifiedAt: inDays(-45),
    description: 'หุ่นยนต์อัตโนมัติเก็บวัตถุในสนาม 4×4 เมตร แข่งสองรอบคัดและรอบชิง',
    keywords: ['หุ่นยนต์', 'robotics', 'เทคโนโลยี', 'อัตโนมัติ', 'วิศวกรรม'],
    overview: 'หุ่นยนต์ต้องทำงานอัตโนมัติเต็มรูปแบบในสนาม 4×4 เมตร ไม่มีการบังคับระหว่างแข่ง ทีมที่ชนะมักไม่ใช่ทีมที่หุ่นเร็วที่สุด แต่เป็นทีมที่หุ่นทำงานซ้ำได้เหมือนเดิมทุกรอบแม้แสงและตำแหน่งวัตถุจะเปลี่ยน',
    audience: 'นักเรียนและนักศึกษาสายวิศวกรรม เครื่องกล หรือคอมพิวเตอร์ ทีมควรมีทั้งคนทำโครงสร้าง คนทำระบบควบคุม และคนดูแลการทดสอบ',
    format: ['ส่งแบบหุ่นยนต์และผ่านการตรวจความปลอดภัยก่อนลงสนาม', 'รอบคัดสองรอบ นับคะแนนจากจำนวนวัตถุที่เก็บได้ในเวลา 3 นาที', 'แปดทีมคะแนนสูงสุดเข้ารอบชิงแบบแพ้คัดออก'],
    deliverables: ['หุ่นยนต์ที่ผ่านการตรวจความปลอดภัย', 'เอกสารออกแบบระบบกลไกและระบบควบคุม', 'บันทึกผลการทดสอบอย่างน้อย 30 รอบ'],
    preparation: ['สร้างสนามจำลองไว้ทดสอบซ้ำในสภาพแสงที่ต่างกัน', 'ออกแบบให้ซ่อมเร็วระหว่างรอบแข่ง', 'เตรียมอะไหล่ชิ้นที่พังบ่อยไปเผื่อเสมอ'],
  },
  {
    slug: 'social-impact-pitch-night', name: 'Social Impact Pitch Night',
    kind: 'case_competition', themes: ['business'],
    categories: ['business', 'society'], type: 'contest', org: 'เครือข่ายกิจการเพื่อสังคม',
    closesAt: inDays(8), region: 'bangkok', venue: 'เครือข่ายกิจการเพื่อสังคม',
    prizeValue: 60000, rewards: ['certificate', 'partnership'],
    levels: ['secondary', 'university'], teamMin: 2, teamMax: 4,
    sourceUrl: '', source: 'editorial', lastVerifiedAt: inDays(-2),
    description: 'พิทช์ 5 นาทีต่อหน้าคณะกรรมการ 6 คน เน้นตัวชี้วัดผลกระทบที่วัดได้',
    keywords: ['สังคม', 'ธุรกิจ', 'พิทช์', 'ผลกระทบ', 'กิจการเพื่อสังคม'],
    overview: 'เวทีพิทช์สั้นสำหรับไอเดียที่ตั้งใจแก้ปัญหาสังคม สิ่งที่กรรมการถามทุกทีมคือจะรู้ได้อย่างไรว่ามันได้ผล ทีมที่เตรียมตัวชี้วัดที่วัดได้จริงและยอมรับข้อจำกัดของตัวเอง มักได้คะแนนดีกว่าทีมที่สัญญาใหญ่',
    audience: 'นักเรียนและนักศึกษาที่มีไอเดียเพื่อสังคม ไม่จำเป็นต้องมีต้นแบบแล้ว แต่ต้องอธิบายได้ว่าจะพิสูจน์ไอเดียอย่างไรในงบที่จำกัด',
    format: ['ส่งใบสมัครพร้อมสรุปไอเดียหนึ่งหน้า', 'ทีมที่ผ่านเข้ารอบซ้อมพิทช์กับพี่เลี้ยงหนึ่งครั้ง', 'พิทช์สด 5 นาที และตอบคำถามกรรมการ 6 คน อีก 5 นาที'],
    deliverables: ['สรุปไอเดียหนึ่งหน้า', 'สไลด์พิทช์ไม่เกิน 8 หน้า', 'ตัวชี้วัดผลกระทบอย่างน้อย 3 ตัวพร้อมวิธีเก็บข้อมูล'],
    preparation: ['ฝึกเล่าปัญหาให้เห็นภาพภายในหนึ่งนาทีแรก', 'เลือกตัวชี้วัดที่เก็บได้จริงด้วยทรัพยากรของทีม', 'เตรียมคำตอบว่าถ้าไอเดียไม่ได้ผลจะรู้ได้อย่างไร'],
  },
  {
    slug: 'agritech-innovation-camp', name: 'AgriTech Innovation Camp',
    kind: 'hackathon', themes: ['innovation'],
    categories: ['environment', 'technology'], type: 'camp', org: 'สถาบันเกษตรอัจฉริยะ',
    closesAt: inDays(55), region: 'northeast', venue: 'ศูนย์เรียนรู้เกษตรอัจฉริยะ ขอนแก่น', opensAt: inDays(10),
    prizeValue: 140000, rewards: ['certificate', 'partnership'],
    levels: ['university'], teamMin: 3, teamMax: 5,
    sourceUrl: '', source: 'editorial', lastVerifiedAt: inDays(-16),
    description: 'ค่าย 5 วันในพื้นที่เกษตรจริง ทีมที่ผ่านรอบแรกได้งบทดลอง 20,000 บาท',
    keywords: ['เกษตร', 'นวัตกรรม', 'agritech', 'ค่าย', 'ชุมชน'],
    overview: 'ค่ายห้าวันในแปลงเกษตรจริงที่ทีมต้องกินอยู่และทำงานร่วมกับเกษตรกร โจทย์มาจากปัญหาที่เกษตรกรเจอจริง ทีมที่ผ่านรอบแรกได้งบทดลอง 20,000 บาทไปพัฒนาต่ออีกสองเดือนก่อนตัดสิน',
    audience: 'นักศึกษาที่พร้อมลงพื้นที่จริงและทำงานกับคนที่ไม่ได้พูดภาษาเทคโนโลยี เหมาะกับทีมที่มีทั้งสายเกษตร วิศวกรรม และธุรกิจ',
    format: ['เข้าค่ายห้าวันในพื้นที่ พร้อมสัมภาษณ์เกษตรกรเจ้าของโจทย์', 'ทีมที่ผ่านรอบแรกรับงบทดลองและพัฒนาต่อสองเดือน', 'นำเสนอผลการทดลองในแปลงจริงพร้อมข้อมูลก่อนและหลัง'],
    deliverables: ['ต้นแบบที่ทดลองในแปลงจริงแล้ว', 'ข้อมูลเปรียบเทียบก่อนและหลังใช้งาน', 'แผนต้นทุนและการดูแลรักษาสำหรับเกษตรกร'],
    preparation: ['เตรียมพร้อมสำหรับการทำงานกลางแจ้งห้าวันเต็ม', 'ฝึกสัมภาษณ์โดยไม่ใช้ศัพท์เทคนิค', 'คิดเรื่องค่าซ่อมและอะไหล่ตั้งแต่ขั้นออกแบบ'],
  },
  {
    slug: 'type-and-letter', name: 'Type & Letter: ประกวดฟอนต์ไทย',
    kind: 'case_competition', themes: ['education'],
    categories: ['design', 'writing'], type: 'contest', org: 'ชมรมตัวพิมพ์ไทย',
    closesAt: inDays(43), region: 'online',
    prizeValue: 100000, rewards: ['certificate', 'publish'],
    levels: ['university'], teamMin: 1, teamMax: 2,
    sourceUrl: '', source: 'editorial', lastVerifiedAt: inDays(-38),
    description: 'ส่งชุดตัวอักษรอย่างน้อย 2 น้ำหนัก ครบพยัญชนะ สระ และวรรณยุกต์',
    keywords: ['ฟอนต์', 'ตัวพิมพ์', 'ออกแบบ', 'typography', 'ภาษาไทย'],
    overview: 'ออกแบบฟอนต์ไทยที่ใช้งานได้จริง ไม่ใช่แค่ชุดตัวอักษรโชว์ กรรมการตรวจถึงระดับการวางสระและวรรณยุกต์ซ้อนกัน ซึ่งเป็นจุดที่ฟอนต์ไทยส่วนใหญ่พังโดยที่ผู้ออกแบบไม่ทันสังเกต',
    audience: 'นักศึกษาสายออกแบบที่สนใจตัวพิมพ์โดยเฉพาะ ควรเคยใช้โปรแกรมออกแบบฟอนต์มาก่อน เพราะเวลาส่วนใหญ่หมดไปกับการเก็บรายละเอียด',
    format: ['ส่งชุดตัวอักษรอย่างน้อย 2 น้ำหนัก ครบพยัญชนะ สระ และวรรณยุกต์', 'กรรมการทดสอบการวางสระซ้อนและการเรียงข้อความจริง', 'ผลงานที่เข้ารอบนำเสนอแนวคิดและกระบวนการออกแบบ'],
    deliverables: ['ไฟล์ฟอนต์ที่ติดตั้งและใช้งานได้', 'ตัวอย่างการเรียงข้อความยาวอย่างน้อย 300 คำ', 'เอกสารอธิบายแนวคิดและกลุ่มการใช้งานที่ตั้งใจ'],
    preparation: ['ศึกษาการวางสระและวรรณยุกต์ในกรณีซ้อนหลายชั้น', 'ทดสอบฟอนต์ในขนาดเล็กบนหน้าจอจริง', 'เผื่อเวลาสำหรับการเก็บรายละเอียดมากกว่าที่คิดไว้'],
  },
  {
    slug: 'data-story-awards', name: 'Data Story Awards',
    kind: 'case_competition', themes: ['innovation', 'education'],
    categories: ['technology', 'writing'], type: 'contest', org: 'กลุ่มนักข่าวข้อมูล',
    closesAt: inDays(5), region: 'online',
    prizeValue: 70000, rewards: ['certificate', 'publish'],
    levels: ['secondary', 'university'], teamMin: 1, teamMax: 3,
    sourceUrl: '', source: 'editorial', lastVerifiedAt: inDays(-2),
    description: 'เล่าเรื่องจากข้อมูลเปิด 1 ชุด เป็นหน้าเว็บหรืออินโฟกราฟิกเดียว',
    keywords: ['ข้อมูล', 'data', 'เล่าเรื่อง', 'อินโฟกราฟิก', 'ข่าว', 'visualization'],
    overview: 'เลือกข้อมูลเปิดหนึ่งชุดแล้วเล่าเรื่องที่คนทั่วไปเข้าใจได้ในหน้าเดียว ข้อจำกัดคือหนึ่งชุดข้อมูลและหนึ่งหน้า ซึ่งบังคับให้ต้องเลือกว่าจะเล่าอะไรและตัดอะไรทิ้ง กรรมการให้น้ำหนักกับความซื่อตรงต่อข้อมูลมากกว่าความหวือหวาของกราฟ',
    audience: 'นักเรียนและนักศึกษาที่สนใจข้อมูลหรือการสื่อสาร ไม่ต้องเขียนโค้ดเป็นก็ส่งได้ ถ้าทำอินโฟกราฟิกที่อ่านข้อมูลถูกต้อง',
    format: ['เลือกชุดข้อมูลเปิดหนึ่งชุดและระบุแหล่งที่มาให้ชัด', 'สร้างผลงานเป็นหน้าเว็บเดียวหรืออินโฟกราฟิกชิ้นเดียว', 'ส่งพร้อมบันทึกวิธีคำนวณเพื่อให้กรรมการตรวจซ้ำได้'],
    deliverables: ['ผลงานหนึ่งหน้าในรูปแบบเว็บหรือภาพ', 'ไฟล์ข้อมูลและขั้นตอนการคำนวณที่ตรวจซ้ำได้', 'คำอธิบายว่าเลือกเล่าประเด็นนี้เพราะอะไร'],
    preparation: ['ฝึกตรวจสอบว่าข้อมูลตอบคำถามที่ตั้งไว้จริงหรือไม่', 'เรียนรู้ว่ากราฟแบบไหนเหมาะกับข้อมูลแบบไหน', 'ให้คนนอกลองอ่านผลงานแล้วเล่ากลับว่าเข้าใจอะไร'],
  },
  {
    slug: 'deep-tech-grant-pitch', name: 'Deep Tech Grant Pitch',
    kind: 'hackathon', themes: ['innovation'],
    categories: ['academic', 'technology'], type: 'scholarship', org: 'กองทุนวิจัยขั้นแนวหน้า',
    closesAt: inDays(53), region: 'bangkok', venue: 'กองทุนวิจัยขั้นแนวหน้า', opensAt: inDays(14),
    prizeValue: 500000, rewards: ['certificate', 'partnership'],
    levels: ['university'], teamMin: 2, teamMax: 5,
    sourceUrl: '', source: 'editorial', lastVerifiedAt: inDays(-33),
    description: 'สำหรับงานวิจัยที่มีสิทธิบัตรหรือผลตีพิมพ์ รอบสุดท้ายพิทช์ 12 นาที',
    keywords: ['วิจัย', 'deep tech', 'ทุน', 'นวัตกรรม', 'สิทธิบัตร'],
    overview: 'เวทีขอทุนสำหรับงานวิจัยที่มีผลตีพิมพ์หรือสิทธิบัตรรองรับแล้ว ไม่ใช่เวทีสำหรับไอเดียใหม่ คำถามหลักของกรรมการคืองานวิจัยนี้จะออกจากห้องแล็บไปถึงผู้ใช้ได้อย่างไร และเงินทุนก้อนนี้จะใช้พิสูจน์อะไร',
    audience: 'นักศึกษาระดับบัณฑิตศึกษาหรือทีมวิจัยที่มีอาจารย์ที่ปรึกษา ต้องมีหลักฐานทางวิชาการรองรับ จึงไม่เหมาะกับทีมที่เพิ่งเริ่มจากศูนย์',
    format: ['ส่งเอกสารงานวิจัยพร้อมหลักฐานการตีพิมพ์หรือสิทธิบัตร', 'ผ่านการตรวจทางวิชาการโดยผู้ประเมินสองคน', 'พิทช์รอบสุดท้าย 12 นาที และตอบคำถาม 15 นาที'],
    deliverables: ['เอกสารสรุปงานวิจัยไม่เกิน 20 หน้า', 'แผนการใช้ทุนพร้อมหมุดหมายที่ตรวจสอบได้', 'สไลด์พิทช์ไม่เกิน 20 หน้า'],
    preparation: ['เตรียมอธิบายงานวิจัยให้คนนอกสาขาเข้าใจใน 3 นาที', 'ระบุให้ชัดว่าเงินทุนจะใช้พิสูจน์สมมติฐานข้อไหน', 'เตรียมคำตอบเรื่องความเป็นเจ้าของทรัพย์สินทางปัญญา'],
  },
  {
    slug: 'retail-growth-case-challenge', name: 'Retail Growth Case Challenge',
    kind: 'case_competition', themes: ['business'],
    categories: ['business', 'marketing'], type: 'contest', org: 'ชมรมการตลาดค้าปลีก',
    closesAt: inDays(11), region: 'bangkok', venue: 'ชมรมการตลาดค้าปลีก',
    prizeValue: 110000, rewards: ['certificate', 'trophy', 'internship'],
    levels: ['university'], teamMin: 3, teamMax: 4,
    sourceUrl: '', source: 'editorial', lastVerifiedAt: inDays(-2),
    description: 'แก้เคสจริงจากร้านค้าปลีก 3 สาขา ส่งสไลด์ 8 หน้าภายใน 72 ชั่วโมง',
    keywords: ['ธุรกิจ', 'การตลาด', 'case', 'ค้าปลีก', 'วิเคราะห์'],
    overview: 'เคสแข่งขันแบบจับเวลา 72 ชั่วโมงจากข้อมูลจริงของร้านค้าปลีกสามสาขา ความยากไม่ได้อยู่ที่การวิเคราะห์ แต่อยู่ที่การตัดสินใจว่าจะเสนออะไรในแปดหน้า และจะทิ้งอะไรไว้ข้างหลัง',
    audience: 'นักศึกษาที่อยากฝึกแก้เคสจริงภายใต้เวลาจำกัด ทีมที่แบ่งงานชัดและตัดสินใจเร็วได้เปรียบ เพราะ 72 ชั่วโมงหมดเร็วกว่าที่คิดเสมอ',
    format: ['รับโจทย์และชุดข้อมูลยอดขายสามสาขาพร้อมกันทุกทีม', 'ทำงาน 72 ชั่วโมงโดยไม่มีการติดต่อกรรมการ', 'ทีมที่ผ่านรอบแรกนำเสนอ 10 นาทีและตอบคำถาม 10 นาที'],
    deliverables: ['สไลด์ไม่เกิน 8 หน้า', 'ไฟล์คำนวณที่ตรวจย้อนกลับได้', 'บทสรุปข้อเสนอหนึ่งหน้า'],
    preparation: ['ฝึกอ่านข้อมูลยอดขายและหาความผิดปกติให้เร็ว', 'ซ้อมทำเคสจับเวลาอย่างน้อยหนึ่งรอบก่อนแข่งจริง', 'ตกลงล่วงหน้าว่าใครตัดสินใจขั้นสุดท้ายเมื่อทีมเห็นไม่ตรงกัน'],
  },
];


export function categoryLabel(id: CategoryId) {
  return categories.find((category) => category.id === id)?.label ?? '';
}

/** หมวดแรกคือหมวดหลัก ใช้กับสีปก ป้ายบนการ์ด และการจับคู่เมนเทอร์ */
export function primaryCategory(competition: Competition) {
  return competition.categories[0];
}

export function deadlineOf(competition: Competition) {
  const date = new Date(`${competition.closesAt}T23:59:00`);
  return date;
}

/** จำนวนวันที่เหลือ ปัดขึ้นเพื่อให้ "อีก 1 วัน" หมายถึงยังส่งทันวันนี้ */
export function daysLeft(competition: Competition) {
  const diff = deadlineOf(competition).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

const thaiDate = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
export function formatDate(iso: string) {
  return thaiDate.format(new Date(`${iso}T12:00:00`));
}

export function formatDeadline(competition: Competition) {
  return formatDate(competition.closesAt);
}

/** ป้ายขนาดทีมคำนวณจาก teamMin และ teamMax เพื่อไม่ให้มีข้อความซ้ำกับตัวเลข */
export function teamLabel(competition: Competition) {
  const { teamMin, teamMax } = competition;
  if (teamMin === 1 && teamMax === 1) return 'เดี่ยว';
  if (teamMin === 1 && teamMax === 2) return 'เดี่ยวหรือคู่';
  if (teamMin === teamMax) return `ทีม ${teamMin} คน`;
  return `ทีม ${teamMin}–${teamMax} คน`;
}

const baht = new Intl.NumberFormat('th-TH');
/** เงินรางวัล 0 ต้องอ่านว่าไม่มีเงินรางวัล ไม่ใช่ "0 บาท" */
export function prizeLabel(competition: Competition) {
  if (competition.prizeValue > 0) return `รางวัลรวม ${baht.format(competition.prizeValue)} บาท`;
  return competition.prizeNote ?? 'ไม่มีเงินรางวัล';
}

export function feeLabel(competition: Competition) {
  return competition.fee ? `ค่าสมัคร ${baht.format(competition.fee)} บาท` : 'สมัครฟรี';
}

export function placeLabel(competition: Competition) {
  if (competition.region === 'online') return regionLabels.online;
  return competition.venue ? `${competition.venue} · ${regionLabels[competition.region]}` : regionLabels[competition.region];
}

export function findCompetition(slug: string | undefined) {
  return competitions.find((competition) => competition.slug === slug);
}

export type TeamSizeId = 'solo' | 'small' | 'mid' | 'large';
export const teamSizeOptions: { id: TeamSizeId; label: string; min: number; max: number }[] = [
  { id: 'solo', label: 'เดี่ยว', min: 1, max: 1 },
  { id: 'small', label: '2–3 คน', min: 2, max: 3 },
  { id: 'mid', label: '4–6 คน', min: 4, max: 6 },
  { id: 'large', label: 'มากกว่า 6 คน', min: 7, max: Infinity },
];

export type TimingId = 'd7' | 'd30' | 'upcoming';
export const timingOptions: { id: TimingId; label: string }[] = [
  { id: 'd7', label: 'ปิดรับใน 7 วัน' },
  { id: 'd30', label: 'ปิดรับใน 30 วัน' },
  { id: 'upcoming', label: 'ยังไม่เปิดรับ' },
];

/** เพดานของแถบเลือกช่วง ค่าสูงสุดหมายถึงไม่จำกัด ไม่ใช่ 500,000 พอดี */
export const PRIZE_CEILING = 500000;

export interface Filters {
  query: string;
  categories: CategoryId[];
  types: OpportunityType[];
  levels: Level[];
  regions: Region[];
  teamSizes: TeamSizeId[];
  rewards: Reward[];
  prizeMin: number;
  prizeMax: number;
  freeOnly: boolean;
  timing: TimingId | '';
}

export const emptyFilters: Filters = {
  query: '', categories: [], types: [], levels: [], regions: [], teamSizes: [], rewards: [],
  prizeMin: 0, prizeMax: PRIZE_CEILING, freeOnly: false, timing: '',
};

/** นับเฉพาะตัวกรองในแผง ชิปหมวดกับช่องค้นหาอยู่นอกแผงจึงไม่นับ */
export function activeFilterCount(filters: Filters) {
  return filters.types.length + filters.levels.length + filters.regions.length
    + filters.teamSizes.length + filters.rewards.length
    + (filters.prizeMin > 0 || filters.prizeMax < PRIZE_CEILING ? 1 : 0)
    + (filters.freeOnly ? 1 : 0) + (filters.timing ? 1 : 0);
}

function matchesTiming(competition: Competition, timing: TimingId) {
  if (timing === 'upcoming') return Boolean(competition.opensAt) && new Date(`${competition.opensAt}T00:00:00`).getTime() > Date.now();
  const left = daysLeft(competition);
  return left >= 0 && left <= (timing === 'd7' ? 7 : 30);
}

function matchesTeam(competition: Competition, sizes: TeamSizeId[]) {
  return sizes.some((id) => {
    const bucket = teamSizeOptions.find((option) => option.id === id)!;
    // ทีม 2–5 คน ตรงกับทั้งช่วง 2–3 และ 4–6 เพราะขนาดทีมที่รับคาบเกี่ยวกัน
    return competition.teamMin <= bucket.max && competition.teamMax >= bucket.min;
  });
}

/* ภายในกลุ่มเดียวกันเป็น "หรือ" ระหว่างกลุ่มเป็น "และ" กลุ่มที่ไม่ได้เลือกอะไร
   แปลว่าไม่กรองด้วยกลุ่มนั้น */
export function filterCompetitions(filters: Filters) {
  const terms = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return competitions.filter((competition) => {
    const text = [
      competition.name, competition.description, competition.org, typeLabels[competition.type],
      ...competition.categories.map(categoryLabel), ...competition.keywords,
    ].join(' ').toLocaleLowerCase();
    if (!terms.every((term) => text.includes(term))) return false;
    if (filters.categories.length && !filters.categories.some((id) => competition.categories.includes(id))) return false;
    if (filters.types.length && !filters.types.includes(competition.type)) return false;
    if (filters.levels.length && !filters.levels.some((level) => competition.levels.includes(level))) return false;
    if (filters.regions.length && !filters.regions.includes(competition.region)) return false;
    if (filters.teamSizes.length && !matchesTeam(competition, filters.teamSizes)) return false;
    if (filters.rewards.length && !filters.rewards.some((reward) => competition.rewards.includes(reward))) return false;
    if (competition.prizeValue < filters.prizeMin) return false;
    if (filters.prizeMax < PRIZE_CEILING && competition.prizeValue > filters.prizeMax) return false;
    if (filters.freeOnly && competition.fee) return false;
    if (filters.timing && !matchesTiming(competition, filters.timing)) return false;
    return true;
  });
}

export type SortId = 'deadline' | 'new' | 'prize' | 'name';
export const sortOptions: { id: SortId; label: string }[] = [
  { id: 'deadline', label: 'ใกล้ปิดรับก่อน' },
  { id: 'new', label: 'เพิ่มใหม่ล่าสุด' },
  { id: 'prize', label: 'เงินรางวัลสูงสุด' },
  { id: 'name', label: 'ชื่อ ก–ฮ' },
];

export function sortCompetitions(list: Competition[], sort: SortId) {
  const listedOrder = new Map(competitions.map((competition, index) => [competition.slug, index]));
  return list.slice().sort((a, b) => {
    if (sort === 'prize') return b.prizeValue - a.prizeValue;
    if (sort === 'new') return listedOrder.get(b.slug)! - listedOrder.get(a.slug)!;
    if (sort === 'name') return a.name.localeCompare(b.name, 'th');
    return a.closesAt.localeCompare(b.closesAt);
  });
}
