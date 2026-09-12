import { useEffect, useRef, useState } from 'react';
import type { FormEvent, InputHTMLAttributes, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ClipboardCheck, Eye, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { topics } from '../data/mentors';
import '../mentor-application.css';

const steps = ['ข้อมูลผู้สมัคร', 'ประสบการณ์และรางวัล', 'บริการและคิว', 'ตรวจทานและส่ง'];
type Field = 'first' | 'last' | 'nickname' | 'email' | 'occupation' | 'organization' | 'role' | 'experience' | 'portfolio' | 'best' | 'cannot' | 'price' | 'paidSlot' | 'freeSlot';
interface Award { id: number; title: string; prize: string; year: string; url: string; file?: File }
const empty: Record<Field, string> = { first: '', last: '', nickname: '', email: '', occupation: '', organization: '', role: '', experience: '', portfolio: '', best: '', cannot: '', price: '', paidSlot: '', freeSlot: '' };
const thaiDate = (value: string) => new Date(`${value}:00+07:00`).getTime();
const dateLabel = (value: string) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(thaiDate(value));

type ConsentKey = 'accuracy' | 'guidanceOnly' | 'noOffPlatform' | 'noJudging' | 'payment';
/** Every box starts unticked and all of them are required before the sample submit. */
const consentItems: { key: ConsentKey; label: string }[] = [
  { key: 'accuracy', label: 'ยืนยันว่าข้อมูลและหลักฐานเป็นของฉัน และยินยอมให้ตรวจสอบเพื่อพิจารณาใบสมัคร' },
  { key: 'guidanceOnly', label: 'ยอมรับว่าจะให้คำแนะนำ โดยไม่ทำงานหรือจัดทำผลงานส่งแข่งขันแทนทีม' },
  { key: 'noOffPlatform', label: 'ยอมรับว่าจะไม่รับงานนอกระบบกับลูกค้าที่พบผ่าน ChampionWays' },
  { key: 'noJudging', label: 'ยอมรับว่าจะไม่ให้คำปรึกษากับทีมที่ตนเองเป็นกรรมการตัดสิน' },
  { key: 'payment', label: 'รับทราบว่าโอนเงินหลังคุยจบ 24 ชั่วโมง และคืนเต็มจำนวนหากเมนเทอร์ไม่มาตามนัด' },
];
const noConsent: Record<ConsentKey, boolean> = { accuracy: false, guidanceOnly: false, noOffPlatform: false, noJudging: false, payment: false };

export function MentorApplication() {
  const [stage, setStage] = useState(0);
  const [values, setValues] = useState(empty);
  const [awards, setAwards] = useState<Award[]>([]);
  const nextAward = useRef(0);
  const [portrait, setPortrait] = useState<File>();
  const [portraitUrl, setPortraitUrl] = useState('');
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [consent, setConsent] = useState(noConsent);
  const [message, setMessage] = useState('');
  const [complete, setComplete] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousStage = useRef(stage);
  const previousComplete = useRef(complete);

  useEffect(() => { document.title = 'สมัครเป็นเมนเทอร์ — ChampionWays'; }, []);
  useEffect(() => {
    if (!portrait || !['image/jpeg', 'image/png', 'image/webp'].includes(portrait.type) || portrait.size > 5 * 1024 * 1024) { setPortraitUrl(''); return; }
    const url = URL.createObjectURL(portrait);
    setPortraitUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [portrait]);
  useEffect(() => {
    if (stage === previousStage.current && complete === previousComplete.current) return;
    previousStage.current = stage;
    previousComplete.current = complete;
    const heading = sheetRef.current?.querySelector<HTMLElement>(complete ? '.application-complete h2' : `fieldset[data-stage="${stage}"] h2`);
    heading?.focus({ preventScroll: true });
    sheetRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [stage, complete]);

  /** Editing the application after ticking "the data is mine" forces a fresh read-through. */
  const reviewAgain = () => setConsent((current) => (current.accuracy ? { ...current, accuracy: false } : current));
  const set = (field: Field, value: string) => { reviewAgain(); setValues((current) => ({ ...current, [field]: value })); };
  const field = (key: Field, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}, hint?: string) => <label htmlFor={`apply-${key}`}>{label}<input id={`apply-${key}`} value={values[key]} onChange={(event) => set(key, event.target.value)} {...props} />{hint && <small>{hint}</small>}</label>;
  const updateAward = (id: number, update: Partial<Award>) => { reviewAgain(); setAwards((current) => current.map((award) => award.id === id ? { ...award, ...update } : award)); };
  const goTo = (target: number) => { setStage(target); setMessage(''); };

  function validate() {
    const active = formRef.current?.querySelector(`fieldset[data-stage="${stage}"]`);
    for (const element of active?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea') ?? []) {
      element.setCustomValidity('');
      if (element.required && ['text', 'textarea'].includes(element.type) && !element.value.trim()) element.setCustomValidity('กรุณากรอกข้อมูลให้ครบ');
      if (!element.reportValidity()) return false;
    }
    let error = '';
    let missingConsent: ConsentKey | undefined;
    if (stage === 0 && portrait && (!['image/png', 'image/jpeg', 'image/webp'].includes(portrait.type) || portrait.size > 5 * 1024 * 1024)) error = 'เลือกรูป JPG, PNG หรือ WebP ไม่เกิน 5 MB';
    if (stage === 1) {
      if (!awards.length && !values.portfolio.trim()) error = 'เพิ่มหลักฐานรางวัล หรือใส่ลิงก์ผลงานก่อนดำเนินการต่อ';
      for (const award of awards) {
        if (!award.url.trim() && !award.file) error = 'แต่ละรางวัลต้องมีลิงก์ประกาศหรือไฟล์หลักฐาน';
        if (award.file && (award.file.size > 10 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png'].includes(award.file.type))) error = 'หลักฐานต้องเป็น PDF, JPG หรือ PNG ไม่เกิน 10 MB';
      }
    }
    if (stage === 2) {
      const paid = thaiDate(values.paidSlot), free = thaiDate(values.freeSlot);
      if (selectedTopics.length !== 2) error = 'เลือกความถนัดให้ครบ 2 หัวข้อ';
      else if (!Number.isFinite(paid) || !Number.isFinite(free) || paid <= Date.now() || free <= Date.now()) error = 'กรุณาเลือกคิวในอนาคต';
      else if (paid < free + 20 * 60000 && free < paid + 60 * 60000) error = 'คิวปรึกษาและคิวคุยฟรีต้องไม่ทับกัน';
    }
    if (stage === 3) {
      missingConsent = consentItems.find((item) => !consent[item.key])?.key;
      if (missingConsent) error = 'ติ๊กยอมรับเงื่อนไขให้ครบทุกข้อก่อนส่งใบสมัคร';
    }
    setMessage(error);
    if (missingConsent) document.getElementById(`consent-${missingConsent}`)?.focus();
    return !error;
  }

  function next(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    if (stage < 3) setStage(stage + 1); else setComplete(true);
  }

  const group = (title: string, children: ReactNode, hint?: string, aside?: ReactNode) => <section className="group">
    <div className="group-head"><h3>{title}</h3>{aside}</div>
    {hint && <p className="muted group-hint">{hint}</p>}
    {children}
  </section>;

  const reviewGroup = (title: string, target: number, children: ReactNode) => <section className="group review-group">
    <div className="group-head"><h3>{title}</h3><button className="plain" type="button" aria-label={`แก้ไข${title}`} onClick={() => goTo(target)}>แก้ไข</button></div>
    {children}
  </section>;

  const consentBox = (key: ConsentKey, label: string) => <label className="check consent-check" key={key} htmlFor={`consent-${key}`}>
    <input id={`consent-${key}`} type="checkbox" checked={consent[key]} onChange={(event) => setConsent({ ...consent, [key]: event.target.checked })} />
    <span>{label}</span>
  </label>;

  return <main id="main" tabIndex={-1}><div id="cw-apply">
    <section className="hero">
      <div className="application-hero-inner"><Link className="application-back" to="/mentors"><ArrowLeft size={16} aria-hidden="true" />กลับไปหน้าเมนเทอร์</Link><span className="tag">FOR THE NEXT GENERATION</span><h1>ประสบการณ์ของคุณ<br />ช่วยให้ทีมถัดไปไปได้ไกลขึ้น</h1><p className="muted">บอกสิ่งที่คุณถนัด พร้อมหลักฐานที่ช่วยให้ทีมมั่นใจก่อนเลือกปรึกษา</p><p className="application-prototype">ต้นแบบ · ไม่ส่งข้อมูลจริง</p></div>
    </section>
    <div className="layout">
      <aside aria-label="ขั้นตอนการสมัคร"><ol className="steps">{steps.map((step, index) => <li key={step} className={`step ${index === stage ? 'current' : index < stage ? 'done' : ''}`} aria-current={index === stage ? 'step' : undefined}><b>{index + 1}</b>{step}</li>)}</ol><div className="aside-note"><ShieldCheck aria-hidden="true" /><h3>ตรวจสอบก่อนเผยแพร่</h3><p className="muted">ส่งใบสมัคร → ตรวจข้อมูลและหลักฐาน → แจ้งผลทางอีเมล</p></div><div className="aside-note"><Eye aria-hidden="true" /><h3>คุณเห็นก่อนว่าทีมจะเห็นอะไร</h3><p className="muted">แสดงชื่อและนามสกุลย่อ ส่วนอีเมลกับไฟล์หลักฐานใช้สำหรับตรวจสอบเท่านั้น</p></div></aside>
      <div className="sheet" ref={sheetRef}>
        <form ref={formRef} onSubmit={next} hidden={complete} noValidate onInput={(event) => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) event.target.setCustomValidity(''); }}>
          <fieldset data-stage="0" hidden={stage !== 0} disabled={stage !== 0}>
            <legend className="sr-only">ข้อมูลผู้สมัคร</legend><div className="intro"><h2 tabIndex={-1}>เริ่มจากแนะนำตัวคุณ</h2><p className="muted">ใช้ข้อมูลที่ตรวจสอบได้ เพื่อให้การจับคู่เริ่มต้นจากความไว้วางใจ</p></div>
            <div className="grid">{field('first', 'ชื่อจริง *', { required: true, maxLength: 50, autoComplete: 'given-name' })}{field('last', 'นามสกุล *', { required: true, maxLength: 60, autoComplete: 'family-name' }, 'แสดงสาธารณะเฉพาะอักษรแรก')}</div>
            {field('nickname', 'ชื่อที่อยากให้ทีมเรียก *', { required: true, maxLength: 30, placeholder: 'เช่น พี่มายด์' })}
            {field('email', 'อีเมลติดต่อ *', { type: 'email', required: true, autoComplete: 'email' }, 'ใช้แจ้งผลใบสมัคร ไม่แสดงบนโปรไฟล์')}
            <div className="grid"><label htmlFor="apply-occupation">สถานะ *<select id="apply-occupation" required value={values.occupation} onChange={(event) => set('occupation', event.target.value)}><option value="">เลือกสถานะ</option><option>นักศึกษา</option><option>ทำงานแล้ว</option><option>อิสระ / อื่น ๆ</option></select></label>{field('organization', 'มหาวิทยาลัยหรือที่ทำงาน *', { required: true, maxLength: 100 })}</div>
            {field('role', 'คณะและชั้นปี หรือตำแหน่งงาน *', { required: true, maxLength: 100, placeholder: 'เช่น บริหารธุรกิจ ปี 4' })}
            <label htmlFor="apply-portrait">รูปโปรไฟล์ (ไม่บังคับ)<input id="apply-portrait" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { reviewAgain(); setPortrait(event.target.files?.[0]); }} /><small>JPG, PNG หรือ WebP ไม่เกิน 5 MB · ถ้าไม่ใส่จะใช้ตัวย่อชื่อ</small></label>
          </fieldset>

          <fieldset data-stage="1" hidden={stage !== 1} disabled={stage !== 1}>
            <legend className="sr-only">ประสบการณ์และรางวัล</legend><div className="intro"><h2 tabIndex={-1}>ให้ประสบการณ์เล่าแทนคุณ</h2><p className="muted">เรียงจากเส้นทางของคุณ ไปหาหลักฐานที่ตรวจสอบได้ และผลงานที่ทีมเปิดดูได้</p></div>
            {group('เส้นทางของคุณกับการแข่งขัน', <label htmlFor="apply-experience">เล่าประสบการณ์ *<textarea id="apply-experience" required maxLength={600} value={values.experience} onChange={(event) => set('experience', event.target.value)} placeholder="เคยทำหน้าที่อะไรในทีม และเรียนรู้อะไรจากเวทีนั้น" /></label>, 'เล่าสั้น ๆ ว่าเคยรับบทบาทอะไร และทีมได้อะไรจากคุณ')}
            {group('หลักฐานรางวัล', <>
              {awards.map((award, index) => <div className="award" key={award.id}>
                <div className="award-header"><h4>รางวัลที่ {index + 1} จาก 2</h4><button className="plain" type="button" aria-label={`ลบรางวัล ${index + 1}`} onClick={() => { reviewAgain(); setAwards(awards.filter((item) => item.id !== award.id)); }}>ลบรางวัล</button></div>
                <label>ชื่อการแข่งขัน *<input required maxLength={120} value={award.title} onChange={(event) => updateAward(award.id, { title: event.target.value })} /></label>
                <div className="grid"><label>รางวัลที่ได้รับ *<input required maxLength={100} value={award.prize} onChange={(event) => updateAward(award.id, { prize: event.target.value })} placeholder="เช่น ชนะเลิศ" /></label><label>ปี พ.ศ. *<input type="number" required min={2500} max={new Date().getFullYear() + 543} value={award.year} onChange={(event) => updateAward(award.id, { year: event.target.value })} /></label></div>
                <label>ลิงก์ประกาศผล<input type="url" value={award.url} onChange={(event) => updateAward(award.id, { url: event.target.value })} placeholder="https://..." /></label>
                <label>หรือแนบหลักฐาน<input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => updateAward(award.id, { file: event.target.files?.[0] })} /><small>PDF, JPG หรือ PNG ไม่เกิน 10 MB · เห็นเฉพาะผู้ตรวจใบสมัคร ไม่แสดงบนโปรไฟล์</small></label>
              </div>)}
              {awards.length < 2 && <button type="button" onClick={() => { reviewAgain(); setAwards([...awards, { id: ++nextAward.current, title: '', prize: '', year: '', url: '' }]); }}>+ เพิ่มรางวัล (สูงสุด 2 งาน)</button>}
              <div className="note">ยังไม่มีรางวัล? ข้ามส่วนนี้ได้ แล้วใส่ลิงก์ผลงานด้านล่างแทน เราพิจารณาจากสายทักษะและประสบการณ์ได้เช่นกัน</div>
            </>, 'เพิ่มได้สูงสุด 2 งาน แต่ละงานต้องมีลิงก์ประกาศผลหรือไฟล์หลักฐานอย่างน้อยหนึ่งอย่าง', <span className="count">{awards.length} จาก 2</span>)}
            {group('ผลงานหรือ Portfolio', <>
              {field('portfolio', 'ลิงก์ผลงาน', { type: 'url', placeholder: 'https://...' }, 'จำเป็นเมื่อไม่ได้เพิ่มรางวัล')}
              <div className="note">ป้าย “ยืนยันแล้ว” จะแสดงหลังตรวจหลักฐานผ่านเท่านั้น การส่งใบสมัครไม่ได้ทำให้ได้รับป้ายทันที</div>
            </>)}
          </fieldset>

          <fieldset data-stage="2" hidden={stage !== 2} disabled={stage !== 2}>
            <legend className="sr-only">บริการและคิว</legend><div className="intro"><h2 tabIndex={-1}>บอกให้ชัดว่าช่วยอะไรได้</h2><p className="muted">ขอบเขตที่ชัดเจนช่วยให้ทั้งคุณและทีมคาดหวังตรงกัน</p></div>
            {group('ขอบเขตการช่วย', <>
              {field('best', 'ช่วยได้ดีที่สุด *', { required: true, maxLength: 120, placeholder: 'เช่น ช่วยเปลี่ยนโจทย์กว้างให้เป็นไอเดียที่นำเสนอได้' }, 'หนึ่งบรรทัด แสดงบนแถวเมนเทอร์')}
              {field('cannot', 'ช่วยไม่ได้ *', { required: true, maxLength: 120, placeholder: 'เช่น ไม่รับเขียนโค้ดหรือทำงานส่งแทนทีม' }, 'บังคับกรอก เพื่อให้ทีมรู้ขอบเขตก่อนจอง')}
            </>)}
            {group('ความถนัด', <div className="topics" role="group" aria-labelledby="topic-label">
              {topics.map((topic) => <label className="check topic" key={topic}><input type="checkbox" checked={selectedTopics.includes(topic)} onChange={(event) => { if (event.target.checked && selectedTopics.length === 2) { setMessage('เลือกได้สูงสุด 2 หัวข้อ'); return; } reviewAgain(); setSelectedTopics(event.target.checked ? [...selectedTopics, topic] : selectedTopics.filter((item) => item !== topic)); setMessage(''); }} /><span>{topic}</span></label>)}
            </div>, 'เลือกสองเรื่องที่คุณช่วยได้ดีที่สุด ทีมใช้สองหัวข้อนี้ค้นหาคุณ', <span className="count" id="topic-label" aria-live="polite">เลือกแล้ว {selectedTopics.length} จาก 2 *</span>)}
            {group('ราคา', <div className="price-row">
              {field('price', 'ราคาต่อทีม / 60 นาที (บาท) *', { type: 'number', required: true, min: 1, max: 100000, step: 1, placeholder: '800' })}
              <div className="price-preview"><small>ตัวอย่างทีม 4 คน</small><strong>{values.price ? `฿${(Number(values.price) / 4).toLocaleString('th-TH', { maximumFractionDigits: 2 })} / คน` : '— / คน'}</strong></div>
            </div>, 'ทีมเห็นราคาต่อทีมและราคาหารตามจำนวนสมาชิกพร้อมกัน')}
            {group('คิวที่ว่าง', <>
              <div className="queue-grid">
                <div className="queue-card"><h4>คิวปรึกษา 60 นาที</h4>{field('paidSlot', 'วันเวลาว่างแรก *', { type: 'datetime-local', required: true })}</div>
                <div className="queue-card"><h4>คุยฟรี 20 นาที</h4>{field('freeSlot', 'วันเวลาว่างแรก *', { type: 'datetime-local', required: true })}<label className="check"><input type="checkbox" required /><span>ยินดีให้ทีมคุยฟรี 20 นาทีก่อนเลือกบริการ</span></label></div>
              </div>
              <small className="muted">เวลาไทย (UTC+7) · สองคิวต้องไม่ทับกัน · หลังผ่านการอนุมัติจึงจัดการคิวเพิ่มเติมได้</small>
            </>, 'เมนเทอร์ทุกคนมีคุยฟรี 20 นาทีก่อนตัดสินใจ จึงต้องระบุทั้งสองคิว')}
          </fieldset>

          <fieldset data-stage="3" hidden={stage !== 3} disabled={stage !== 3}>
            <legend className="sr-only">ตรวจทานและส่ง</legend><div className="intro"><h2 tabIndex={-1}>ตรวจทานก่อนส่งใบสมัคร</h2><p className="muted">ดูสิ่งที่ทีมจะเห็นก่อน แล้วตรวจข้อมูลที่ใช้พิจารณา แก้ไขส่วนไหนก็กดปุ่มแก้ไขของส่วนนั้น</p></div>
            {group('ตัวอย่างโปรไฟล์ที่ทีมจะเห็น', <div className="profile">
              {portraitUrl ? <img className="avatar" src={portraitUrl} alt="รูปโปรไฟล์ที่เลือก" /> : <div className="avatar" aria-hidden="true">{values.first.slice(0, 1)}</div>}
              <h4>{values.nickname} {values.last.trim().slice(0, 1)}.</h4>
              <p className="muted">{values.role} · {values.organization}</p>
              <p><strong>ช่วยได้ดีที่สุด:</strong> {values.best}</p>
              <p><strong>ช่วยไม่ได้:</strong> {values.cannot}</p>
              <p>{selectedTopics.map((topic) => <span className="tag" key={topic}>{topic}</span>)}</p>
              <p><strong>฿{Number(values.price).toLocaleString('th-TH')} / ทีม / 60 นาที</strong></p>
              <small>คุยฟรี 20 นาทีก่อนตัดสินใจ</small>
            </div>, 'นามสกุลย่อเหลืออักษรแรก ส่วนอีเมลและไฟล์หลักฐานไม่แสดงในโปรไฟล์')}
            {reviewGroup('ข้อมูลผู้สมัคร', 0, <>
              <div className="review"><small>ชื่อ–นามสกุล · ใช้ตรวจสอบ</small><strong>{values.first} {values.last}</strong></div>
              <div className="review"><small>อีเมลแจ้งผล · ไม่แสดงสาธารณะ</small><strong>{values.email}</strong></div>
              <div className="review"><small>สถานะและที่สังกัด</small>{values.occupation} · {values.organization}</div>
            </>)}
            {reviewGroup('ประสบการณ์และหลักฐาน', 1, <>
              <div className="review"><small>ประสบการณ์</small>{values.experience}</div>
              {awards.map((award) => <div className="review" key={award.id}><strong>{award.title}</strong><p>{award.prize} · {award.year}</p><small>รอตรวจสอบ · {award.file?.name || award.url}</small></div>)}
              {values.portfolio && <div className="review"><small>ลิงก์ผลงานหรือ Portfolio</small>{values.portfolio}</div>}
              {!awards.length && <div className="review"><small>หลักฐานรางวัล</small>ไม่ได้เพิ่มรางวัล · พิจารณาจากประสบการณ์และผลงาน</div>}
            </>)}
            {reviewGroup('บริการและราคา', 2, <>
              <div className="review"><small>ความถนัด</small>{selectedTopics.join(' · ')}</div>
              <div className="review"><small>ราคาต่อทีม / 60 นาที</small><strong>฿{Number(values.price).toLocaleString('th-TH')}</strong></div>
            </>)}
            {reviewGroup('คิวที่ว่าง', 2, <>
              {stage === 3 && <div className="review"><small>คิวปรึกษา 60 นาที · เวลาไทย</small>{dateLabel(values.paidSlot)}</div>}
              {stage === 3 && <div className="review"><small>คุยฟรี 20 นาที · เวลาไทย</small>{dateLabel(values.freeSlot)}</div>}
            </>)}
            {group('ความยินยอมและเงื่อนไขการเป็นเมนเทอร์', <>
              <div className="consent-list">{consentItems.slice(0, 4).map((item) => consentBox(item.key, item.label))}</div>
              <div className="consent-payment">{consentBox('payment', consentItems[4].label)}</div>
              <div className="note">อีเมล นามสกุลเต็ม และไฟล์หลักฐานไม่แสดงในแถวเมนเทอร์ · โปรไฟล์ยังไม่เผยแพร่จนกว่าจะตรวจสอบผ่าน</div>
            </>, 'ต้องติ๊กครบทุกข้อจึงส่งใบสมัครได้ หากกลับไปแก้ข้อมูล ข้อแรกจะถูกล้างให้ตรวจทานใหม่')}
          </fieldset>
          <p className="application-message" role="alert">{message}</p><div className="actions">{stage > 0 && <button type="button" onClick={() => goTo(stage - 1)}>ย้อนกลับ</button>}<span className="muted">ขั้นตอน {stage + 1} จาก 4</span><button className="primary" type="submit">{stage === 3 ? 'ส่งใบสมัครตัวอย่าง' : 'ถัดไป'}{stage < 3 && <ArrowRight aria-hidden="true" />}</button></div>
        </form>
        {complete && <div className="application-complete"><ClipboardCheck className="finish-icon" aria-hidden="true" /><h2 tabIndex={-1}>ตัวอย่างสถานะ: ส่งใบสมัครแล้ว</h2><p>เมื่อเปิดใช้จริง ทีมงานจะตรวจข้อมูลและหลักฐาน แล้วแจ้งผลทางอีเมล</p><div className="note">นี่เป็นการทดลองขั้นตอน ยังไม่มีข้อมูลหรือไฟล์ถูกส่งไปที่ใด และยังไม่ได้สร้างบัญชีเมนเทอร์</div><p className="muted">สถานะจริงที่รองรับ: รอตรวจสอบ → ขอข้อมูลเพิ่มเติม → อนุมัติ / ไม่อนุมัติ</p><button type="button" onClick={() => setComplete(false)}>กลับไปตรวจใบสมัคร</button><Link className="application-return" to="/mentors">กลับไปหน้าเมนเทอร์</Link></div>}
      </div>
    </div>
    <p className="application-local-note">ข้อมูลกรอกเก็บเฉพาะระหว่างเปิดหน้านี้ ปิด รีเฟรช หรือออกจากหน้าสมัครแล้วหาย</p>
  </div></main>;
}
