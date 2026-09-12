# ChampionWays: dev, test และ production

ใช้ repo เดียว: `main` สำหรับ Vercel Production, `dev` สำหรับ Vercel Preview งาน backend และระบบแยกฐานทดสอบอยู่บน `dev` อย่า merge จนตรวจ Preview และค่าฐาน production ครบ

| Environment | DATABASE_URL | TEST_DATABASE_URL | APP_ORIGIN |
| --- | --- | --- | --- |
| เครื่องพัฒนา | Neon dev | Neon test แยกต่างหาก | http://127.0.0.1:5173 |
| Vercel Preview branch dev | Neon dev | ไม่ตั้ง | URL ประจำ branch dev |
| Vercel Production | Neon production | ไม่ตั้ง | URL เว็บจริง |

สร้าง Neon test โดยใช้ข้อมูลสมมติเท่านั้น การสร้าง database branch จาก production อาจคัดลอกข้อมูลจริงมาด้วย ห้ามถือว่าข้อมูลเป็นข้อมูลทดสอบเพียงเพราะเปลี่ยนชื่อ branch

## ตั้งค่าในเครื่อง

คัดลอก `.env.example` เป็น `.env.local` เฉพาะเครื่องใหม่ ห้ามทับไฟล์ค่าจริงที่มีอยู่ ใส่ DATABASE_URL ของ dev และ TEST_DATABASE_URL ของ test พร้อม TEST_DATABASE_RESET_ALLOWED=true หลังตรวจว่าฐาน test ล้างข้อมูลได้ ไม่เก็บค่าลับใน Git หรือแชต

```powershell
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run db:migrate:test
npm.cmd run test:safety
npm.cmd test
npm.cmd run build
```

`db:migrate` ใช้ฐาน dev จาก DATABASE_URL และไม่ล้างข้อมูล ส่วน `db:migrate:test` ใช้ฐาน test อย่างชัดเจน `npm test` และ `db:seed` ล้างและใส่ fixtures เฉพาะฐาน test หลังผ่าน guard เท่านั้น ไม่ใช้คำสั่ง seed เพื่อเติมข้อมูลจริงลง dev/production

เปิดเว็บ dev ด้วย `npm.cmd run dev:api` และ `npm.cmd run dev` ในคนละ terminal (API 8787 / เว็บ 5173) ส่วน browser tests เปิดเซิร์ฟเวอร์ของตัวเองที่ 8788 / 5174 ไม่ใช้เซิร์ฟเวอร์ dev ที่ค้างอยู่ ถ้าพอร์ตถูกใช้ให้หยุดโดยไม่ seed

## การป้องกันฐานข้อมูล

Tests ต้องมี URL แยกและอนุญาต reset ชัดเจน หากขาดค่าจะหยุดก่อนเชื่อมต่อฐาน เปรียบเทียบ hostname/port/database โดยไม่นับ username/password และปรับ Neon pooler/direct hostname ให้เทียบกันได้ บล็อก reset เมื่อ NODE_ENV=production หรือรันบน Vercel

Guard ตรวจไม่ได้ว่า endpoint อื่นที่ผู้ใช้ใส่เป็น production จริงหรือไม่ จึงต้องตรวจ mapping ใน Neon ก่อนอนุญาต reset หากมี PRODUCTION_DATABASE_URL ใน environment จะตรวจไม่ให้ test ตรงกับค่านั้นด้วย แต่ไม่จำเป็นต้องแจก credential production ให้เครื่องพัฒนา

## Vercel และการปล่อยงาน

ตั้ง Environment Variables แยก Production กับ Preview โดยระบุ branch dev ไม่เลือก DATABASE_URL ของ production ให้ทุก environment ตั้ง APP_ORIGIN ให้ตรง URL ของแต่ละเว็บ ไม่มี slash ท้าย และ Google callback ให้ตรง origin หากใช้ Google login

Push dev เพื่อสร้าง Preview จากนั้นตรวจหน้าเว็บและ /api/health รวมการอ่านข้อมูลและบัญชีทดสอบบนฐาน dev เมื่อผ่านจึงเปิด PR เข้า main การ migrate production ต้องแยกจาก build และใช้ migration ที่ตรวจบน test/dev แล้ว ไม่รัน seed บน production

การ push ไม่ได้ยืนยันว่า deploy สำเร็จ ต้องตรวจสถานะ Vercel และ URL จริงอีกครั้ง เก็บ GitHub Pages workflow ไว้ตามเดิม แต่ไม่ใช่ปลายทางสำหรับ backend

## ย้ายเครื่องและใช้หลาย agent

Clone repo แล้ว checkout dev, npm ci และตั้ง .env.local ใหม่ด้วยค่า dev/test ห้ามคัดลอก production secrets ไปทุกเครื่อง สำหรับ agent พร้อมกันใช้ branch และ worktree แยก และใช้ฐาน test แยกต่อผู้รันหากทดสอบพร้อมกัน เพื่อไม่ให้ seed รบกวนอีกงาน
