import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Calendar, Paperclip, Trophy } from 'lucide-react';
import {
  categoryLabel, daysLeft, feeLabel, formatDate, formatDeadline, levelLabels, placeLabel,
  prizeLabel, regionLabels, rewardLabels, teamLabel, typeLabels,
} from '../../data/competitions';
import type { CategoryId, Competition, Level, OpportunityType, Region, Reward } from '../../data/competitions';
import { CoverArt } from '../../components/CoverArt';
import { useApi } from '../../lib/useApi';
import { ReviewDecision } from './ReviewDecision';

export type SubmissionStatus = 'pending' | 'info' | 'published' | 'rejected';
export const statusLabels: Record<SubmissionStatus, string> = {
  pending: 'รอตรวจ', info: 'ขอข้อมูลเพิ่ม', published: 'เผยแพร่แล้ว', rejected: 'ไม่ผ่าน',
};

export type ReviewEvent = {
  id: string; decision: 'publish' | 'info' | 'reject'; note: string; createdAt: string;
};

type Submission = {
  id: string;
  status: SubmissionStatus;
  submittedAt: string;
  organizerName: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  contactPhone: string;
  organizerUrl: string;
  name: string;
  description: string;
  type: OpportunityType;
  categories: CategoryId[];
  levels: Level[];
  rewards: Reward[];
  teamMin: number;
  teamMax: number;
  opensAt: string | null;
  closesAt: string;
  eventDate: string | null;
  region: Region;
  venue: string | null;
  prizeValue: number;
  prizeNote: string | null;
  fee: number | null;
  sourceUrl: string;
  registerUrl: string | null;
  publishedCompetitionId: string | null;
  files: AttachedFile[];
  events: ReviewEvent[];
};

/** จำนวนวันที่ใบนี้รออยู่ นับจากเวลาที่ส่ง */
export function waitingDays(submittedAt: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86400000));
}
export const REVIEW_TARGET_DAYS = 2;

export function StatusPill({ status }: { status: SubmissionStatus }) {
  return <span className={`status-pill is-${status}`}>{statusLabels[status]}</span>;
}

export const statusFilters: { id: SubmissionStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'pending', label: statusLabels.pending },
  { id: 'info', label: statusLabels.info },
  { id: 'published', label: statusLabels.published },
  { id: 'rejected', label: statusLabels.rejected },
];

export function QueueFilters({ status, onChange }: {
  status: SubmissionStatus | 'all';
  onChange: (value: SubmissionStatus | 'all') => void;
}) {
  return <div className="queue-filters" role="group" aria-label="กรองตามสถานะ">
    {statusFilters.map((filter) => <button
      key={filter.id} type="button"
      className={status === filter.id ? 'tab-button active' : 'tab-button'}
      aria-pressed={status === filter.id}
      onClick={() => onChange(filter.id)}
    >{filter.label}</button>)}
  </div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="admin-field"><dt>{label}</dt><dd>{children || '—'}</dd></div>;
}

export function ExternalLink({ href }: { href: string | null }) {
  if (!href) return null;
  return <a href={href} target="_blank" rel="noreferrer noopener">
    {href}<ArrowUpRight size={14} aria-hidden="true" />
  </a>;
}

export function Trail({ events }: { events: ReviewEvent[] }) {
  if (!events.length) return null;
  const [latest] = events;
  return <div className="admin-trail">
    <h2>ผลการตรวจครั้งก่อน</h2>
    <p className="admin-muted">{statusLabels[({ publish: 'published', info: 'info', reject: 'rejected' } as const)[latest.decision]]} · {formatDate(latest.createdAt.slice(0, 10))}</p>
    {latest.note && <p>{latest.note}</p>}
  </div>;
}

export type AttachedFile = { id: string; url: string; originalName: string; mime: string; size: number };

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** ไฟล์ที่ผู้ส่งแนบมา เปิดในแท็บใหม่ได้ ของที่เก็บในเครื่องต้องผ่าน API ที่ตรวจสิทธิ์ก่อน */
export function AttachedFiles({ files }: { files: AttachedFile[] }) {
  return <section className="admin-block" aria-labelledby="files-title">
    <h2 id="files-title">ไฟล์ที่แนบมา</h2>
    {files.length ? <ul className="file-list">
      {files.map((file) => <li key={file.id}>
        <a href={file.url} target="_blank" rel="noreferrer noopener">
          <Paperclip size={15} aria-hidden="true" />{file.originalName}
        </a>
        <span className="admin-muted">{file.mime} · {kb(file.size)}</span>
      </li>)}
    </ul> : <p className="admin-empty">ไม่ได้แนบไฟล์มา</p>}
  </section>;
}

type QueueRow = Submission & { categories: CategoryId[] };

export function AdminCompetitionQueue() {
  const [status, setStatus] = useState<SubmissionStatus | 'all'>('all');
  const { data, error, loading } = useApi<{ items: QueueRow[] }>(
    `/admin/competition-submissions${status === 'all' ? '' : `?status=${status}`}`,
  );
  const rows = data?.items ?? [];

  return <>
    <header className="admin-page-head">
      <h1>คิวงานแข่ง</h1>
      <p className="admin-muted">เรียงตามรอนานสุดก่อน เป้าหมายคือตรวจภายใน {REVIEW_TARGET_DAYS} วันทำการ</p>
    </header>

    <QueueFilters status={status} onChange={setStatus} />
    <p className="admin-muted queue-count" role="status">{loading ? 'กำลังโหลด…' : `${rows.length} ใบ`}</p>
    {error && <p className="admin-message" role="alert">{error}</p>}

    {!loading && (rows.length > 0 ? <ul className="queue-list">
      {rows.map((item) => <li className="queue-row" key={item.id}>
        <div className="queue-main">
          <StatusPill status={item.status} />
          <h2><Link to={`/admin/competitions/${item.id}`}>{item.name}</Link></h2>
          <p className="admin-muted">{item.organizerName} · {item.categories.map(categoryLabel).join(' · ')}</p>
        </div>
        <dl className="queue-facts">
          <div><dt>ส่งเมื่อ</dt><dd>{formatDate(item.submittedAt.slice(0, 10))}</dd></div>
          <div>
            <dt>รอมาแล้ว</dt>
            <dd className={item.status === 'pending' && waitingDays(item.submittedAt) > REVIEW_TARGET_DAYS ? 'is-overdue' : undefined}>
              {waitingDays(item.submittedAt)} วัน
            </dd>
          </div>
          <div><dt>ปิดรับ</dt><dd>{formatDate(item.closesAt)}</dd></div>
        </dl>
      </li>)}
    </ul> : <p className="admin-empty">ไม่มีใบในสถานะนี้</p>)}
  </>;
}

/** พรีวิวใช้โครงเดียวกับการ์ดหน้าบ้าน เพื่อให้คนตรวจเห็นสิ่งเดียวกับที่ผู้ใช้จะเห็น */
function toPreview(submission: Submission): Competition {
  return {
    slug: submission.id,
    name: submission.name,
    categories: submission.categories as [CategoryId, ...CategoryId[]],
    type: submission.type,
    org: submission.organizerName,
    closesAt: submission.closesAt,
    opensAt: submission.opensAt ?? undefined,
    eventDate: submission.eventDate ?? undefined,
    region: submission.region,
    venue: submission.venue ?? undefined,
    prizeValue: submission.prizeValue,
    prizeNote: submission.prizeNote ?? undefined,
    rewards: submission.rewards,
    fee: submission.fee ?? undefined,
    levels: submission.levels,
    teamMin: submission.teamMin,
    teamMax: submission.teamMax,
    description: submission.description,
    keywords: [],
    sourceUrl: submission.sourceUrl,
    source: 'organiser',
    lastVerifiedAt: submission.submittedAt.slice(0, 10),
    registerUrl: submission.registerUrl ?? undefined,
  };
}

function CardPreview({ preview, seed }: { preview: Competition; seed: string }) {
  const [first, ...rest] = preview.categories;
  return <article className="competition-card preview-card">
    <div className="card-cover"><CoverArt category={first} seed={`preview-${seed}`} /></div>
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
  const { data, error, loading, reload } = useApi<{ submission: Submission; checks: string[] }>(
    `/admin/competition-submissions/${id}`,
  );

  // โหลดซ้ำหลังตัดสินต้องไม่ถอดหน้าทิ้ง ไม่อย่างนั้นข้อความยืนยันผลจะหายไปทันที
  if (loading && !data) return <p className="admin-muted">กำลังโหลด…</p>;
  if (error || !data) return <>
    <h1>เปิดใบนี้ไม่ได้</h1>
    <p className="admin-message" role="alert">{error || 'ไม่พบใบนี้'}</p>
    <p><Link className="ghost-button" to="/admin/competitions"><ArrowLeft size={16} aria-hidden="true" />กลับไปคิวงานแข่ง</Link></p>
  </>;

  const { submission, checks } = data;
  const preview = toPreview(submission);
  const left = daysLeft(preview);

  return <>
    <p className="admin-back"><Link to="/admin/competitions"><ArrowLeft size={16} aria-hidden="true" />กลับไปคิวงานแข่ง</Link></p>

    <header className="admin-page-head">
      <div className="admin-title-row">
        <h1>{submission.name}</h1>
        <StatusPill status={submission.status} />
      </div>
      <p className="admin-muted">
        ใบ {submission.id} · ส่งเมื่อ {formatDate(submission.submittedAt.slice(0, 10))} · รอมาแล้ว {waitingDays(submission.submittedAt)} วัน
      </p>
    </header>

    <Trail events={submission.events} />

    <div className="review-grid">
      <div className="review-body">
        <section className="admin-block" aria-labelledby="preview-title">
          <h2 id="preview-title">การ์ดที่จะขึ้นหน้าเว็บ</h2>
          <p className="admin-muted">ตรวจจากสิ่งที่ผู้ใช้จะเห็นจริง ไม่ใช่จากค่าในฟอร์มอย่างเดียว</p>
          <CardPreview preview={preview} seed={submission.id} />
        </section>

        <section className="admin-block" aria-labelledby="organiser-title">
          <h2 id="organiser-title">ผู้จัดงาน</h2>
          <p className="admin-private">ข้อมูลติดต่อใช้ตรวจสอบเท่านั้น ไม่แสดงบนหน้าเว็บ</p>
          <dl className="admin-fields">
            <Field label="หน่วยงาน">{submission.organizerName}</Field>
            <Field label="ผู้ติดต่อ">{submission.contactName} · {submission.contactRole}</Field>
            <Field label="อีเมล">{submission.contactEmail}</Field>
            <Field label="เบอร์โทร">{submission.contactPhone}</Field>
            <Field label="เว็บหรือเพจทางการ"><ExternalLink href={submission.organizerUrl} /></Field>
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
            <Field label="ลิงก์ประกาศต้นทาง"><ExternalLink href={submission.sourceUrl} /></Field>
            <Field label="ลิงก์สมัคร"><ExternalLink href={submission.registerUrl} /></Field>
          </dl>
        </section>
        <AttachedFiles files={submission.files} />
      </div>

      <ReviewDecision
        checks={checks} noun="งาน" onDone={reload}
        endpoint={`/admin/competition-submissions/${submission.id}`}
      />
    </div>
  </>;
}
