import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/* ตรวจว่าไม่มีข้อความภาษาไทยฝังอยู่ในโค้ดหน้าเว็บ ข้อความที่ผู้ใช้เห็นต้องมาจาก src/i18n เท่านั้น
   รัน: npm run check:i18n

   เว็บกำลังย้ายทีละส่วน ไฟล์ที่ยังไม่ได้ย้ายอยู่ในรายการ PENDING ด้านล่าง
   - ไฟล์นอกรายการมีภาษาไทย → ตก (มีคนเผลอพิมพ์ไทยฝังกลับเข้าไป)
   - ไฟล์ในรายการไม่มีภาษาไทยแล้ว → ตก ให้ลบออกจากรายการ รายการจะได้หดลงจริง
   คอมเมนต์เขียนไทยได้ตามปกติ สคริปต์ตัดคอมเมนต์ทิ้งก่อนตรวจ */

const PENDING = new Set([]);


/** พจนานุกรมภาษาไทยคือที่ที่ภาษาไทยควรอยู่ */
const ALLOWED = new Set(['src/i18n/th.ts', 'src/i18n/go-between.ts']);

/* ไฟล์เหล่านี้มีภาษาไทยอยู่ได้เพราะเป็นเนื้อหาหรือข้อมูลที่ระบบเก็บ ไม่ใช่ข้อความของหน้าเว็บ
   ป้ายที่ผู้ใช้เห็น (หมวด ระดับ ภูมิภาค ประเภท ความถนัด ฯลฯ) ต้องอยู่ใน src/i18n เท่านั้น
   - sample-*.ts  ข้อมูลตัวอย่างสมมติ (ชื่อเวที ประวัติเมนเทอร์ ใบส่งเวที) เป็นเนื้อหาไม่ใช่ UI
                  ใช้เติมฐานข้อมูลตอน seed และในเทส ข้อมูลจริงมาจากฐานข้อมูลแทนที่ภายหลัง
   - stored-values.ts  ค่าที่บันทึกลงฐานข้อมูลเป็นข้อความไทย (ความถนัด สถานะการเรียนหรือทำงาน)
                  เปลี่ยนตามภาษาหน้าเว็บไม่ได้ ไม่งั้นแถวเดิมจะไม่ตรงกับตัวเลือก
   - focus-keywords.ts  คลังคำไทยและอังกฤษสำหรับเทียบข้อความที่เมนเทอร์เขียนเอง ไม่ได้แสดงให้ใครเห็น */
const CONTENT = new Set([
  'src/data/sample-competitions.ts',
  'src/data/sample-mentors.ts',
  'src/data/sample-submissions.ts',
  'src/data/stored-values.ts',
  'src/data/focus-keywords.ts',
]);

/* หน้าจัดการเป็นภาษาไทยอย่างเดียวโดยตั้งใจ เพราะใช้กันเองในทีม (ผู้ใช้ตัดสิน 30 ก.ย. 2569)
   ไม่ต้องย้ายไป src/i18n และไม่นับเป็นงานค้าง */
const THAI_ONLY = (path) => path.startsWith('src/pages/admin/');

const THAI = /[฀-๿]/;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// ตัดคอมเมนต์แบบบล็อก (รวมคอมเมนต์ใน JSX) และคอมเมนต์บรรทัดเดียวทิ้ง
// เครื่องหมาย // ใน URL เช่น 'https://…' ไม่ถูกตัดเพราะมี : นำหน้า
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const problems = [];
const stillPending = [];

for (const path of files('src')) {
  const rel = relative('.', path).split(sep).join('/');
  if (ALLOWED.has(rel) || CONTENT.has(rel) || THAI_ONLY(rel)) continue;
  const lines = stripComments(readFileSync(path, 'utf8')).split('\n');
  const hits = lines.map((line, i) => [i + 1, line]).filter(([, line]) => THAI.test(line));

  if (PENDING.has(rel)) {
    if (hits.length) stillPending.push(rel);
    else problems.push(`${rel}: ย้ายเสร็จแล้ว ไม่มีภาษาไทยเหลือ ให้ลบออกจาก PENDING ใน scripts/check-i18n.mjs`);
    continue;
  }
  for (const [lineNo, line] of hits.slice(0, 5)) {
    problems.push(`${rel}:${lineNo}: มีภาษาไทยฝังในโค้ด ให้ย้ายไป src/i18n → ${line.trim().slice(0, 80)}`);
  }
}

const all = files('src').map((path) => relative('.', path).split(sep).join('/'));
const thaiOnly = all.filter(THAI_ONLY).length;
const content = all.filter((path) => CONTENT.has(path)).length;
console.log(`ย้ายเสร็จแล้ว: ${all.length - stillPending.length - ALLOWED.size - content - thaiOnly} ไฟล์ · ยังค้าง: ${stillPending.length} ไฟล์ · ไฟล์เนื้อหาและค่าที่เก็บ: ${content} ไฟล์ · หน้าจัดการภาษาไทย: ${thaiOnly} ไฟล์`);
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('ไม่มีข้อความไทยหลงในไฟล์ที่ย้ายแล้ว');
