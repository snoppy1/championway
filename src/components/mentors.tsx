import { Link } from 'react-router-dom';
import { Award, ChevronRight, MessageCircle, Trophy, UserCheck } from 'lucide-react';
import { useI18n } from '../i18n';
import '../consult.css';
import type { ListedMentor, Rating as RatingValue, RankedMentor } from '../data/consult';

/* ส่วนประกอบของรายชื่อเมนเทอร์ที่ใช้ร่วมกันระหว่างหน้าทำเนียบ Rising Star กับแท็บ Available mentors
   สไตล์อยู่ใน rising-star.css (คลาส rs-*) เพื่อให้สองหน้านี้หน้าตาเหมือนกันเสมอ */

export function StarIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3L2.9 9.5l6.3-.9z" /></svg>;
}

export function RisingStarPill() {
  const { t } = useI18n();
  return <span className="rs-pill"><StarIcon />{t.risingStar.pill}</span>;
}

/** รูปวงกลมของเมนเทอร์: รูปโปรไฟล์ถ้ามี (บังคับตั้งแต่ 6 ต.ค. 2569) ไม่อย่างนั้นตัวอักษรแรก */
export function Avatar({ initial, plain = false, photoUrl }: { initial: string; plain?: boolean; photoUrl?: string | null }) {
  const className = plain ? 'rs-avatar rs-avatar--plain' : 'rs-avatar';
  if (photoUrl) return <img className={`${className} rs-avatar--photo`} src={photoUrl} alt="" loading="lazy" decoding="async" />;
  return <span className={className} aria-hidden="true">{initial}</span>;
}

/** "★ 4.8 · 12 reviews" ดาวเป็นภาพประดับ โปรแกรมอ่านหน้าจออ่านว่า "Rating 4.8 · 12 reviews" */
export function Rating({ rating }: { rating: RatingValue }) {
  const { t } = useI18n();
  if (rating.average === null) return <span className="rating rating--none">{t.rating.none}</span>;
  return <span className="rating"><StarIcon /><span className="sr-only">{t.rating.label} </span>{t.rating.line(rating.average, rating.reviews)}</span>;
}

function Meta({ mentor }: { mentor: ListedMentor }) {
  const { t } = useI18n();
  return <>
    <Proof mentor={mentor} />
    {/* จุดคั่นอยู่ติดกับราคา บรรทัดใหม่จึงขึ้นต้นด้วย "· ราคา" ไม่ทิ้งจุดไว้ท้ายบรรทัด */}
    <p className="rs-row__meta"><Rating rating={mentor.rating} /> <span className="cx-nowrap">· {t.price.line(mentor.price, mentor.minutes, mentor.unit)}</span></p>
  </>;
}

const resultIcon = { winner: Trophy, finalist: Award, participant: UserCheck } as const;

/** ป้ายผลงานในเวทีนี้ ("ได้รางวัล · 2567") กับจำนวนครั้งที่ปรึกษาสำเร็จ แสดงเฉพาะในหน้าเวที (ข้อมูลมาเฉพาะ endpoint นั้น) */
function Proof({ mentor }: { mentor: ListedMentor }) {
  const { t } = useI18n();
  const s = t.risingStar;
  const experience = mentor.experience;
  if (!experience && !mentor.consultations) return null;
  const Icon = experience ? resultIcon[experience.result] : null;
  return <p className="rs-row__proof">
    {experience && Icon && <span className={`rs-proof rs-proof--${experience.result}`}>
      <Icon aria-hidden="true" size={14} />{s.proof(t.taxonomy.results[experience.result], experience.year)}
    </span>}
    {Boolean(mentor.consultations) && <span className="rs-proof rs-proof--count">
      <MessageCircle aria-hidden="true" size={14} />{s.consultations(mentor.consultations!)}
    </span>}
  </p>;
}

/** ปุ่มดูโปรไฟล์ พกบริบทเวทีไปด้วยเมื่อมี เพื่อให้หน้าโปรไฟล์เลือกเวทีตอนกดติดต่อให้ */
function ProfileLink({ mentor, competition, hire }: { mentor: ListedMentor; competition?: string; hire?: boolean }) {
  const { t } = useI18n();
  const s = t.risingStar;
  const to = `/mentors/${mentor.id}${competition ? `?competition=${encodeURIComponent(competition)}` : ''}`;
  return <Link className="ghost-button rs-row__action" to={to} aria-label={hire ? s.hireAria(mentor.name) : s.viewProfileOf(mentor.name)}>
    <span className="rs-row__action-label">{hire ? s.hire : s.viewProfile}</span><ChevronRight className="rs-row__action-icon" aria-hidden="true" />
  </Link>;
}

export function RankedRow({ mentor, competition, hire }: { mentor: RankedMentor; competition?: string; hire?: boolean }) {
  const { t } = useI18n();
  const s = t.risingStar;
  return <li className="rs-row">
    <span className="rs-row__rank"><span aria-hidden="true">{mentor.rank}</span><span className="sr-only">{s.rank(mentor.rank)}</span></span>
    <Avatar initial={mentor.initial} photoUrl={mentor.photoUrl} />
    <div>
      <p className="rs-row__name">{mentor.name}<RisingStarPill /></p>
      <p className="rs-row__spec">{mentor.specialty}</p>
      <Meta mentor={mentor} />
    </div>
    <ProfileLink mentor={mentor} competition={competition} hire={hire} />
  </li>;
}

export function OtherRow({ mentor, competition, hire }: { mentor: ListedMentor; competition?: string; hire?: boolean }) {
  return <li className="rs-row">
    <Avatar initial={mentor.initial} plain photoUrl={mentor.photoUrl} />
    <div>
      <p className="rs-row__name">{mentor.name}</p>
      <p className="rs-row__spec">{mentor.specialty}</p>
      <Meta mentor={mentor} />
    </div>
    <ProfileLink mentor={mentor} competition={competition} hire={hire} />
  </li>;
}

/* การ์ดเมนเทอร์แบบรูปใหญ่ในหน้าเวที เรียงเป็นตาราง 3 ใบต่อแถว (ผู้ใช้ขอ 6 ต.ค. 2569)
   ทั้งใบเป็นลิงก์ไปโปรไฟล์ พกเวทีไปด้วย รูปไม่มีให้ใช้ตัวอักษรแรกเต็มกรอบแทน
   โครงเดียวกันทุกใบ (ผู้ใช้ขอ 7 ต.ค. 2569 การ์ดอัดกัน ไม่สมมาตร): ชื่อบรรทัดเดียว ความถนัดจองสองบรรทัด
   ผลงานย่อเหลือ "ได้รางวัล · 2567" บรรทัดเดียว (อยู่ในหน้าเวทีอยู่แล้ว) คะแนนกับราคาชิดล่างทุกใบ
   Rising Star มีดาวมุมขวาบนของรูป ไม่มีเลขอันดับและป้าย */
export function MentorTile({ mentor, star, competition, hire }: {
  mentor: ListedMentor; star?: boolean; competition: string; hire?: boolean;
}) {
  const { t } = useI18n();
  const s = t.risingStar;
  const to = `/mentors/${mentor.id}?competition=${encodeURIComponent(competition)}`;
  const experience = mentor.experience;
  const Icon = experience ? resultIcon[experience.result] : null;
  const label = hire ? s.hireAria(mentor.name) : s.viewProfileOf(mentor.name);
  return <li className={star ? 'mentor-tile mentor-tile--star' : 'mentor-tile'}>
    <Link className="mentor-tile__link" to={to} aria-label={star ? `${label} · ${s.pill}` : label}>
      <span className="mentor-tile__photo">
        {mentor.photoUrl
          ? <img src={mentor.photoUrl} alt="" loading="lazy" decoding="async" />
          : <span className="mentor-tile__initial" aria-hidden="true">{mentor.initial}</span>}
        {star && <span className="mentor-tile__star" title={s.pill}><StarIcon /></span>}
      </span>
      <span className="mentor-tile__body">
        <span className="mentor-tile__name">{mentor.name}</span>
        <span className="mentor-tile__spec">{mentor.specialty}</span>
        {(experience || Boolean(mentor.consultations)) && <span className="mentor-tile__facts">
          {experience && Icon && <span className={`mentor-tile__result mentor-tile__result--${experience.result}`}
            title={s.proof(t.taxonomy.results[experience.result], experience.year)}>
            <Icon aria-hidden="true" size={12} />{t.taxonomy.results[experience.result]} · {experience.year}
          </span>}
          {Boolean(mentor.consultations) && <span className="mentor-tile__count">{s.consultations(mentor.consultations!)}</span>}
        </span>}
        <span className="mentor-tile__meta"><Rating rating={mentor.rating} /><span>{t.price.line(mentor.price, mentor.minutes, mentor.unit)}</span></span>
      </span>
    </Link>
  </li>;
}
