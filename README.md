# ChampionWays

เว็บต้นแบบภาษาไทยสำหรับสำรวจและรู้จักเวทีแข่งขัน สร้างด้วย React, TypeScript, Vite และ React Router

## เปิดใช้งานบน Windows

ต้องมี Node.js 22.12+ หรือ Node.js 24 (พัฒนาด้วย 24.13.1)

```powershell
cd D:\champway
npm.cmd install
npm.cmd run dev
```

เปิด http://127.0.0.1:5173/competitions

```powershell
npm.cmd run build
npm.cmd run preview
```

คำสั่ง preview เปิด build ที่ http://127.0.0.1:4173 ใช้ `npm.cmd` เพื่อไม่ต้องเปลี่ยน PowerShell execution policy

## ทดสอบ

```powershell
npm.cmd test
```

Playwright ใช้ Microsoft Edge ที่ติดตั้งในเครื่อง โดยรัน headless ที่ 1440, 768 และ 390px และเปิด dev server อัตโนมัติเมื่อยังไม่มี ตรวจเส้นทางหลัก URL/ประวัติ/ตำแหน่งเลื่อน การค้นหาและกรอง ทุกหน้ารายละเอียด คีย์บอร์ด และ accessibility ด้วย axe ภาพหน้าจออยู่ใน `artifacts/` รายงานอยู่ใน `playwright-report/`

หากเครื่องไม่มี Microsoft Edge ให้ติดตั้ง Chromium ด้วย `npx.cmd playwright install chromium` แล้วลบ `channel: 'msedge'` จาก `playwright.config.ts`

## โครงสร้าง

- `src/data/competitions.ts` — ข้อมูลสมมติ 10 เวทีพร้อม Type และฟังก์ชันค้นหา
- `src/pages/` — หน้าสำรวจ รายละเอียด และกรณีไม่พบหน้า
- `src/components/` — โครงหน้า โลโก้ ป้ายข้อมูลตัวอย่าง และภาพปก SVG
- `src/styles.css` — ระบบสี ตัวอักษร องค์ประกอบ และ responsive layout
- `scripts/spa-fallback.mjs` — สร้าง `404.html` ให้ GitHub Pages เปิด URL ตรงได้
- `.github/workflows/deploy.yml` — build และ deploy ขึ้น GitHub Pages

ฟอนต์ IBM Plex Sans และ IBM Plex Sans Thai นำเข้าจากแพ็กเกจ Fontsource และถูกเก็บเป็นไฟล์ใน build ไม่เรียก Google Fonts หรือ CDN ขณะใช้งาน ดูใบอนุญาตฟอนต์ที่ `THIRD_PARTY_NOTICES.md`

## เส้นทางและพฤติกรรม

- `/` เปลี่ยนไป `/competitions`
- `/competitions?q=ออกแบบ&category=creative&level=secondary` เก็บคำค้นและตัวกรองใน URL
- `/competitions/:slug` เปิดรายละเอียดโดยตรงได้ เก็บ query ของหน้าสำรวจไว้เมื่อเปิดผ่านรายการ
- หมวด: `business`, `technology`, `innovation`, `creative`; ระดับ: `secondary`, `university`
- ค้นหาชื่อ คำอธิบาย และคำสำคัญ โดยไม่สนตัวพิมพ์อังกฤษและตัดช่องว่างรอบคำ; หลายคำต้องพบครบทุกคำ
- เปิดรายละเอียดแล้วกลับหน้าสำรวจจะคืนคำค้น ตัวกรอง และตำแหน่งเลื่อนด้วย React Router ScrollRestoration

ข้อมูลเป็น static fixtures จึงไม่มีการหน่วง loading จำลอง ไม่มี API, auth, payment, booking หรือการสมัครแข่งขัน ข้อมูลและเงื่อนไขทุกเวทีเป็นเรื่องสมมติ ไม่ใช่ประกาศเปิดรับสมัครจริง

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
