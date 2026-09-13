import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { formatDate } from '../../data/competitions';
import { useApi } from '../../lib/useApi';
import { ReviewDecision } from './ReviewDecision';
import {
  AttachedFiles, ExternalLink, Field, QueueFilters, REVIEW_TARGET_DAYS, StatusPill, Trail, waitingDays,
} from './AdminCompetitions';
import type { AttachedFile, ReviewEvent, SubmissionStatus } from './AdminCompetitions';

type Award = {
  id: string;
  title: string;
  competitionSlug: string | null;
  year: string;
  evidence: string;
  matched: { slug: string; name: string } | null;
};

type MentorSubmission = {
  id: string;
  status: SubmissionStatus;
  submittedAt: string;
  firstName: string;
  lastName: string;
  nickname: string;
  email: string;
  phone: string;
  occupation: string;
  organization: string;
  role: string;
  experience: string;
  portfolio: string;
  best: string;
  cannot: string;
  topics: string[];
  price: number;
  paidSlot: string;
  freeSlot: string;
  awards: Award[];
  files: AttachedFile[];
  events: ReviewEvent[];
};

type QueueRow = MentorSubmission & { awardCount: number };

const baht = new Intl.NumberFormat('th-TH');

export function AdminMentorQueue() {
  const [status, setStatus] = useState<SubmissionStatus | 'all'>('all');
  const { data, error, loading } = useApi<{ items: QueueRow[] }>(
    `/admin/mentor-submissions${status === 'all' ? '' : `?status=${status}`}`,
  );
  const rows = data?.items ?? [];

  return <>
    <header className="admin-page-head">
      <h1>คิวใบสมัครเมนเทอร์</h1>
      <p className="admin-muted">เรียงตามรอนานสุดก่อน ใบเหล่านี้มีข้อมูลส่วนบุคคลและหลักฐาน</p>
    </header>

    <QueueFilters status={status} onChange={setStatus} />
    <p className="admin-muted queue-count" role="status">{loading ? 'กำลังโหลด…' : `${rows.length} ใบ`}</p>
    {error && <p className="admin-message" role="alert">{error}</p>}

    {!loading && (rows.length > 0 ? <ul className="queue-list">
      {rows.map((item) => <li className="queue-row" key={item.id}>
        <div className="queue-main">
          <StatusPill status={item.status} />
          <h2><Link to={`/admin/mentors/${item.id}`}>{item.firstName} {item.lastName.slice(0, 1)}. ({item.nickname})</Link></h2>
          <p className="admin-muted">{item.role} · {item.organization}</p>
        </div>
        <dl className="queue-facts">
          <div><dt>ส่งเมื่อ</dt><dd>{formatDate(item.submittedAt.slice(0, 10))}</dd></div>
          <div>
            <dt>รอมาแล้ว</dt>
            <dd className={item.status === 'pending' && waitingDays(item.submittedAt) > REVIEW_TARGET_DAYS ? 'is-overdue' : undefined}>
              {waitingDays(item.submittedAt)} วัน
            </dd>
          </div>
          <div><dt>รางวัลที่อ้าง</dt><dd>{item.awardCount} รายการ</dd></div>
        </dl>
      </li>)}
    </ul> : <p className="admin-empty">ไม่มีใบในสถานะนี้</p>)}
  </>;
}

export function AdminMentorReview() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi<{ submission: MentorSubmission; checks: string[] }>(
    `/admin/mentor-submissions/${id}`,
  );

  // โหลดซ้ำหลังตัดสินต้องไม่ถอดหน้าทิ้ง ไม่อย่างนั้นข้อความยืนยันผลจะหายไปทันที
  if (loading && !data) return <p className="admin-muted">กำลังโหลด…</p>;
  if (error || !data) return <>
    <h1>เปิดใบนี้ไม่ได้</h1>
    <p className="admin-message" role="alert">{error || 'ไม่พบใบนี้'}</p>
    <p><Link className="ghost-button" to="/admin/mentors"><ArrowLeft size={16} aria-hidden="true" />กลับไปคิวเมนเทอร์</Link></p>
  </>;

  const { submission, checks } = data;
  const publicName = `${submission.firstName} ${submission.lastName.slice(0, 1)}.`;

  return <>
    <p className="admin-back"><Link to="/admin/mentors"><ArrowLeft size={16} aria-hidden="true" />กลับไปคิวเมนเทอร์</Link></p>

    <header className="admin-page-head">
      <div className="admin-title-row">
        <h1>{publicName} ({submission.nickname})</h1>
        <StatusPill status={submission.status} />
      </div>
      <p className="admin-muted">
        ใบ {submission.id} · ส่งเมื่อ {formatDate(submission.submittedAt.slice(0, 10))} · รอมาแล้ว {waitingDays(submission.submittedAt)} วัน
      </p>
    </header>

    <Trail events={submission.events} />

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
            <Field label="คิวปรึกษา">{formatDate(submission.paidSlot.slice(0, 10))}</Field>
            <Field label="คุยฟรี 20 นาที">{formatDate(submission.freeSlot.slice(0, 10))}</Field>
            <Field label="ผลงาน"><ExternalLink href={submission.portfolio || null} /></Field>
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
            ป้าย “ยืนยันแล้ว” ออกให้อัตโนมัติเมื่อมีรางวัลที่ตรงกับเวทีในระบบ รางวัลที่ไม่ตรงต้องตรวจด้วยมือก่อน
          </p>
          {submission.awards.length > 0 ? <ul className="award-list">
            {submission.awards.map((award) => <li key={award.id}>
              <h3>{award.title}</h3>
              <dl className="admin-fields">
                <Field label="ปี">{award.year}</Field>
                <Field label="เวทีในระบบ">
                  {award.matched
                    ? <Link to={`/competitions/${award.matched.slug}`}>{award.matched.name}</Link>
                    : <span className="award-unmatched">ไม่พบเวทีนี้ในระบบ ต้องตรวจด้วยมือ</span>}
                </Field>
                <Field label="หลักฐานที่แนบ">{award.evidence}</Field>
              </dl>
            </li>)}
          </ul> : <p className="admin-empty">ไม่ได้อ้างรางวัลใด ให้ป้ายยืนยันไม่ได้</p>}
        </section>
        <AttachedFiles files={submission.files} />
      </div>

      <ReviewDecision
        checks={checks} noun="ใบสมัคร" onDone={reload}
        endpoint={`/admin/mentor-submissions/${submission.id}`}
      />
    </div>
  </>;
}
