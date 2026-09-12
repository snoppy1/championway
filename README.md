# ChampionWays

การแยก dev/test/production และการย้ายเครื่อง: [environments.md](environments.md) — `npm test` ต้องตั้งฐาน test แยกก่อน ส่วน `db:seed` ใช้เฉพาะฐาน test ที่อนุญาตให้ล้างข้อมูลแล้ว

เว็บต้นแบบภาษาไทยสำหรับสำรวจและรู้จักเวทีแข่งขัน สร้างด้วย React, TypeScript, Vite และ React Router

แนวทางออกแบบหลักของโปรเจกต์: [design.md](design.md) — อ่านก่อนสร้างหรือแก้ UI เพื่อให้สี ตัวอักษร components และพฤติกรรมสอดคล้องกันทุกหน้า

โมเดลข้อมูลงานแข่งและระบบตัวกรอง: [competition-model.md](competition-model.md) — หมวดหมู่ 13 หมวด Type ของ `Competition` และตัวกรองทั้งหมด

ระบบให้ผู้จัดงานลงงานแข่งฟรี: [organiser-submission.md](organiser-submission.md) — ที่มาของข้อมูลงานแข่งจริง ฟอร์ม 4 ขั้นตอน และขั้นตอนการตรวจก่อนเผยแพร่

ฝั่งเซิร์ฟเวอร์: [backend.md](backend.md) — ฐานข้อมูล ระบบบัญชี Google login รายการ API และวิธี deploy

หน้าจัดการสำหรับทีมงาน: [admin-console.md](admin-console.md) — คิวตรวจ เกณฑ์ที่ระบบบังคับ และข้อจำกัดเรื่องสิทธิ์

## เปิดใช้งานบน Windows

ต้องมี Node.js 22.12+ หรือ Node.js 24 (พัฒนาด้วย 24.13.1)

```powershell
cd D:\champway
npm.cmd install
copy .env.example .env.local   # แล้วเติม DATABASE_URL ของจริงลงไป
npm.cmd run db:migrate
npm.cmd run db:seed
npm.cmd run dev
```

เปิด http://127.0.0.1:5173/

เว็บต้องมี **ฐานข้อมูล Postgres** ถึงจะใช้งานได้ ถ้ายังไม่มี สมัคร Neon แบบฟรีแล้วเอา connection string มาใส่ใน `.env.local`
หน้าเว็บกับ API รันคนละพอร์ตตอน dev โดย Vite พา `/api` ไปให้เอง ถ้าอยากได้ API แบบ watch ให้เปิดอีกหน้าต่างแล้วรัน `npm.cmd run dev:api`

```powershell
npm.cmd run build
npm.cmd run preview
```

คำสั่ง preview เปิด build ที่ http://127.0.0.1:4173 ใช้ `npm.cmd` เพื่อไม่ต้องเปลี่ยน PowerShell execution policy

## ทดสอบ

```powershell
npm.cmd test
```

Playwright ใช้ Microsoft Edge ที่ติดตั้งในเครื่อง โดยรัน headless ที่ 1440, 768 และ 390px และเปิด dev server อัตโนมัติเมื่อยังไม่มี ตรวจการค้นหา ตัวกรองทุกกลุ่มและกฎการรวมเงื่อนไข การเรียงลำดับ การแบ่งหน้า การบันทึกเวที ทุกหน้ารายละเอียด ขั้นตอนจับคู่เมนเทอร์ คีย์บอร์ด และ accessibility ด้วย axe รวมถึงแผงตัวกรองขณะเปิด ภาพหน้าจออยู่ใน `artifacts/` รายงานอยู่ใน `playwright-report/`

หากเครื่องไม่มี Microsoft Edge ให้ติดตั้ง Chromium ด้วย `npx.cmd playwright install chromium` แล้วลบ `channel: 'msedge'` จาก `playwright.config.ts`

## โครงสร้าง

- `server/` — API, ฐานข้อมูล, ระบบบัญชี ดู [backend.md](backend.md)
- `src/data/competitions.ts` — Type ของเวที หมวดหมู่ 13 หมวด ข้อมูลตัวอย่างที่ใช้เป็นแหล่ง seed และฟังก์ชันจัดรูปแบบ
- `src/lib/api.ts` — ตัวเรียก API และการจัดการข้อผิดพลาด
- `src/data/filters.ts` — แปลงตัวกรองไปกลับกับ query string ของ URL
- `src/data/submissions.ts` — ชนิดข้อมูลของใบที่ส่งเข้ามา คิวตัวอย่าง และรายการตรวจ
- `src/data/mentors.ts` — เมนเทอร์สมมติ หัวข้อความถนัด คิวเวลา และเกณฑ์จัดกลุ่มตามความตรงกับโจทย์
- `src/data/saved.ts` — รายการเวทีที่บันทึกไว้ เก็บใน localStorage ของเบราว์เซอร์
- `src/pages/` — หน้าแรก หน้ารายละเอียด หน้าเมนเทอร์ และกรณีไม่พบหน้า
- `src/pages/admin/` — หน้าจัดการ 5 หน้า สำหรับตรวจใบที่ส่งเข้ามา
- `src/components/` — โครงหน้า ไอคอน แผงตัวกรอง และภาพปก SVG ประจำหมวด
- `src/assets/` — โลโก้ถ้วยรางวัลบนหัวเว็บ และภาพ wordmark ของหน้าแรก
- `src/styles.css` — ระบบสี ตัวอักษร องค์ประกอบ และ responsive layout
- `scripts/spa-fallback.mjs` — สร้าง `404.html` ให้ GitHub Pages เปิด URL ตรงได้
- `.github/workflows/deploy.yml` — build ขึ้น GitHub Pages **สั่งรันมือเท่านั้น** เพราะ Pages รัน API ไม่ได้

โลโก้เป็นไฟล์ภาพ ไม่ใช่ข้อความ ภาพ wordmark ของหน้าแรกเป็น JPEG พื้นขาวและใช้ `mix-blend-mode: multiply` กลืนพื้นขาวเข้ากับ gradient ของ hero แทนการตัดพื้นหลังเป็นภาพโปร่ง ส่วนชื่อ ChampionWays ที่ screen reader อ่านมาจาก `alt` ของภาพ

ฟอนต์ Anuphan (หัวเรื่อง) กับ IBM Plex Sans Thai และ IBM Plex Sans (เนื้อความ) นำเข้าจากแพ็กเกจ Fontsource และถูกเก็บเป็นไฟล์ใน build ไม่เรียก Google Fonts หรือ CDN ขณะใช้งาน มีเทสต์ตรวจข้อนี้ไว้ ดูใบอนุญาตฟอนต์ที่ `THIRD_PARTY_NOTICES.md`

## เส้นทางและพฤติกรรม

- `/` หน้าแรก: hero, เวทีที่คนสนใจมากที่สุด, เมนเทอร์ประจำสัปดาห์ แล้วต่อด้วยการค้นหาและรายการเวที
- `/?q=ฟอนต์&cat=design,technology&type=camp&level=university&region=online&sort=prize&page=2` เก็บคำค้น หมวด (เลือกได้หลายหมวด) ตัวกรองทุกกลุ่ม การเรียงลำดับ และหน้าไว้ใน URL ทั้งหมด ลิงก์เก่ารูปแบบ `?category=design` ยังเปิดได้
- `/?saved=1` แสดงเฉพาะเวทีที่บันทึกไว้ (ปุ่มรูปที่คั่นหนังสือบนหัวเว็บ)
- `/signin` และ `/signup` เข้าสู่ระบบและสมัครสมาชิก รองรับทั้งอีเมลและ Google
- `/admin` หน้าจัดการ: ภาพรวม คิวงานแข่ง คิวใบสมัครเมนเทอร์ และหน้าตรวจรายใบ **เปิดได้เฉพาะบัญชีทีมตรวจ** ซึ่งตั้งด้วย `npm.cmd run db:admin` เท่านั้น สมัครเองจากหน้าเว็บจะได้บทบาทสมาชิกทั่วไปเสมอ
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
## หน้าสมัครเมนเทอร์

ปุ่มสมัครบน `/mentors` เปิด `/mentors/apply` แทนฟอร์มย่อเดิม โดยปรับจาก `ChampionWays-Mentor-Application.html` เป็น React 4 ขั้นตอน: ข้อมูลผู้สมัคร → ประสบการณ์และหลักฐาน → บริการและคิว → ตรวจทานและส่งตัวอย่าง

ตรวจข้อมูลจำเป็น หลักฐานรางวัลสูงสุด 2 งาน ความถนัด 2 หัวข้อ และคิวในอนาคตที่ไม่ทับกัน (เวลาไทย) รูปโปรไฟล์รองรับ JPG/PNG/WebP สูงสุด 5 MB ส่วนหลักฐานรองรับ PDF/JPG/PNG สูงสุด 10 MB ข้อมูลและไฟล์อยู่ในหน่วยความจำของหน้าเท่านั้น ไม่มีการอัปโหลดหรือส่งใบสมัครจริง และจะหายเมื่อรีเฟรชหรือออกจากหน้า
