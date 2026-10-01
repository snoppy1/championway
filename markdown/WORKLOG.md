# บันทึกงานระหว่างสองเครื่อง

ไฟล์นี้ใช้ส่งต่องานระหว่างเครื่องที่ทำโปรเจกต์ ก่อนเริ่มงานให้ `git pull origin dev` แล้วอ่านไฟล์นี้ จบงานให้เพิ่มบันทึกในหัวข้อ "บันทึกงาน" แล้ว push ขึ้น `dev`

## เครื่องที่ใช้

| เครื่อง | Claude | Codex (Astra) session สำหรับรับงาน |
|---|---|---|
| MacBook Air (`snoppymacs-MacBook-Air-2`) path `/Users/snoppymac/clone champway/championway` | Claude Code CLI, Opus 5.5 | `01a0f5e5-52de-7172-8986-c9af80ebf301` |
| คอมอีกเครื่อง | Claude Code | `01a0f5d4-bb4f-7b80-a5fe-4e5e4578799b` (ดูด้วย codex-watch) |

Codex session เก็บอยู่ใน `~/.codex/sessions/` ของแต่ละเครื่อง ข้ามเครื่องไม่ได้ ส่งงานให้ Astra ต้องใช้ session ของเครื่องที่ทำงานอยู่

## การแบ่งหน้าที่ Claude กับ Astra

Astra ใช้ token ค่อนข้างแพง Claude ทำงานส่วนใหญ่เอง

**Claude ทำเอง (ค่าเริ่มต้นของทุกงาน):** สถาปัตยกรรม, spec, UX/UI, design system, เขียนโค้ด, แก้บั๊ก, เขียนเทส, refactor

**ส่งให้ Astra เฉพาะ:**
- เปิดเว็บจริงทดสอบ UI/flow แบบ end-to-end
- รีวิวโค้ดส่วนสำคัญ (auth, payment, security) ก่อน merge
- บั๊กที่ Claude แก้แล้วไม่ผ่าน 2 รอบ

**กฎคุมงบ:**
- reasoning ระดับ medium ปรับขึ้นเมื่อจำเป็นเท่านั้น
- ส่งเฉพาะไฟล์และ context ที่งานต้องใช้ ห้ามส่งทั้งโปรเจกต์
- ห้ามส่งงานเล็กหรืองานซ้ำ ๆ (แก้ข้อความ, เปลี่ยนสี, rename)
- ก่อนส่งทุกครั้ง บอกเหตุผล 1 บรรทัดว่าทำไมต้องเป็น Astra
- จบแต่ละวัน สรุปจำนวนครั้งและงานที่ส่งให้ Astra ลงในบันทึกงาน

**วิธีส่งงาน** (รันใน repo):

```bash
codex exec resume <session-id> -c model_reasoning_effort="medium" "<งาน + ไฟล์ที่เกี่ยวข้อง>"
```

## Sub agent ฝั่ง Claude (Workflow ดีไซน์)

Claude เป็น Art Director แตกงานให้ agent ใน `.claude/agents/`

| ลำดับ | Agent | หน้าที่ |
|---|---|---|
| 1 | `design-lead` | ดู reference เสนอ 3 ทิศทาง (สี, ฟอนต์, ตัวอย่าง 1 หน้า) ให้เจ้าของเลือก 1 แบบ |
| 2 | `design-system` | สร้าง tokens (สี, typography, spacing, radius, shadow) และ component พื้นฐาน ทุกหน้าใช้จากตรงนี้ ห้าม hardcode |
| 3 | `ui-builder` | สร้างทีละหน้าจาก design system ครบทุก state (loading, empty, error, hover, focus, disabled) |
| 4 | `design-critic` | ไม่เห็นขั้นตอนการทำ ดูแค่ screenshot มือถือ + เดสก์ท็อป วิจารณ์ลำดับความสำคัญ ระยะห่าง ความสม่ำเสมอ และดูเหมือน AI ทำหรือไม่ ส่งกลับ `ui-builder` จนผ่าน |

**Astra ในงานดีไซน์:** ใช้หลังหน้านั้นผ่าน `design-critic` แล้วเท่านั้น เปิดเว็บจริง คลิกทุก flow ทดสอบหลายขนาดจอ เช็ก contrast และ accessibility ส่งกลับเป็นรายการปัญหาสั้น ๆ + screenshot ห้ามแก้โค้ดเอง 1 หน้าส่งได้ไม่เกิน 1 ครั้ง ยกเว้นเจอปัญหาใหญ่

**ถามเจ้าของก่อนเมื่อ:** เลือกทิศทางดีไซน์, design system เสร็จ (ก่อนทำหน้าจริง), หน้าแรกเสร็จ (ยืนยันสไตล์ก่อนทำหน้าที่เหลือ)

## บันทึกงาน

เพิ่มบันทึกใหม่ไว้บนสุด

### 1 ตุลาคม 2569 — MacBook Air

- pull `origin/dev` ถึง `28364ba` (i18n ไทย/อังกฤษ, Rising Star, Consulting, Mentor Zone, หน้า admin requests/reviews)
- ยังไม่ได้รัน `npm install` และเทสหลัง pull
- สร้าง Codex session `01a0f5e5-52de-7172-8986-c9af80ebf301` บนเครื่องนี้สำหรับรับงานจาก Claude
- สร้างไฟล์นี้
- Sub agent: ยังไม่ได้ใช้
- ส่งงานให้ Astra: 1 ครั้ง (เปิด session อย่างเดียว ยังไม่มีงานจริง)
- ค้างอยู่: stash `local WIP before update 2026-09-28 (purple explore + concepts)` ยังไม่ได้ตัดสินใจว่าจะใช้หรือทิ้ง
