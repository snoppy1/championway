import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Clock, Link2, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../data/auth';

/** เกณฑ์เดียวกับที่ทีมตรวจใช้จริง เขียนไว้ให้ผู้จัดอ่านก่อนกรอก จะได้ไม่เสียเที่ยว */
const accepted = [
  'การแข่งขัน ประกวด ค่าย เวิร์กชอป ทุน และการรับสมัครฝึกงาน',
  'งานที่เปิดรับนักเรียนหรือนักศึกษา ไม่ว่าจะมีเงินรางวัลหรือไม่',
  'งานที่มีประกาศทางการเปิดดูได้ ซึ่งเราจะลิงก์กลับไปเสมอ',
];
const rejected = [
  'งานที่ไม่มีประกาศต้นทางให้ตรวจสอบ',
  'การขายสินค้าหรือคอร์สที่แฝงมาในรูปการแข่งขัน',
  'ประกาศรับสมัครงานทั่วไปที่ไม่ได้เป็นการแข่งขันหรือฝึกงานสำหรับผู้เรียน',
  'ข้อความหรือภาพที่คัดลอกมาจากเว็บอื่นโดยไม่มีสิทธิ์',
];

export function Organisers() {
  const { user } = useAuth();
  useEffect(() => { document.title = 'ลงงานแข่งขันฟรี — ChampionWays'; }, []);

  return <main id="main" tabIndex={-1} className="shell page">
    <section className="organiser-hero">
      <p className="eyebrow">สำหรับผู้จัดงาน</p>
      <h1>ลงงานแข่งขันของคุณ ฟรี</h1>
      <p className="organiser-lead">
        ให้นักเรียนและนักศึกษาที่กำลังมองหาเวทีเจองานของคุณ ไม่มีค่าใช้จ่าย
        ไม่มีคิวพิเศษสำหรับคนจ่ายเงิน และทุกงานผ่านการตรวจก่อนขึ้นหน้าเว็บเหมือนกันหมด
      </p>
      <p className="organiser-actions">
        <Link className="primary-button" to="/organizers/submit">
          เริ่มกรอกใบลงงาน<ArrowRight size={17} aria-hidden="true" />
        </Link>
        {!user && <Link className="ghost-button" to="/signin?next=/organizers/submit">เข้าสู่ระบบ</Link>}
      </p>
    </section>

    <section className="organiser-steps" aria-labelledby="how-title">
      <h2 id="how-title">ขั้นตอนเป็นแบบนี้</h2>
      <ol className="step-list">
        <li><span>1</span><p><b>กรอกใบ 4 ขั้น</b> ข้อมูลผู้จัด รายละเอียดงาน วันเวลาและรางวัล แล้วตรวจทาน ใช้เวลาราว 5 นาที</p></li>
        <li><span>2</span><p><b>ทีมงานตรวจกับประกาศต้นทาง</b> ว่าชื่อผู้จัด วันปิดรับ เงินรางวัล และค่าสมัครตรงกันจริง</p></li>
        <li><span>3</span><p><b>แจ้งผลทางอีเมลทุกกรณี</b> ภายใน 2 วันทำการ ถ้าข้อมูลไม่ครบจะขอเพิ่ม ไม่ใช่ปฏิเสธทันที</p></li>
        <li><span>4</span><p><b>งานขึ้นหน้าเว็บ</b> พร้อมลิงก์กลับไปหน้าประกาศของคุณ</p></li>
      </ol>
    </section>

    <section className="organiser-rules" aria-labelledby="rules-title">
      <h2 id="rules-title">เกณฑ์ที่ใช้ตรวจ</h2>
      <div className="rules-grid">
        <div className="rules-card">
          <h3><Check size={17} aria-hidden="true" />รับ</h3>
          <ul>{accepted.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div className="rules-card is-no">
          <h3><X size={17} aria-hidden="true" />ไม่รับ</h3>
          <ul>{rejected.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </div>
    </section>

    <section className="organiser-notes" aria-labelledby="notes-title">
      <h2 id="notes-title">สิ่งที่ควรรู้ก่อนกรอก</h2>
      <div className="notes-grid">
        <div className="note-card">
          <Link2 size={18} aria-hidden="true" />
          <h3>ต้องมีลิงก์ประกาศต้นทาง</h3>
          <p>ทุกงานต้องมีหน้าประกาศทางการที่เปิดได้ เราลิงก์กลับไปเสมอ เพื่อให้ผู้สมัครตรวจสอบเองได้และไม่ต้องเชื่อเราฝ่ายเดียว</p>
        </div>
        <div className="note-card">
          <ShieldCheck size={18} aria-hidden="true" />
          <h3>ข้อมูลติดต่อไม่ขึ้นหน้าเว็บ</h3>
          <p>อีเมลและเบอร์โทรของผู้ติดต่อใช้ยืนยันตัวตนและแจ้งผลเท่านั้น สิ่งที่แสดงสาธารณะคือชื่อหน่วยงานและรายละเอียดงาน</p>
        </div>
        <div className="note-card">
          <Clock size={18} aria-hidden="true" />
          <h3>ช่วยกันไม่ให้ข้อมูลค้าง</h3>
          <p>ถ้าเลื่อนวันหรือยกเลิก แจ้งเรามาได้ทันที ข้อมูลที่ค้างสร้างความเสียหายกับผู้สมัครมากกว่าการไม่มีข้อมูล</p>
        </div>
      </div>
    </section>

    <section className="organiser-cta">
      <h2>พร้อมแล้วเริ่มได้เลย</h2>
      <p className="muted">ถ้ามีคำถามก่อนกรอก เขียนมาที่แบบฟอร์มได้ ทีมงานตอบทุกใบ</p>
      <Link className="primary-button" to="/organizers/submit">
        กรอกใบลงงานแข่ง<ArrowRight size={17} aria-hidden="true" />
      </Link>
    </section>
  </main>;
}
