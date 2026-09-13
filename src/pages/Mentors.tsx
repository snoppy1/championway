import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { deadlineOf } from '../data/competitions';
import type { Competition } from '../data/competitions';
import {
  availableSlots, formatSlot, mentorSlots, problems, tierAgainst, topics,
} from '../data/mentors';
import type { Mentor } from '../data/mentors';
import { useApi } from '../lib/useApi';

/** datetime-local speaks local wall-clock time, which is what the slots are built in. */
function toLocalInput(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const tierGroups = [
  { tier: 1 as const, title: 'เคยชนะงานนี้', hint: 'รู้จักโจทย์และเวทีเดียวกับที่ทีมกำลังเตรียม' },
  { tier: 2 as const, title: 'เคยชนะงานประเภทเดียวกัน', hint: 'ประสบการณ์จากเวทีใกล้เคียง' },
  { tier: 3 as const, title: 'ทักษะตรงกับสิ่งที่ทีมติด', hint: 'ช่วยแก้ปัญหาเฉพาะจุดที่คุณเลือก' },
];

interface Booking { mentor: Mentor; slot: Date; free: boolean }

function MentorCard({ mentor, deadline, teamSize, open, selected, onSelect, onBook }: {
  mentor: Mentor;
  deadline: Date;
  teamSize: number;
  open: boolean;
  selected: Date | undefined;
  onSelect: (slot: Date) => void;
  onBook: (booking: Booking) => void;
}) {
  const slots = availableSlots(mentor, deadline);
  const late = slots.length === 0;
  const chosen = selected ?? slots[0];
  const award = mentor.verified ? mentor.wonName : null;
  const perPerson = Math.round(mentor.price / teamSize);

  return <details className="mentor-card" open={open}>
    <summary>
      <span className="mentor-avatar" aria-hidden="true">{mentor.avatar}</span>
      <div>
        <h3>{mentor.name}</h3>
        <div className="card-org">{mentor.bio}</div>
        <small className="card-org">ตอบเฉลี่ย {mentor.replyTime}</small>
      </div>
      <span className="mentor-open" aria-hidden="true">รายละเอียด <ChevronDown size={14} /></span>
    </summary>
    <div className="mentor-inside">
      <div>
        {late && <span className="late-chip">คิวว่างหลังวันส่งงาน</span>}
        <div className="award-line">
          {award
            ? <>รางวัลชนะเลิศ · {award}<br /><span className="verified-line">✓ ยืนยันผลรางวัลแล้ว</span></>
            : 'ยังไม่มีผลรางวัลที่ยืนยัน'}
        </div>
        <div className="help-block"><b>ช่วยได้ดีที่สุด</b><br />{mentor.best}</div>
        <div className="help-block cannot"><b>ช่วยไม่ได้</b><br />{mentor.cannot}</div>
        <div className="topic-tags">
          {mentor.topics.map((topic) => <span className="pill" key={topic}>{topics[topic]}</span>)}
        </div>
      </div>
      <div className="mentor-booking">
        <div className="price">฿{mentor.price.toLocaleString('th-TH')} <small>/ ทีม / 60 นาที</small></div>
        <div className="split">ประมาณ ฿{perPerson.toLocaleString('th-TH')} / คน · ทีม {teamSize} คน</div>
        <small className="card-org">{late ? 'คิวแรกหลังวันส่งงาน' : 'คิวว่างก่อนส่งงาน'}</small>
        <div className="slot-row">
          {late
            ? <span className="card-org">{formatSlot(mentorSlots(mentor)[0])}</span>
            : slots.slice(0, 3).map((slot) => <button
              key={slot.toISOString()} type="button"
              className={chosen && slot.getTime() === chosen.getTime() ? 'slot-button selected' : 'slot-button'}
              aria-pressed={chosen ? slot.getTime() === chosen.getTime() : false}
              onClick={() => onSelect(slot)}
            >{formatSlot(slot)}</button>)}
        </div>
        {slots.length > 3 && <small className="card-org">และอีก {slots.length - 3} คิว</small>}
        <button
          type="button" className="primary-button" disabled={late}
          onClick={() => chosen && onBook({ mentor, slot: chosen, free: false })}
        >{late ? 'ไม่ทันงานนี้' : `จอง ${chosen ? formatSlot(chosen) : ''}`}</button>
        <button
          type="button" className="link-button"
          onClick={() => onBook({ mentor, slot: slots[0] ?? mentorSlots(mentor)[0], free: true })}
        >คุยฟรี 20 นาทีก่อนตัดสินใจ</button>
      </div>
    </div>
  </details>;
}

export function Mentors() {
  const [params, setParams] = useSearchParams();
  const paramSlug = params.get('competition') ?? '';
  const paramProblem = Number(params.get('problem'));

  /* รายชื่อเวทีกับเมนเทอร์มาจาก API ส่วนเวทีที่เลือกดึงแยกเพราะต้องใช้หมวดและวันปิดรับ */
  const { data: optionData } = useApi<{ items: { slug: string; name: string }[] }>('/competitions/options');
  const { data: mentorData } = useApi<{ items: Mentor[] }>('/mentors');
  const options = optionData?.items ?? [];
  const allMentors = mentorData?.items ?? [];

  const [slug, setSlug] = useState(paramSlug);
  const [deadline, setDeadline] = useState(params.get('deadline') ?? '');
  const [problem, setProblem] = useState<number | null>(
    Number.isInteger(paramProblem) && paramProblem >= 0 && paramProblem < problems.length ? paramProblem : null,
  );
  const [context, setContext] = useState<{ slug: string; deadline: Date; problem: number } | null>(null);
  const [error, setError] = useState('');
  const [teamSize, setTeamSize] = useState(4);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [booking, setBooking] = useState<Booking | null>(null);
  const [feedback, setFeedback] = useState('');

  useEffect(() => { document.title = 'เมนเทอร์ — ChampionWays'; }, []);

  const { data: chosenData } = useApi<{ competition: Competition }>(
    slug ? `/competitions/${encodeURIComponent(slug)}` : null,
  );
  const chosen = chosenData?.competition;

  /** เลือกเวทีแล้วเติมวันส่งให้เอง ซึ่งเป็นคำตอบที่ถูกเกือบทุกครั้ง
      ทำใน effect เพราะต้องรอข้อมูลเวทีจากเซิร์ฟเวอร์ก่อน */
  useEffect(() => {
    if (chosen && !params.get('deadline')) setDeadline(toLocalInput(deadlineOf(chosen)));
  }, [chosen, params]);

  function submit(event: FormEvent) {
    event.preventDefault();
    const when = new Date(deadline);
    if (!chosen || problem === null || Number.isNaN(when.getTime())) return;
    if (when.getTime() <= Date.now()) {
      setError('เลือกวันส่งงานในอนาคต เพื่อดูคิวที่ยังนัดได้');
      return;
    }
    setError('');
    setSelected({});
    setBooking(null);
    setContext({ slug, deadline: when, problem });
    const next = new URLSearchParams();
    next.set('competition', slug);
    next.set('deadline', deadline);
    next.set('problem', String(problem));
    setParams(next, { preventScrollReset: true });
  }

  const ranked = useMemo(() => {
    if (!context) return [];
    return allMentors
      .map((mentor) => ({ mentor, tier: tierAgainst(mentor, chosen, context.slug, context.problem) }))
      .filter((entry): entry is { mentor: Mentor; tier: 1 | 2 | 3 } => entry.tier !== null);
  }, [context, allMentors, chosen]);

  const competition = context ? chosen : undefined;

  return <main id="main" tabIndex={-1}>
    <section className="mentor-hero">
      <div className="shell">
        <p className="eyebrow">A LITTLE GUIDANCE. YOUR NEXT STEP.</p>
        <h1>{context && competition ? `${competition.name}` : 'ทีมคุณกำลังติดตรงไหน?'}</h1>
        <p>{context
          ? `ส่งงาน ${context.deadline.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })} · เลือกคนที่ช่วยทีมก้าวต่อได้ก่อนถึงวันส่ง`
          : 'บอกเวทีและสิ่งที่อยากให้ช่วย แล้วค่อยเลือกรุ่นพี่ที่เหมาะกับทีม'}</p>
      </div>
    </section>

    <div className="shell page">
      {!context && <form className="panel" onSubmit={submit}>
        <h2>เริ่มจากบริบทของทีมคุณ</h2>
        <p className="card-org">ตอบสองเรื่องนี้ก่อน เราจะได้แสดงคนที่ช่วยได้ตรงจุด</p>
        <div className="field-grid">
          <label className="field">
            1. งานแข่งขัน
            <select value={slug} required onChange={(event) => setSlug(event.target.value)}>
              <option value="">{options.length ? 'เลือกงานแข่งขัน' : 'กำลังโหลดรายการ…'}</option>
              {options.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
            </select>
          </label>
          <label className="field">
            วันและเวลาส่งงาน (ตามเวลาในเครื่อง)
            <input type="datetime-local" required value={deadline} onChange={(event) => setDeadline(event.target.value)} />
          </label>
        </div>
        <fieldset>
          <legend>2. ตอนนี้ทีมติดเรื่องไหน?</legend>
          <div className="choice-grid">
            {problems.map((label, index) => <label className="choice" key={label}>
              <input
                type="radio" name="problem" required
                checked={problem === index}
                onChange={() => setProblem(index)}
              />
              <span>{label}</span>
            </label>)}
          </div>
        </fieldset>
        <div className="panel-actions">
          <span className="card-org">ทุกคนมีคุยฟรี 20 นาทีก่อนตัดสินใจ</span>
          {/* ข้อมูลเวทีมาจากเซิร์ฟเวอร์ กดก่อนโหลดเสร็จจะไม่เกิดอะไรขึ้นเลย จึงปิดปุ่มไว้ก่อน */}
          <button className="primary-button" type="submit" disabled={Boolean(slug) && !chosen}>
            {slug && !chosen ? 'กำลังโหลดข้อมูลเวที…' : 'ดูเมนเทอร์ที่ช่วยทีมได้'}<ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </form>}

      {context && <section aria-labelledby="mentor-results">
        <h2 className="sr-only" id="mentor-results">เมนเทอร์ที่ตรงกับบริบทของทีม</h2>
        <div className="mentor-toolbar">
          <div>
            <span className="pill">{ranked.filter((entry) => entry.mentor.verified).length} คนยืนยันผลรางวัลแล้ว</span>
            <button type="button" className="link-button" style={{ marginLeft: 12 }} onClick={() => setContext(null)}>แก้ไขบริบท</button>
          </div>
          <label className="sort-field">
            สมาชิกในทีม
            <span className="select-wrap">
              <select value={teamSize} onChange={(event) => setTeamSize(Number(event.target.value))}>
                {Array.from({ length: 10 }, (_, index) => index + 1).map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
              <ChevronDown size={13} aria-hidden="true" />
            </span>
            คน
          </label>
        </div>

        <p className="notice">คุยฟรี 20 นาทีก่อนตัดสินใจได้ทุกคน · ราคาด้านล่างเป็นราคาต่อทีม</p>

        {booking && <div className="panel" style={{ marginTop: 20 }} role="status">
          <h2>{booking.free ? 'คุยฟรี 20 นาที' : 'ยืนยันรายละเอียดการปรึกษา'} · {booking.mentor.name}</h2>
          <p>{formatSlot(booking.slot)}</p>
          <p>{booking.free ? 'ไม่มีค่าใช้จ่าย' : `฿${booking.mentor.price.toLocaleString('th-TH')} ต่อทีม · 60 นาที`}</p>
          <p className="card-org">พรีวิวขั้นตอนเท่านั้น ยังไม่มีการจองหรือเรียกเก็บเงินจริง</p>
          <button type="button" className="link-button" onClick={() => setBooking(null)}>ปิดรายละเอียด</button>
        </div>}

        {tierGroups.map((group, groupIndex) => {
          const members = ranked.filter((entry) => entry.tier === group.tier && availableSlots(entry.mentor, context.deadline).length > 0);
          return <div key={group.tier}>
            <div className="tier-group">
              <span className="tier-number" aria-hidden="true">0{group.tier}</span>
              <div><h2>{group.title}</h2><p>{group.hint}</p></div>
            </div>
            {members.length > 0
              ? members.map((entry, index) => <MentorCard
                key={entry.mentor.id}
                mentor={entry.mentor}
                deadline={context.deadline}
                teamSize={teamSize}
                open={groupIndex === 0 && index === 0}
                selected={selected[entry.mentor.id] ? new Date(selected[entry.mentor.id]) : undefined}
                onSelect={(slot) => setSelected({ ...selected, [entry.mentor.id]: slot.toISOString() })}
                onBook={setBooking}
              />)
              : <p className="card-org">ยังไม่มีคนในชั้นนี้ที่คิวว่างก่อนวันส่งงาน</p>}
          </div>;
        })}

        {(() => {
          const late = ranked.filter((entry) => availableSlots(entry.mentor, context.deadline).length === 0);
          if (late.length === 0) return null;
          return <div>
            <div className="tier-group">
              <span className="tier-number" aria-hidden="true">—</span>
              <div><h2>คิวไม่ทันเดดไลน์</h2><p>แสดงไว้เผื่อเตรียมเวทีถัดไป</p></div>
            </div>
            {late.map((entry) => <MentorCard
              key={entry.mentor.id}
              mentor={entry.mentor}
              deadline={context.deadline}
              teamSize={teamSize}
              open={false}
              selected={undefined}
              onSelect={() => undefined}
              onBook={setBooking}
            />)}
          </div>;
        })()}

        <p className="card-org" style={{ marginTop: 18 }}>ยังไม่มีสถิติผลลัพธ์จนกว่าจะมีข้อมูลการใช้งานจริง</p>
      </section>}

      <details className="panel" style={{ marginTop: 28 }}>
        <summary>ตัวอย่างแบบถามหลังจบการปรึกษา</summary>
        <p style={{ marginTop: 12 }}>วันนี้ทีมคุยเรื่องอะไรบ้าง?</p>
        <div className="checkbox-row">
          {topics.map((topic, index) => <label key={topic}>
            <input type="checkbox" name="feedback-topic" value={index} />{topic}
          </label>)}
        </div>
        <button type="button" className="link-button" onClick={(event) => {
          const form = event.currentTarget.closest('details');
          const count = form ? form.querySelectorAll<HTMLInputElement>('input[name="feedback-topic"]:checked').length : 0;
          setFeedback(count > 0 ? 'บันทึกคำตอบตัวอย่างแล้ว (เฉพาะหน้านี้)' : 'เลือกอย่างน้อย 1 เรื่อง');
        }}>บันทึกคำตอบตัวอย่าง</button>
        <p role="status">{feedback}</p>
      </details>

      <section className="panel" style={{ marginTop: 20 }} aria-labelledby="policies-title">
        <h2 id="policies-title" className="sr-only">เงื่อนไขการใช้งาน</h2>
        <div className="policy-grid">
          <div>
            <strong>เงินถึงเมนเทอร์หลังคุยจบ 24 ชั่วโมง</strong>
            <p className="card-org">แพลตฟอร์มจะโอนเงินให้เมนเทอร์หลังจบการปรึกษา 24 ชั่วโมง</p>
          </div>
          <div>
            <strong>เมนเทอร์ไม่มาตามนัด คืนเต็มจำนวน</strong>
            <p className="card-org">หากเมนเทอร์ไม่เข้าร่วมตามเวลานัด ทีมจะได้รับเงินคืนเต็มจำนวน</p>
          </div>
        </div>
        <Link className="link-button" to="/mentors/apply">
          เคยผ่านเวทีจริง? สมัครเป็นเมนเทอร์
        </Link>
      </section>
    </div>
  </main>;
}
