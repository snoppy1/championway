import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ClipboardCheck, Eye, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  categories, categoryLabel, levelLabels, regionLabels, rewardLabels, typeLabels,
} from '../data/competitions';
import type { CategoryId, Level, OpportunityType, Region, Reward } from '../data/competitions';
import { kindKeys, kinds, themeKeys, themes } from '../data/focus';
import type { Kind, Theme } from '../data/focus';
import { useAuth } from '../data/auth';
import { ApiError, post } from '../lib/api';
import { CoverArt } from '../components/CoverArt';
import '../form.css';

const steps = ['ผู้จัดงาน', 'รายละเอียดงาน', 'วันเวลาและรางวัล', 'ตรวจทานและส่ง'];

type Field =
  | 'organizerName' | 'contactName' | 'contactRole' | 'contactEmail' | 'contactPhone' | 'organizerUrl'
  | 'name' | 'description' | 'teamMin' | 'teamMax'
  | 'opensAt' | 'closesAt' | 'eventDate' | 'venue' | 'prizeValue' | 'prizeNote' | 'fee'
  | 'sourceUrl' | 'registerUrl';

const empty: Record<Field, string> = {
  organizerName: '', contactName: '', contactRole: '', contactEmail: '', contactPhone: '', organizerUrl: '',
  name: '', description: '', teamMin: '1', teamMax: '4',
  opensAt: '', closesAt: '', eventDate: '', venue: '', prizeValue: '', prizeNote: '', fee: '',
  sourceUrl: '', registerUrl: '',
};

type ConsentKey = 'authority' | 'accuracy' | 'rights' | 'review' | 'free';
/** ทุกช่องเริ่มต้นไม่ถูกเลือก และบังคับติ๊กครบก่อนส่ง */
const consentItems: { key: ConsentKey; label: string }[] = [
  { key: 'authority', label: 'ยืนยันว่าเป็นผู้จัดงานนี้ หรือได้รับมอบหมายให้ประชาสัมพันธ์' },
  { key: 'accuracy', label: 'ยืนยันว่าข้อมูลถูกต้อง และจะแจ้งทันทีเมื่อมีการเปลี่ยนวันหรือยกเลิก' },
  { key: 'rights', label: 'ยอมรับว่าข้อความและภาพที่ส่งมาไม่ละเมิดลิขสิทธิ์ผู้อื่น และอนุญาตให้ ChampionWays เผยแพร่เพื่อประชาสัมพันธ์งานนี้' },
  { key: 'review', label: 'รับทราบว่าทีมงานตรวจสอบก่อนเผยแพร่ และอาจแก้ถ้อยคำให้เข้ารูปแบบเว็บโดยไม่เปลี่ยนสาระ' },
  { key: 'free', label: 'รับทราบว่าการลงประกาศไม่มีค่าใช้จ่าย และไม่มีการรับประกันจำนวนผู้สมัคร' },
];
const noConsent: Record<ConsentKey, boolean> = {
  authority: false, accuracy: false, rights: false, review: false, free: false,
};

const typeIds = Object.keys(typeLabels) as OpportunityType[];
const levelIds = Object.keys(levelLabels) as Level[];
const regionIds = Object.keys(regionLabels) as Region[];
const rewardIds = Object.keys(rewardLabels) as Reward[];
const categoryIds = categories.filter((item) => item.id !== 'all').map((item) => item.id) as CategoryId[];

const baht = new Intl.NumberFormat('th-TH');
const today = () => new Date().toISOString().slice(0, 10);
const dateLabel = (value: string) => (value
  ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`))
  : '');

export function OrganiserSubmit() {
  const { user, loading: authLoading } = useAuth();
  const [stage, setStage] = useState(0);
  const [values, setValues] = useState(empty);
  const [type, setType] = useState<OpportunityType>('contest');
  const [chosenCategories, setChosenCategories] = useState<CategoryId[]>([]);
  const [kind, setKind] = useState<Kind | ''>('');
  const [chosenThemes, setChosenThemes] = useState<Theme[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [region, setRegion] = useState<Region>('online');
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [poster, setPoster] = useState<File>();
  const [posterUrl, setPosterUrl] = useState('');
  const [consent, setConsent] = useState(noConsent);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [doneId, setDoneId] = useState('');

  const formRef = useRef<HTMLFormElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const previousStage = useRef(stage);
  const previousDone = useRef(doneId);

  useEffect(() => { document.title = 'ลงงานแข่งขัน — ChampionWays'; }, []);

  useEffect(() => {
    if (!poster) { setPosterUrl(''); return; }
    const url = URL.createObjectURL(poster);
    setPosterUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [poster]);

  // ย้าย focus ไปหัวข้อของขั้นใหม่ เพื่อให้เครื่องอ่านหน้าจอรู้ว่าหน้าเปลี่ยนแล้ว
  useEffect(() => {
    if (stage === previousStage.current && doneId === previousDone.current) return;
    previousStage.current = stage;
    previousDone.current = doneId;
    const heading = sheetRef.current?.querySelector<HTMLElement>(
      doneId ? '.application-complete h2' : `fieldset[data-stage="${stage}"] h2`,
    );
    heading?.focus();
    sheetRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [stage, doneId]);

  /** แก้ข้อมูลหลังติ๊กยืนยันความถูกต้องแล้ว ให้ติ๊กนั้นหลุด เพื่อบังคับให้อ่านซ้ำ */
  const reviewAgain = () => setConsent((c) => (c.accuracy ? { ...c, accuracy: false } : c));
  const set = (field: Field, value: string) => {
    reviewAgain();
    setValues((current) => ({ ...current, [field]: value }));
  };
  const goTo = (target: number) => { setStage(target); setMessage(''); };

  function toggle<T>(list: T[], value: T, setter: (next: T[]) => void, max?: number) {
    reviewAgain();
    if (list.includes(value)) setter(list.filter((item) => item !== value));
    else if (!max || list.length < max) setter([...list, value]);
    else setMessage(`เลือกได้สูงสุด ${max} หมวด`);
  }

  function validate() {
    let error = '';
    let missingConsent: ConsentKey | undefined;
    const need = (field: Field, label: string) => { if (!error && !values[field].trim()) error = `กรอก${label}`; };

    if (stage === 0) {
      need('organizerName', 'ชื่อหน่วยงาน');
      need('contactName', 'ชื่อผู้ติดต่อ');
      need('contactRole', 'ตำแหน่ง');
      need('contactEmail', 'อีเมล');
      need('contactPhone', 'เบอร์โทร');
      need('organizerUrl', 'ลิงก์เว็บหรือเพจทางการ');
    }
    if (stage === 1) {
      need('name', 'ชื่องาน');
      need('description', 'คำบรรยายสั้น');
      if (!error && !kind) error = 'เลือกประเภทงาน';
      if (!error && !chosenThemes.length) error = 'เลือกหมวดของงานอย่างน้อยหนึ่งหมวด';
      if (!error && !chosenCategories.length) error = 'เลือกหมวดหมู่อย่างน้อยหนึ่งหมวด';
      if (!error && !levels.length) error = 'เลือกระดับผู้เข้าแข่งอย่างน้อยหนึ่งระดับ';
      const min = Number(values.teamMin);
      const max = Number(values.teamMax);
      if (!error && (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min)) {
        error = 'ขนาดทีมต้องเป็นจำนวนเต็ม และค่าสูงสุดต้องไม่น้อยกว่าค่าต่ำสุด';
      }
    }
    if (stage === 2) {
      need('closesAt', 'วันปิดรับสมัคร');
      if (!error && values.closesAt <= today()) error = 'วันปิดรับต้องเป็นวันในอนาคต';
      if (!error && values.opensAt && values.opensAt > values.closesAt) error = 'วันเปิดรับต้องมาก่อนวันปิดรับ';
      need('sourceUrl', 'ลิงก์ประกาศต้นทาง');
      if (!error && region !== 'online' && !values.venue.trim()) error = 'กรอกสถานที่จัดงาน';
      if (!error && Number(values.prizeValue || 0) === 0 && !values.prizeNote.trim()) {
        error = 'ไม่มีเงินรางวัลก็ได้ แต่ต้องบอกว่าผู้ชนะได้อะไรแทน';
      }
    }
    if (stage === 3) {
      missingConsent = consentItems.find((item) => !consent[item.key])?.key;
      if (missingConsent) error = 'ติ๊กยอมรับเงื่อนไขให้ครบทุกข้อก่อนส่งใบ';
    }

    setMessage(error);
    if (missingConsent) document.getElementById(`consent-${missingConsent}`)?.focus();
    else if (error) formRef.current?.querySelector<HTMLElement>(`fieldset[data-stage="${stage}"] :invalid`)?.focus();
    return !error;
  }

  async function submit() {
    setSending(true);
    setMessage('');
    try {
      const fileIds: string[] = [];
      if (poster) {
        const body = new FormData();
        body.append('file', poster);
        const uploaded = await fetch('/api/files', { method: 'POST', body, credentials: 'same-origin' });
        if (!uploaded.ok) {
          const failure = await uploaded.json().catch(() => ({})) as { error?: string };
          throw new ApiError(uploaded.status, failure.error ?? 'อัปโหลดโปสเตอร์ไม่สำเร็จ');
        }
        fileIds.push(((await uploaded.json()) as { file: { id: string } }).file.id);
      }

      const { id } = await post<{ id: string }>('/submissions/competition', {
        organizerName: values.organizerName, contactName: values.contactName,
        contactRole: values.contactRole, contactEmail: values.contactEmail,
        contactPhone: values.contactPhone, organizerUrl: values.organizerUrl,
        name: values.name, description: values.description, type,
        kind: kind || undefined, themes: chosenThemes,
        categories: chosenCategories, levels, rewards,
        teamMin: Number(values.teamMin), teamMax: Number(values.teamMax),
        opensAt: values.opensAt || undefined,
        closesAt: values.closesAt,
        eventDate: values.eventDate || undefined,
        region, venue: values.venue.trim() || undefined,
        prizeValue: Number(values.prizeValue || 0),
        prizeNote: values.prizeNote.trim() || undefined,
        fee: values.fee ? Number(values.fee) : undefined,
        sourceUrl: values.sourceUrl,
        registerUrl: values.registerUrl.trim() || undefined,
        fileIds,
      });
      setDoneId(id);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'ส่งใบไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSending(false);
    }
  }

  function next(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    if (stage < 3) { setStage(stage + 1); return; }
    if (!user) { setMessage('ต้องเข้าสู่ระบบก่อนส่งใบ'); return; }
    void submit();
  }

  const group = (title: string, children: ReactNode, hint?: string, aside?: ReactNode) => (
    <section className="group">
      <div className="group-head"><h3>{title}</h3>{aside}</div>
      {hint && <p className="muted group-hint">{hint}</p>}
      {children}
    </section>
  );

  const reviewGroup = (title: string, target: number, children: ReactNode) => (
    <section className="group review-group">
      <div className="group-head">
        <h3>{title}</h3>
        <button className="plain" type="button" aria-label={`แก้ไข${title}`} onClick={() => goTo(target)}>แก้ไข</button>
      </div>
      {children}
    </section>
  );

  const row = (label: string, value: ReactNode) => (
    <div className="review"><small>{label}</small>{value || '—'}</div>
  );

  const prizeText = Number(values.prizeValue || 0) > 0
    ? `รางวัลรวม ${baht.format(Number(values.prizeValue))} บาท`
    : values.prizeNote || 'ไม่มีเงินรางวัล';
  const teamText = values.teamMin === values.teamMax
    ? (values.teamMin === '1' ? 'เดี่ยว' : `ทีม ${values.teamMin} คน`)
    : `ทีม ${values.teamMin}–${values.teamMax} คน`;

  return <main id="main" tabIndex={-1}><div id="cw-submit" className="cw-form">
    <section className="hero">
      <div className="application-hero-inner">
        <Link className="application-back" to="/organizers"><ArrowLeft aria-hidden="true" />กลับไปหน้าผู้จัดงาน</Link>
        <p><span className="tag">สำหรับผู้จัดงาน</span></p>
        <h1>ลงงานแข่งขันของคุณ</h1>
        <p className="muted">ไม่มีค่าใช้จ่าย ทีมงานตรวจสอบก่อนเผยแพร่ และแจ้งผลทางอีเมลทุกกรณี</p>
      </div>
    </section>

    <div className="layout">
      <aside aria-label="ขั้นตอนการลงงาน">
        <ol className="steps">
          {steps.map((step, index) => (
            <li key={step} className={`step ${index === stage ? 'current' : index < stage ? 'done' : ''}`}
              aria-current={index === stage ? 'step' : undefined}>
              <b>{index + 1}</b>{step}
            </li>
          ))}
        </ol>
        <div className="aside-note">
          <ShieldCheck aria-hidden="true" />
          <h3>ตรวจก่อนเผยแพร่</h3>
          <p className="muted">ส่งใบ → ทีมงานตรวจกับประกาศต้นทาง → แจ้งผลภายใน 2 วันทำการ</p>
        </div>
        <div className="aside-note">
          <Eye aria-hidden="true" />
          <h3>ข้อมูลติดต่อไม่ขึ้นหน้าเว็บ</h3>
          <p className="muted">อีเมลและเบอร์โทรใช้ยืนยันตัวตนและติดต่อกลับเท่านั้น</p>
        </div>
      </aside>

      <div className="sheet" ref={sheetRef}>
        {!doneId && <form ref={formRef} onSubmit={next} noValidate>
          <fieldset data-stage="0" hidden={stage !== 0} disabled={stage !== 0}>
            <div className="intro"><h2 tabIndex={-1}>ใครเป็นผู้จัดงานนี้</h2>
              <p className="muted">ใช้ยืนยันว่าใบนี้มาจากผู้จัดจริง ไม่ใช่คนนอกที่คัดลอกประกาศมา</p></div>
            {group('หน่วยงานและผู้ติดต่อ', <>
              <label>ชื่อหน่วยงานที่จัด *
                <input required value={values.organizerName} onChange={(e) => set('organizerName', e.target.value)} maxLength={200} />
                <small>ชื่อนี้จะขึ้นหน้าเว็บในฐานะผู้จัด</small>
              </label>
              <div className="grid">
                <label>ชื่อผู้ติดต่อ *
                  <input required value={values.contactName} onChange={(e) => set('contactName', e.target.value)} maxLength={120} />
                </label>
                <label>ตำแหน่ง *
                  <input required value={values.contactRole} onChange={(e) => set('contactRole', e.target.value)} maxLength={120} />
                </label>
              </div>
              <div className="grid">
                <label>อีเมล *
                  <input id="submit-email" type="email" required value={values.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
                  <small>ใช้แจ้งผลการตรวจ ไม่แสดงหน้าเว็บ</small>
                </label>
                <label>เบอร์โทร *
                  <input required value={values.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} maxLength={40} />
                  <small>ใช้ติดต่อกลับเท่านั้น ไม่แสดงหน้าเว็บ</small>
                </label>
              </div>
              <label>ลิงก์เว็บหรือเพจทางการ *
                <input type="url" required placeholder="https://" value={values.organizerUrl} onChange={(e) => set('organizerUrl', e.target.value)} />
              </label>
            </>, 'ทีมงานใช้ข้อมูลนี้ตรวจว่าชื่อหน่วยงานตรงกับที่ปรากฏในประกาศ')}
          </fieldset>

          <fieldset data-stage="1" hidden={stage !== 1} disabled={stage !== 1}>
            <div className="intro"><h2 tabIndex={-1}>งานนี้คืออะไร</h2>
              <p className="muted">เขียนให้นักเรียนอ่านแล้วรู้ทันทีว่าเหมาะกับตัวเองไหม</p></div>
            {group('ชื่อและคำบรรยาย', <>
              <label>ชื่องาน *
                <input required value={values.name} onChange={(e) => set('name', e.target.value)} maxLength={200} />
              </label>
              <label>คำบรรยายสั้น *
                <textarea required value={values.description} onChange={(e) => set('description', e.target.value)} maxLength={400} rows={3} />
                <small>ขึ้นบนการ์ดในหน้ารายการ เขียนสิ่งที่ต้องทำและสิ่งที่ต้องส่ง</small>
              </label>
            </>, undefined, <span className="count">{values.description.length} / 400</span>)}

            {group('งานนี้เป็นแบบไหน', <div className="topics">
              {kindKeys.map((id) => (
                <label className="check topic" key={id}>
                  <input type="radio" name="competition-kind" checked={kind === id}
                    onChange={() => { reviewAgain(); setKind(id); }} />
                  <span>{kinds[id]}</span>
                </label>
              ))}
            </div>, 'ใช้แสดงบนหน้า “อยากแข่งงานไหน” และใช้จับคู่กับเมนเทอร์')}

            {group('หมวดของงาน', <div className="topics">
              {themeKeys.map((id) => (
                <label className="check topic" key={id}>
                  <input type="checkbox" checked={chosenThemes.includes(id)}
                    onChange={() => toggle(chosenThemes, id, setChosenThemes)} />
                  <span>{themes[id]}</span>
                </label>
              ))}
            </div>, 'เลือกได้มากกว่าหนึ่งหมวด คนละชุดกับหมวดหมู่ด้านล่าง')}

            {group('ประเภทโอกาส', <div className="topics">
              {typeIds.map((id) => (
                <label className="check topic" key={id}>
                  <input type="radio" name="opportunity-type" checked={type === id}
                    onChange={() => { reviewAgain(); setType(id); }} />
                  <span>{typeLabels[id]}</span>
                </label>
              ))}
            </div>)}

            {group('หมวดหมู่', <div className="topics">
              {categoryIds.map((id) => (
                <label className="check topic" key={id}>
                  <input type="checkbox" checked={chosenCategories.includes(id)}
                    onChange={() => toggle(chosenCategories, id, setChosenCategories, 3)} />
                  <span>{categoryLabel(id)}</span>
                </label>
              ))}
            </div>, 'เลือกได้สูงสุด 3 หมวด หมวดแรกที่เลือกคือหมวดหลัก',
            <span className="count" aria-live="polite">เลือกแล้ว {chosenCategories.length} จาก 3</span>)}

            {group('ใครเข้าร่วมได้', <>
              <div className="topics">
                {levelIds.map((id) => (
                  <label className="check topic" key={id}>
                    <input type="checkbox" checked={levels.includes(id)} onChange={() => toggle(levels, id, setLevels)} />
                    <span>{levelLabels[id]}</span>
                  </label>
                ))}
              </div>
              <div className="grid">
                <label>ขนาดทีมต่ำสุด *
                  <input type="number" min={1} max={100} required value={values.teamMin} onChange={(e) => set('teamMin', e.target.value)} />
                </label>
                <label>ขนาดทีมสูงสุด *
                  <input type="number" min={1} max={100} required value={values.teamMax} onChange={(e) => set('teamMax', e.target.value)} />
                </label>
              </div>
              <p className="muted application-small">จะแสดงเป็น “{teamText}”</p>
            </>)}
          </fieldset>

          <fieldset data-stage="2" hidden={stage !== 2} disabled={stage !== 2}>
            <div className="intro"><h2 tabIndex={-1}>วันเวลา รางวัล และลิงก์</h2>
              <p className="muted">ลิงก์ประกาศต้นทางบังคับ เพราะผู้ใช้ต้องตรวจสอบเองได้</p></div>

            {group('วันเวลา', <>
              <div className="grid">
                <label>วันเปิดรับสมัคร
                  <input type="date" value={values.opensAt} onChange={(e) => set('opensAt', e.target.value)} />
                  <small>ไม่ใส่ = เปิดรับแล้ว</small>
                </label>
                <label>วันปิดรับสมัคร *
                  <input type="date" required min={today()} value={values.closesAt} onChange={(e) => set('closesAt', e.target.value)} />
                </label>
              </div>
              <label>วันจัดงาน
                <input type="date" value={values.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
              </label>
            </>)}

            {group('สถานที่', <>
              <label>รูปแบบ
                <select value={region} onChange={(e) => { reviewAgain(); setRegion(e.target.value as Region); }}>
                  {regionIds.map((id) => <option key={id} value={id}>{regionLabels[id]}</option>)}
                </select>
              </label>
              {region !== 'online' && <label>สถานที่จัดงาน *
                <input required value={values.venue} onChange={(e) => set('venue', e.target.value)} maxLength={200} />
              </label>}
            </>)}

            {group('รางวัล', <>
              <div className="price-row">
                <label>เงินรางวัลรวม (บาท)
                  <input type="number" min={0} value={values.prizeValue} onChange={(e) => set('prizeValue', e.target.value)} />
                  <small>ไม่มีเงินรางวัลให้เว้นว่างหรือใส่ 0</small>
                </label>
                <div className="price-preview">
                  <small>จะแสดงเป็น</small>
                  <strong>{prizeText}</strong>
                </div>
              </div>
              <label>รางวัลที่ไม่ใช่เงิน
                <input value={values.prizeNote} onChange={(e) => set('prizeNote', e.target.value)} maxLength={200}
                  placeholder="เช่น ทุนดูงานต่างประเทศ" />
                <small>บังคับกรอกเมื่อไม่มีเงินรางวัล ผู้ใช้ต้องรู้ว่าผู้ชนะได้อะไร</small>
              </label>
              <div className="topics">
                {rewardIds.map((id) => (
                  <label className="check topic" key={id}>
                    <input type="checkbox" checked={rewards.includes(id)} onChange={() => toggle(rewards, id, setRewards)} />
                    <span>{rewardLabels[id]}</span>
                  </label>
                ))}
              </div>
              <label>ค่าสมัคร (บาท)
                <input type="number" min={0} value={values.fee} onChange={(e) => set('fee', e.target.value)} />
                <small>เว้นว่าง = สมัครฟรี</small>
              </label>
            </>)}

            {group('ลิงก์และโปสเตอร์', <>
              <label>ลิงก์ประกาศต้นทาง *
                <input type="url" required placeholder="https://" value={values.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} />
                <small>หน้าประกาศทางการของงานนี้ ทีมงานจะเปิดตรวจ</small>
              </label>
              <label>ลิงก์สมัคร
                <input type="url" placeholder="https://" value={values.registerUrl} onChange={(e) => set('registerUrl', e.target.value)} />
              </label>
              <label htmlFor="submit-poster">โปสเตอร์ (ไม่บังคับ)
                <input id="submit-poster" type="file" accept="image/png,image/jpeg,image/webp,application/pdf"
                  onChange={(e) => { reviewAgain(); setPoster(e.target.files?.[0]); }} />
                <small>JPG, PNG, WebP หรือ PDF ไม่เกิน 5 MB · ต้องเป็นภาพที่คุณมีสิทธิ์ใช้</small>
              </label>
              {posterUrl && poster?.type !== 'application/pdf' && (
                <img className="poster-preview" src={posterUrl} alt="โปสเตอร์ที่เลือก" />
              )}
              {poster?.type === 'application/pdf' && <p className="muted application-small">แนบไฟล์ {poster.name}</p>}
            </>)}
          </fieldset>

          <fieldset data-stage="3" hidden={stage !== 3} disabled={stage !== 3}>
            <div className="intro"><h2 tabIndex={-1}>ตรวจทานก่อนส่ง</h2>
              <p className="muted">นี่คือสิ่งที่ผู้ใช้จะเห็นถ้าใบนี้ผ่านการตรวจ</p></div>

            {group('การ์ดที่จะขึ้นหน้าเว็บ', <article className="competition-card preview-card">
              <div className="card-cover">
                <CoverArt category={chosenCategories[0] ?? 'business'} seed="organiser-preview" />
              </div>
              <div className="card-body">
                <div className="card-meta">
                  {chosenCategories[0] && <span className="category-pill">{categoryLabel(chosenCategories[0])}</span>}
                  {chosenCategories.length > 1 && (
                    <span className="category-pill is-more"
                      aria-label={`อีก ${chosenCategories.length - 1} หมวด: ${chosenCategories.slice(1).map(categoryLabel).join(' ')}`}>
                      +{chosenCategories.length - 1}
                    </span>
                  )}
                  <span className="card-org">{values.organizerName || 'ชื่อหน่วยงาน'}</span>
                </div>
                <h3>{values.name || 'ชื่องาน'}</h3>
                <p className="card-summary">{values.description || 'คำบรรยายสั้น'}</p>
                <div className="card-facts">
                  <span>ปิดรับ {dateLabel(values.closesAt) || '—'}</span>
                  <span>{prizeText}</span>
                </div>
              </div>
            </article>)}

            {reviewGroup('ผู้จัดงาน', 0, <>
              {row('หน่วยงาน', values.organizerName)}
              {row('ผู้ติดต่อ', `${values.contactName} · ${values.contactRole}`)}
              {row('อีเมลและเบอร์โทร (ไม่ขึ้นหน้าเว็บ)', `${values.contactEmail} · ${values.contactPhone}`)}
              {row('เว็บหรือเพจทางการ', values.organizerUrl)}
            </>)}

            {reviewGroup('รายละเอียดงาน', 1, <>
              {row('ประเภท', typeLabels[type])}
              {row('ประเภทงาน', kind ? kinds[kind] : '')}
              {row('หมวดของงาน', chosenThemes.map((id) => themes[id]).join(' · '))}
              {row('หมวดหมู่', chosenCategories.map(categoryLabel).join(' · '))}
              {row('ระดับผู้เข้าแข่ง', levels.map((id) => levelLabels[id]).join(' / '))}
              {row('ขนาดทีม', teamText)}
            </>)}

            {reviewGroup('วันเวลาและรางวัล', 2, <>
              {row('เปิดรับ', dateLabel(values.opensAt) || 'เปิดรับแล้ว')}
              {row('ปิดรับ', dateLabel(values.closesAt))}
              {row('วันจัดงาน', dateLabel(values.eventDate))}
              {row('สถานที่', region === 'online' ? regionLabels.online : `${values.venue} · ${regionLabels[region]}`)}
              {row('รางวัล', prizeText)}
              {row('รางวัลอื่น', rewards.map((id) => rewardLabels[id]).join(' · '))}
              {row('ค่าสมัคร', values.fee ? `${baht.format(Number(values.fee))} บาท` : 'สมัครฟรี')}
              {row('ลิงก์ประกาศต้นทาง', values.sourceUrl)}
              {row('โปสเตอร์', poster ? poster.name : 'ไม่ได้แนบ')}
            </>)}

            {group('ยอมรับเงื่อนไข', <div className="consent-list">
              {consentItems.map((item) => (
                <label className={`check consent-check${item.key === 'free' ? ' consent-payment' : ''}`} key={item.key}>
                  <input id={`consent-${item.key}`} type="checkbox" checked={consent[item.key]}
                    onChange={() => setConsent((c) => ({ ...c, [item.key]: !c[item.key] }))} />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>)}
          </fieldset>

          {!authLoading && !user && <p className="note" role="status">
            ต้อง<Link to="/signin?next=/organizers/submit">เข้าสู่ระบบ</Link>ก่อนจึงจะส่งใบได้ กรอกข้อมูลไว้ก่อนได้ แต่กดส่งไม่ได้จนกว่าจะเข้าสู่ระบบ
          </p>}
          <p className="application-message" role="alert">{message}</p>
          <div className="actions">
            {stage > 0 && <button type="button" onClick={() => goTo(stage - 1)}>ย้อนกลับ</button>}
            <span className="muted">ขั้นตอน {stage + 1} จาก 4</span>
            <button className="primary" type="submit" disabled={sending}>
              {stage === 3 ? (sending ? 'กำลังส่ง…' : 'ส่งใบลงงานแข่ง') : 'ถัดไป'}
              {stage < 3 && <ArrowRight aria-hidden="true" />}
            </button>
          </div>
        </form>}

        {doneId && <div className="application-complete">
          <ClipboardCheck className="finish-icon" aria-hidden="true" />
          <h2 tabIndex={-1}>ส่งใบลงงานแข่งแล้ว</h2>
          <p>ใบ {doneId} เข้าคิวตรวจแล้ว ทีมงานจะตรวจกับประกาศต้นทางแล้วแจ้งผลทางอีเมลทุกกรณี</p>
          <div className="note">ตรวจภายใน 2 วันทำการ ถ้าข้อมูลไม่ครบทีมงานจะขอเพิ่มทางอีเมลแทนการปฏิเสธทันที</div>
          <p className="muted">สถานะที่รองรับ: รอตรวจ → ขอข้อมูลเพิ่ม → เผยแพร่ / ไม่ผ่าน</p>
          <Link className="application-return" to="/">กลับไปหน้าแรก</Link>
        </div>}
      </div>
    </div>
  </div></main>;
}
