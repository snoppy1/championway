# ChampionWays

เว็บต้นแบบภาษาไทยสำหรับสำรวจและรู้จักเวทีแข่งขัน สร้างด้วย React, TypeScript, Vite และ React Router

## เปิดใช้งานบน Windows

ต้องมี Node.js 22.12+ หรือ Node.js 24 (พัฒนาด้วย 24.13.1)

```powershell
cd D:\champway
npm.cmd install
npm.cmd run dev
```

เปิด http://127.0.0.1:5173/

```powershell
npm.cmd run build
npm.cmd run preview
```

คำสั่ง preview เปิด build ที่ http://127.0.0.1:4173 ใช้ `npm.cmd` เพื่อไม่ต้องเปลี่ยน PowerShell execution policy

## ทดสอบ

```powershell
npm.cmd test
```

Playwright ใช้ Microsoft Edge ที่ติดตั้งในเครื่อง โดยรัน headless ที่ 1440, 768 และ 390px และเปิด dev server อัตโนมัติเมื่อยังไม่มี ตรวจการค้นหา ตัวกรอง การเรียงลำดับ การแบ่งหน้า การบันทึกเวที ทุกหน้ารายละเอียด ขั้นตอนจับคู่เมนเทอร์ คีย์บอร์ด และ accessibility ด้วย axe ภาพหน้าจออยู่ใน `artifacts/` รายงานอยู่ใน `playwright-report/`

หากเครื่องไม่มี Microsoft Edge ให้ติดตั้ง Chromium ด้วย `npx.cmd playwright install chromium` แล้วลบ `channel: 'msedge'` จาก `playwright.config.ts`

## โครงสร้าง

- `src/data/competitions.ts` — ข้อมูลสมมติ 14 เวทีพร้อม Type ฟังก์ชันค้นหา กรอง และเรียงลำดับ
- `src/data/mentors.ts` — เมนเทอร์สมมติ หัวข้อความถนัด คิวเวลา และเกณฑ์จัดกลุ่มตามความตรงกับโจทย์
- `src/data/saved.ts` — รายการเวทีที่บันทึกไว้ เก็บใน localStorage ของเบราว์เซอร์
- `src/pages/` — หน้าแรก หน้ารายละเอียด หน้าเมนเทอร์ และกรณีไม่พบหน้า
- `src/components/` — โครงหน้า ไอคอน และภาพปก SVG ประจำหมวด
- `src/styles.css` — ระบบสี ตัวอักษร องค์ประกอบ และ responsive layout
- `scripts/spa-fallback.mjs` — สร้าง `404.html` ให้ GitHub Pages เปิด URL ตรงได้
- `.github/workflows/deploy.yml` — build และ deploy ขึ้น GitHub Pages

ฟอนต์ Anuphan (หัวเรื่องและโลโก้) กับ IBM Plex Sans Thai และ IBM Plex Sans (เนื้อความ) นำเข้าจากแพ็กเกจ Fontsource และถูกเก็บเป็นไฟล์ใน build ไม่เรียก Google Fonts หรือ CDN ขณะใช้งาน มีเทสต์ตรวจข้อนี้ไว้ ดูใบอนุญาตฟอนต์ที่ `THIRD_PARTY_NOTICES.md`

## เส้นทางและพฤติกรรม

- `/` หน้าแรก: hero, เวทีที่คนสนใจมากที่สุด, เมนเทอร์ประจำสัปดาห์ แล้วต่อด้วยการค้นหาและรายการเวที
- `/?q=ฟอนต์&category=design&sort=prize&soon=1&page=2` เก็บคำค้น หมวด การเรียงลำดับ ตัวกรองใกล้ปิดรับ และหน้าไว้ใน URL
- `/?saved=1` แสดงเฉพาะเวทีที่บันทึกไว้ (ปุ่มรูปที่คั่นหนังสือบนหัวเว็บ)
- `/competitions/:slug` เปิดรายละเอียดโดยตรงได้ เก็บ query ของหน้าแรกไว้เมื่อเปิดผ่านการ์ด
- `/competitions` เปลี่ยนไป `/` เพื่อไม่ให้ลิงก์เดิมเสีย
- `/mentors?competition=<slug>&problem=<0-3>` เปิดหน้าเมนเทอร์พร้อมบริบทได้ทันที
- หมวด: `business`, `technology`, `innovation`, `design`; เรียงลำดับ: `deadline`, `new`, `prize`, `name`
- ค้นหาชื่อ คำอธิบาย ผู้จัด และคำสำคัญ โดยไม่สนตัวพิมพ์อังกฤษและตัดช่องว่างรอบคำ; หลายคำต้องพบครบทุกคำ
- แสดงหน้าละ 6 เวที เปิดรายละเอียดแล้วกลับหน้าแรกจะคืนคำค้น ตัวกรอง และตำแหน่งเลื่อนด้วย React Router ScrollRestoration

หน้าเมนเทอร์ถามบริบทก่อนเสมอ คือเวทีที่ลงแข่ง วันส่งงาน และเรื่องที่ทีมติด เลือกเวทีแล้วระบบเติมวันส่งงานของเวทีนั้นให้ จากนั้นจัดเมนเทอร์เป็นชั้น 01 เคยชนะงานนี้ 02 เคยชนะงานประเภทเดียวกัน 03 ทักษะตรงกับสิ่งที่ทีมติด ส่วนคนที่คิวว่างหลังวันส่งงานจะถูกแยกไปกลุ่มท้ายสุด การจัดชั้นนี้กำหนดด้วยมือสำหรับต้นแบบ ไม่ได้เรียนรู้จากข้อมูลการใช้งาน

ข้อมูลเป็น static fixtures จึงไม่มีการหน่วง loading จำลอง ไม่มี API, auth, payment หรือการจองจริง ปุ่มเข้าสู่ระบบ การจองคิว และใบสมัครเมนเทอร์เป็นพรีวิวขั้นตอนเท่านั้น รายการที่บันทึกไว้เก็บใน localStorage ของเบราว์เซอร์เครื่องนั้น ไม่ผูกกับบัญชีผู้ใช้ ข้อมูลเวที เมนเทอร์ รางวัล และราคาทุกรายการเป็นเรื่องสมมติ ไม่ใช่ประกาศรับสมัครจริง

วันปิดรับสมัครเก็บเป็นจำนวนวันนับจากวันนี้ ไม่ใช่วันที่ตายตัว ป้าย “ปิดรับอีก N วัน” และการตรวจว่าคิวเมนเทอร์ทันเดดไลน์จึงตรงกันเสมอไม่ว่าจะเปิดเว็บวันไหน

## Deploy

เว็บ deploy ขึ้น GitHub Pages อัตโนมัติด้วย `.github/workflows/deploy.yml` ทุกครั้งที่ push ขึ้น `main` หรือสั่ง Run workflow เอง เผยแพร่ที่

https://snoppy1.github.io/championway/

ตั้งค่าครั้งเดียวก่อนใช้งาน: ที่ repo ไปที่ Settings → Pages → Source แล้วเลือก **GitHub Actions**

เพราะเว็บอยู่ใต้ subpath ไม่ใช่ root การ build จึงอ่าน `base` จากตัวแปรแวดล้อม `BASE_PATH` โดย workflow ตั้งเป็น `/championway/` ส่วน dev preview และ build ในเครื่องไม่ตั้งค่านี้จึงยังอยู่ที่ `/` ตามเดิม `src/main.tsx` ส่งค่าเดียวกันต่อให้ React Router เป็น `basename`

ทดลอง build แบบเดียวกับ production ได้ด้วย

```powershell
$env:BASE_PATH = '/championway/'; npm.cmd run build; npm.cmd run preview
```

แล้วเปิด http://127.0.0.1:4173/championway/competitions และสั่ง `Remove-Item Env:BASE_PATH` เมื่อเลิกใช้

GitHub Pages ตั้ง SPA fallback ไม่ได้ ขั้นตอน build จึงคัดลอก `index.html` เป็น `404.html` ด้วย `scripts/spa-fallback.mjs` ทำให้เปิด URL หน้ารายละเอียดตรง ๆ ได้ ข้อแลกเปลี่ยนคือคำขอเหล่านั้นได้ HTTP status 404 แม้หน้าจะแสดงถูกต้อง ซึ่งเป็นข้อจำกัดของ Pages เอง

workflow ไม่รัน Playwright เพราะ `playwright.config.ts` ระบุ `channel: 'msedge'` ซึ่งไม่มีบน ubuntu runner การทดสอบจึงยังรันในเครื่อง

### Vercel

`vercel.json` ตั้งค่าให้ Vercel build ด้วย `npm run build` และเสิร์ฟจาก `dist` โดยไม่ตั้ง `BASE_PATH` เว็บจึงอยู่ที่ root ไม่ใช่ subpath

Vercel ตั้ง SPA fallback ได้จริงผ่าน `rewrites` ทุกเส้นทางที่ไม่ใช่ไฟล์จึงคืน `index.html` พร้อม **status 200** ต่างจาก GitHub Pages ที่คืน 404 ส่วนไฟล์ `404.html` ที่ build สร้างไว้ให้ Pages ยังอยู่ในผลลัพธ์แต่ Vercel ไม่ได้ใช้

เชื่อม repo ครั้งแรกที่ https://vercel.com/new แล้วเลือก `snoppy1/championway` ไม่ต้องแก้ค่าใด ๆ เพราะอ่านจาก `vercel.json` จากนั้น push ขึ้น `main` จะ deploy อัตโนมัติ
