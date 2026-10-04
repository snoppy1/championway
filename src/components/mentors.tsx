import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
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

export function Avatar({ initial, plain = false }: { initial: string; plain?: boolean }) {
  return <span className={plain ? 'rs-avatar rs-avatar--plain' : 'rs-avatar'} aria-hidden="true">{initial}</span>;
}

/** "★ 4.8 · 12 reviews" ดาวเป็นภาพประดับ โปรแกรมอ่านหน้าจออ่านว่า "Rating 4.8 · 12 reviews" */
export function Rating({ rating }: { rating: RatingValue }) {
  const { t } = useI18n();
  if (rating.average === null) return <span className="rating rating--none">{t.rating.none}</span>;
  return <span className="rating"><StarIcon /><span className="sr-only">{t.rating.label} </span>{t.rating.line(rating.average, rating.reviews)}</span>;
}

function Meta({ mentor }: { mentor: ListedMentor }) {
  const { t } = useI18n();
  return <p className="rs-row__meta"><Rating rating={mentor.rating} /> · <span className="cx-nowrap">{t.price.line(mentor.price, mentor.minutes, mentor.unit)}</span></p>;
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
    <Avatar initial={mentor.initial} />
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
    <Avatar initial={mentor.initial} plain />
    <div>
      <p className="rs-row__name">{mentor.name}</p>
      <p className="rs-row__spec">{mentor.specialty}</p>
      <Meta mentor={mentor} />
    </div>
    <ProfileLink mentor={mentor} competition={competition} hire={hire} />
  </li>;
}
