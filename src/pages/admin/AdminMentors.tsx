import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Eye, EyeOff } from 'lucide-react';
import { findCompetition, formatDate } from '../../data/competitions';
import {
  findMentorSubmission, isOverdue, mentorChecks, mentorSubmissions, statusLabels, waitingDays,
} from '../../data/submissions';
import type { SubmissionStatus } from '../../data/submissions';
import { ReviewDecision } from './ReviewDecision';
import { StatusPill } from './AdminCompetitions';

const statusFilters: { id: SubmissionStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'pending', label: statusLabels.pending },
  { id: 'info', label: statusLabels.info },
  { id: 'published', label: statusLabels.published },
  { id: 'rejected', label: statusLabels.rejected },
];

const baht = new Intl.NumberFormat('th-TH');

export function AdminMentorQueue() {
  const [status, setStatus] = useState<SubmissionStatus | 'all'>('all');
  const rows = mentorSubmissions
    .filter((item) => status === 'all' || item.status === status)
    .slice().sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  return <>
    <header className="admin-page-head">
      <h1>คิวใบสมัครเมนเทอร์</h1>
      <p className="admin-muted">เรียงตามรอนานสุดก่อน ใบเหล่านี้มีข้อมูลส่วนบุคคลและไฟล์หลักฐาน</p>
    </header>

    <div className="queue-filters" role="group" aria-label="กรองตามสถานะ">
      {statusFilters.map((filter) => <button
        key={filter.id} type="button"
        className={status === filter.id ? 'tab-button active' : 'tab-button'}
        aria-pressed={status === filter.id}
        onClick={() => setStatus(filter.id)}
      >{filter.label}</button>)}
    </div>

    <p className="admin-muted queue-count" role="status">{rows.length} ใบ</p>

    {rows.length > 0 ? <ul className="queue-list">
      {rows.map((item) => <li className="queue-row" key={item.id}>
        <div className="queue-main">
          <StatusPill status={item.status} />
          <h2><Link to={`/admin/mentors/${item.id}`}>{item.firstName} {item.lastName.slice(0, 1)}. ({item.nickname})</Link></h2>
          <p className="admin-muted">{item.role} · {item.organization}</p>
        </div>
        <dl className="queue-facts">
          <div><dt>ส่งเมื่อ</dt><dd>{formatDate(item.submittedAt)}</dd></div>
          <div><dt>รอมาแล้ว</dt><dd className={isOverdue(item) ? 'is-overdue' : undefined}>{waitingDays(item)} วัน</dd></div>
          <div><dt>รางวัลที่อ้าง</dt><dd>{item.awards.length} รายการ</dd></div>
        </dl>
      </li>)}
    </ul> : <p className="admin-empty">ไม่มีใบในสถานะนี้</p>}
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="admin-field"><dt>{label}</dt><dd>{children || '—'}</dd></div>;
}

export function AdminMentorReview() {
  const { id } = useParams();
  const submission = findMentorSubmission(id);

  if (!submission) return <>
    <h1>ไม่พบใบนี้</h1>
    <p className="admin-muted">ลิงก์อาจไม่ถูกต้อง</p>
    <p><Link className="ghost-button" to="/admin/mentors"><ArrowLeft size={16} aria-hidden="true" />กลับไปคิวเมนเทอร์</Link></p>
  </>;

  const publicName = `${submission.firstName} ${submission.lastName.slice(0, 1)}.`;

  return <>
    <p className="admin-back"><Link to="/admin/mentors"><ArrowLeft size={16} aria-hidden="true" />กลับไปคิวเมนเทอร์</Link></p>

    <header className="admin-page-head">
      <div className="admin-title-row">
        <h1>{publicName} ({submission.nickname})</h1>
        <StatusPill status={submission.status} />
      </div>
      <p className="admin-muted">
        ใบ {submission.id} · ส่งเมื่อ {formatDate(submission.submittedAt)} · รอมาแล้ว {waitingDays(submission)} วัน
      </p>
    </header>

    {submission.reviewNote && <div className="admin-trail">
      <h2>ผลการตรวจครั้งก่อน</h2>
      <p className="admin-muted">{submission.reviewedBy} · {submission.reviewedAt && formatDate(submission.reviewedAt)}</p>
      <p>{submission.reviewNote}</p>
    </div>}

    <div className="review-grid">
      <div className="review-body">
        {/* ฟอร์มสมัครสัญญากับผู้สมัครไว้ว่าอะไรจะขึ้นสาธารณะ หน้านี้ต้องทำตามสัญญานั้น */}
        <section className="admin-block is-public" aria-labelledby="public-title">
          <h2 id="public-title"><Eye size={16} aria-hidden="true" />ข้อมูลที่จะขึ้นหน้าเว็บ</h2>
          <dl className="admin-fields">
            <Field label="ชื่อที่แสดง">{publicName} ({submission.nickname})</Field>
            <Field label="อาชีพและสังกัด">{submission.occupation} · {submission.organization} · {submission.role}</Field>
            <Field label="ประสบการณ์">{submission.experience}</Field>
            <Field label="ช่วยได้">{submission.best}</Field>
            <Field label="ช่วยไม่ได้">{submission.cannot}</Field>
            <Field label="ความถนัด">{submission.topics.join(' · ')}</Field>
            <Field label="ราคา">{baht.format(submission.price)} บาทต่อทีม ต่อการปรึกษา 60 นาที</Field>
            <Field label="คิวปรึกษา">{formatDate(submission.paidSlot)}</Field>
            <Field label="คุยฟรี 20 นาที">{formatDate(submission.freeSlot)}</Field>
            <Field label="ผลงาน">
              {submission.portfolio
                ? <a href={submission.portfolio} target="_blank" rel="noreferrer noopener">
                  {submission.portfolio}<ArrowUpRight size={14} aria-hidden="true" />
                </a>
                : ''}
            </Field>
          </dl>
        </section>

        <section className="admin-block is-private" aria-labelledby="private-title">
          <h2 id="private-title"><EyeOff size={16} aria-hidden="true" />ใช้ตรวจสอบเท่านั้น ไม่ขึ้นหน้าเว็บ</h2>
          <p className="admin-private">ฟอร์มสมัครแจ้งผู้สมัครไว้แล้วว่าข้อมูลกลุ่มนี้ใช้ยืนยันตัวตนอย่างเดียว</p>
          <dl className="admin-fields">
            <Field label="ชื่อ-นามสกุลเต็ม">{submission.firstName} {submission.lastName}</Field>
            <Field label="อีเมล">{submission.email}</Field>
            <Field label="เบอร์โทร">{submission.phone}</Field>
          </dl>
        </section>

        <section className="admin-block" aria-labelledby="awards-title">
          <h2 id="awards-title">หลักฐานรางวัล</h2>
          <p className="admin-muted">
            ป้าย “ยืนยันแล้ว” ออกได้เมื่อตรวจหลักฐานจริงเท่านั้น การอนุมัติคือการตั้งเวทีที่ชนะ ซึ่งเป็นตัวกำหนดลำดับการจับคู่
          </p>
          {submission.awards.length > 0 ? <ul className="award-list">
            {submission.awards.map((award) => {
              const matched = award.competitionSlug ? findCompetition(award.competitionSlug) : undefined;
              return <li key={award.title}>
                <h3>{award.title}</h3>
                <dl className="admin-fields">
                  <Field label="ปี">{award.year}</Field>
                  <Field label="เวทีในระบบ">
                    {matched
                      ? <Link to={`/competitions/${matched.slug}`}>{matched.name}</Link>
                      : <span className="award-unmatched">ไม่พบเวทีนี้ในระบบ ต้องตรวจด้วยมือ</span>}
                  </Field>
                  <Field label="หลักฐานที่แนบ">{award.evidence}</Field>
                </dl>
              </li>;
            })}
          </ul> : <p className="admin-empty">ไม่ได้อ้างรางวัลใด ให้ป้ายยืนยันไม่ได้</p>}
        </section>
      </div>

      <ReviewDecision checks={mentorChecks} noun="ใบสมัคร" />
    </div>
  </>;
}
