# ผลตรวจ ChampionWays Prototype

ตรวจวันที่ 7 กันยายน 2026 บน Windows, Node.js 24.13.1 และ Microsoft Edge (Chromium)

## ผลล่าสุด

- `npm.cmd run build` ผ่าน: ตรวจ TypeScript และสร้าง production assets สำเร็จ
- `npm.cmd test` ผ่าน 21/21 กรณี (14.4 วินาที) รวมการเริ่มและปิด Vite อัตโนมัติ
- ทดสอบที่ 1440×1000, 768×1024 และ 390×844
- ตรวจภาพหน้าจอจริงของหน้าสำรวจและรายละเอียดครบทั้งสามขนาด
- axe ตรวจ WCAG 2 A/AA และ 2.1 AA ของสองหน้าตัวอย่าง ไม่พบ violation ในการตรวจอัตโนมัติ
- ไม่พบ JavaScript page error หรือ horizontal overflow ในสองหน้าที่ตรวจภาพ
- ฟอนต์ไทยโหลดเป็นไฟล์ในโปรเจกต์ และใบอนุญาตฟอนต์รวมอยู่ใน production build

## พฤติกรรมที่ตรวจ

ค้นหาไทย/อังกฤษ ตัดช่องว่างและไม่สนตัวพิมพ์, Enter/ปุ่มค้นหา, กรองหมวดร่วมกับระดับ, ล้างคำค้นและตัวกรอง, ผลลัพธ์ว่าง, URL ที่มีค่าตัวกรองไม่ถูกต้อง, เปิดรายละเอียดครบ 10 เวทีจาก URL ตรง, เนื้อหาครบ 5 ส่วน, เวทีที่เกี่ยวข้อง, ลิงก์ที่ไม่มีข้อมูล, รีเฟรช, browser back, กลับพร้อมคำค้น/ตัวกรอง/ตำแหน่งเลื่อนเดิม, keyboard focus

## ภาพหน้าจอ

| ขนาด | หน้าสำรวจ | หน้ารายละเอียด |
| --- | --- | --- |
| Desktop | [ภาพ](artifacts/explore-desktop.png) | [ภาพ](artifacts/detail-desktop.png) |
| Tablet | [ภาพ](artifacts/explore-tablet.png) | [ภาพ](artifacts/detail-tablet.png) |
| Mobile | [ภาพ](artifacts/explore-mobile.png) | [ภาพ](artifacts/detail-mobile.png) |

## ขอบเขตผลตรวจ

ข้อมูลทุกเวทีเป็นสมมติ ไม่มี backend หรือการสมัครจริง การตรวจอัตโนมัติไม่ได้ทดแทนการทดสอบกับผู้ใช้และ screen reader จริง ยังไม่ได้ทดสอบ Safari/Firefox หรือเผยแพร่บนโฮสต์
