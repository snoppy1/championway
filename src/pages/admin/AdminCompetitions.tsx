import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Calendar, Trophy } from 'lucide-react';
import {
  categoryLabel, daysLeft, feeLabel, formatDate, formatDeadline, levelLabels, placeLabel,
  prizeLabel, regionLabels, rewardLabels, teamLabel, typeLabels,
} from '../../data/competitions';
import {
  competitionChecks, competitionSubmissions, findCompetitionSubmission, isOverdue,
  statusLabels, toCompetition, waitingDays,
} from '../../data/submissions';
import type { CompetitionSubmission, SubmissionStatus } from '../../data/submissions';
import { CoverArt } from '../../components/CoverArt';
import { ReviewDecision } from './ReviewDecision';

export function StatusPill({ status }: { status: SubmissionStatus }) {
  return <span className={`status-pill is-${status}`}>{statusLabels[status]}</span>;
}

const statusFilters: { id: SubmissionStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'pending', label: statusLabels.pending },
  { id: 'info', label: statusLabels.info },
  { id: 'published', label: statusLabels.published },
  { id: 'rejected', label: statusLabels.rejected },
];

export function AdminCompetitionQueue() {
  const [status, setStatus] = useState<SubmissionStatus | 'all'>('all');
  // รอนานสุดก่อน ไม่ใช่ใหม่สุดก่อน ไม่อย่างนั้นใบที่ตรวจยากจะถูกดองไปเรื่อย ๆ
  const rows = competitionSubmissions
    .filter((item) => status === 'all' || item.status === status)
    .slice().sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  return <>
    <header className="admin-page-head">
      <h1>คิวงานแข่ง</h1>
      <p className="admin-muted">เรียงตามรอนานสุดก่อน เป้าหมายคือตรวจภายใน 2 วันทำการ</p>
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
          <h2><Link to={`/admin/competitions/${item.id}`}>{item.name}</Link></h2>
          <p className="admin-muted">{item.organizerName} · {item.categories.map(categoryLabel).join(' · ')}</p>
        </div>
        <dl className="queue-facts">
          <div><dt>ส่งเมื่อ</dt><dd>{formatDate(item.submittedAt)}</dd></div>
          <div><dt>รอมาแล้ว</dt><dd className={isOverdue(item) ? 'is-overdue' : undefined}>{waitingDays(item)} วัน</dd></div>
          <div><dt>ปิดรับ</dt><dd>{formatDate(item.closesAt)}</dd></div>
        </dl>
      </li>)}
    </ul> : <p className="admin-empty">ไม่มีใบในสถานะนี้</p>}
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="admin-field"><dt>{label}</dt><dd>{children || '—'}</dd></div>;
}

/** พรีวิวใช้โครงเดียวกับการ์ดหน้าบ้าน เพื่อให้คนตรวจเห็นสิ่งเดียวกับที่ผู้ใช้จะเห็น */
function CardPreview({ submission }: { submission: CompetitionSubmission }) {
  const preview = toCompetition(submission);
  const [first, ...rest] = preview.categories;
  return <article className="competition-card preview-card">
    <div className="card-cover"><CoverArt category={first} seed={`preview-${submission.id}`} /></div>
    <div className="card-body">
      <div className="card-meta">
        <span className="category-pill">{categoryLabel(first)}</span>
        {rest.length > 0 && <span className="category-pill is-more" aria-label={`อีก ${rest.length} หมวด: ${rest.map(categoryLabel).join(' ')}`}>+{rest.length}</span>}
        <span className="card-org">{preview.org}</span>
      </div>
      <h3>{preview.name}</h3>
      <p className="card-summary">{preview.description}</p>
      <div className="card-facts">
        <span><Calendar size={15} aria-hidden="true" />ปิดรับ {formatDeadline(preview)}</span>
        <span><Trophy size={15} aria-hidden="true" />{prizeLabel(preview)}</span>
      </div>
    </div>
  </article>;
}

export function AdminCompetitionReview() {
  const { id } = useParams();
  const submission = findCompetitionSubmission(id);

  if (!submission) return <>
    <h1>ไม่พบใบนี้</h1>
    <p className="admin-muted">ลิงก์อาจไม่ถูกต้อง</p>
    <p><Link className="ghost-button" to="/admin/competitions"><ArrowLeft size={16} aria-hidden="true" />กลับไปคิวงานแข่ง</Link></p>
  </>;

  const preview = toCompetition(submission);
  const left = daysLeft(preview);

  return <>
    <p className="admin-back"><Link to="/admin/competitions"><ArrowLeft size={16} aria-hidden="true" />กลับไปคิวงานแข่ง</Link></p>

    <header className="admin-page-head">
      <div className="admin-title-row">
        <h1>{submission.name}</h1>
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
        <section className="admin-block" aria-labelledby="preview-title">
          <h2 id="preview-title">การ์ดที่จะขึ้นหน้าเว็บ</h2>
          <p className="admin-muted">ตรวจจากสิ่งที่ผู้ใช้จะเห็นจริง ไม่ใช่จากค่าในฟอร์มอย่างเดียว</p>
          <CardPreview submission={submission} />
        </section>

        <section className="admin-block" aria-labelledby="organiser-title">
          <h2 id="organiser-title">ผู้จัดงาน</h2>
          <p className="admin-private">ข้อมูลติดต่อใช้ตรวจสอบเท่านั้น ไม่แสดงบนหน้าเว็บ</p>
          <dl className="admin-fields">
            <Field label="หน่วยงาน">{submission.organizerName}</Field>
            <Field label="ผู้ติดต่อ">{submission.contactName} · {submission.contactRole}</Field>
            <Field label="อีเมล">{submission.contactEmail}</Field>
            <Field label="เบอร์โทร">{submission.contactPhone}</Field>
            <Field label="เว็บหรือเพจทางการ">
              <a href={submission.organizerUrl} target="_blank" rel="noreferrer noopener">
                {submission.organizerUrl}<ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </Field>
          </dl>
        </section>

        <section className="admin-block" aria-labelledby="event-title">
          <h2 id="event-title">รายละเอียดงาน</h2>
          <dl className="admin-fields">
            <Field label="ประเภทโอกาส">{typeLabels[submission.type]}</Field>
            <Field label="หมวด">{submission.categories.map(categoryLabel).join(' · ')}</Field>
            <Field label="ระดับผู้สมัคร">{submission.levels.map((level) => levelLabels[level]).join(' / ')}</Field>
            <Field label="ขนาดทีม">{teamLabel(preview)}</Field>
            <Field label="คำบรรยาย">{submission.description}</Field>
          </dl>
        </section>

        <section className="admin-block" aria-labelledby="when-title">
          <h2 id="when-title">วันเวลา รางวัล และลิงก์</h2>
          <dl className="admin-fields">
            <Field label="เปิดรับ">{submission.opensAt ? formatDate(submission.opensAt) : 'เปิดรับแล้ว'}</Field>
            <Field label="ปิดรับ">{formatDate(submission.closesAt)}{left >= 0 ? ` · อีก ${left} วัน` : ' · เลยกำหนดแล้ว'}</Field>
            <Field label="วันจัดงาน">{submission.eventDate ? formatDate(submission.eventDate) : ''}</Field>
            <Field label="รูปแบบและสถานที่">{submission.venue ? `${submission.venue} · ${regionLabels[submission.region]}` : placeLabel(preview)}</Field>
            <Field label="เงินรางวัล">{prizeLabel(preview)}</Field>
            <Field label="รางวัลอื่น">{submission.rewards.map((reward) => rewardLabels[reward]).join(' · ')}</Field>
            <Field label="ค่าสมัคร">{feeLabel(preview)}</Field>
            <Field label="ลิงก์ประกาศต้นทาง">
              <a href={submission.sourceUrl} target="_blank" rel="noreferrer noopener">
                {submission.sourceUrl}<ArrowUpRight size={14} aria-hidden="true" />
              </a>
            </Field>
            <Field label="ลิงก์สมัคร">
              {submission.registerUrl
                ? <a href={submission.registerUrl} target="_blank" rel="noreferrer noopener">
                  {submission.registerUrl}<ArrowUpRight size={14} aria-hidden="true" />
                </a>
                : ''}
            </Field>
          </dl>
        </section>
      </div>

      <ReviewDecision checks={competitionChecks} noun="งาน" />
    </div>
  </>;
}
