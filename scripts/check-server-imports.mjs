import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

/* API บน Vercel รันเป็น ESM ของ Node ตรง ๆ import แบบ relative ต้องลงท้าย .js
   ฝั่งหน้าเว็บ Vite ไม่สนนามสกุล จึงลืมได้ง่าย ไฟล์ใน src/ ที่ server ดึงไปใช้
   ถ้าลืมแม้ไฟล์เดียว ฟังก์ชันทั้งตัวพังตอนเริ่มและทุก /api ตอบ 500
   สคริปต์นี้ไล่ทุกไฟล์ที่ API ใช้จริง แล้วหยุด build ถ้าเจอ import ที่ไม่มี .js */

const { metafile } = await build({
  entryPoints: ['api/index.ts'], bundle: true, platform: 'node', format: 'esm',
  packages: 'external', write: false, metafile: true, logLevel: 'silent',
});

const problems = [];
for (const file of Object.keys(metafile.inputs)) {
  const source = readFileSync(file, 'utf8');
  for (const [line, text] of source.split('\n').entries()) {
    const match = text.match(/^\s*(?:import|export)\s(?!type\s).*from\s+'(\.{1,2}\/[^']+)'/);
    if (match && !match[1].endsWith('.js')) problems.push(`${file}:${line + 1} ${match[1]}`);
  }
}

if (problems.length) {
  console.error('import ที่ API ใช้ต้องลงท้าย .js ไม่งั้นบน Vercel ทุก /api จะตอบ 500:');
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`import ของ API ครบทั้ง ${Object.keys(metafile.inputs).length} ไฟล์`);
