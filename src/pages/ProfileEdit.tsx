import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, Mail, UserRound } from 'lucide-react';
import { useAuth } from '../data/auth';
import type { Account } from '../data/auth';
import { api, post, ApiError } from '../lib/api';
import { occupations, personLevelKeys, personLevels } from '../data/profile';
import type { PersonLevel } from '../data/profile';
import '../journey.css';

/* หน้าแก้ไขโปรไฟล์ของสมาชิกทั่วไป แยกเป็นสามฟอร์มที่บันทึกแยกกัน
   เพราะการเปลี่ยนอีเมลกับรหัสผ่านต้องยืนยันตัวตนซ้ำ ส่วนข้อมูลทั่วไปไม่ต้อง
   ถ้ารวมเป็นฟอร์มเดียวจะต้องถามรหัสผ่านทุกครั้งแม้แค่แก้ชื่อเล่น

   เครื่องมือของเมนเทอร์ (ความถนัด คิว งานที่รับ) ยังอยู่ที่ /profile ตามเดิม
   หน้านี้ว่าด้วยตัวตนและบัญชีเท่านั้น */

const errorText = (failure: unknown, fallback: string) =>
  (failure instanceof ApiError ? failure.message : fallback);

export function ProfileEdit() {
  const { user, loading, applyUser } = useAuth();
  useEffect(() => { document.title = 'แก้ไขโปรไฟล์ — ChampionWays'; }, []);

  if (loading) return <main id="main" className="shell page">กำลังโหลดบัญชี…</main>;
  if (!user) return <Navigate to="/signin?next=/profile/edit" replace />;

  return <main id="main" tabIndex={-1} className="shell page journey-page">
    <p className="detail-breadcrumb">
      <Link to="/profile"><ArrowLeft size={16} aria-hidden="true" />กลับไปโปรไฟล์</Link>
    </p>
    <header className="profile-head">
      <div>
        <p className="eyebrow">แก้ไขโปรไฟล์</p>
        <h1>ข้อมูลของฉัน</h1>
        <p className="muted">ชื่อและรูปที่ใส่ไว้จะแสดงบนหัวเว็บและในแชตของทีม</p>
      </div>
    </header>

    <DetailsForm user={user} applyUser={applyUser} />
    <EmailForm user={user} applyUser={applyUser} />
    <PasswordForm user={user} applyUser={applyUser} />
  </main>;
}

type FormProps = { user: Account; applyUser: (account: Account) => void };

function DetailsForm({ user, applyUser }: FormProps) {
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio ?? '');
  const [occupation, setOccupation] = useState(user.occupation ?? '');
  const [organization, setOrganization] = useState(user.organization ?? '');
  const [position, setPosition] = useState(user.position ?? '');
  const [level, setLevel] = useState(user.educationLevel === 'open' ? '' : user.educationLevel ?? '');
  const [picture, setPicture] = useState<File>();
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!picture) { setPreview(''); return; }
    const url = URL.createObjectURL(picture);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [picture]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setDone('');
    setBusy(true);
    try {
      /* อัปโหลดรูปก่อน แล้วค่อยส่ง id ไปกับโปรไฟล์ ใช้ POST /api/files ตัวเดียวกับใบสมัคร
         ไม่ส่ง avatarFileId เลยเมื่อไม่ได้เลือกรูปใหม่ เพื่อไม่ให้รูปเดิมหาย */
      let avatar: { avatarFileId?: string } = {};
      if (picture) {
        const form = new FormData();
        form.append('file', picture);
        const uploaded = await fetch('/api/files', { method: 'POST', body: form, credentials: 'same-origin' });
        const payload = await uploaded.json().catch(() => ({})) as { file?: { id: string }; error?: string };
        if (!uploaded.ok || !payload.file) {
          throw new ApiError(uploaded.status, payload.error ?? 'อัปโหลดรูปไม่สำเร็จ');
        }
        avatar = { avatarFileId: payload.file.id };
      }

      const { user: updated } = await api<{ user: Account }>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name, bio, organization, position,
          occupation: occupation || null,
          educationLevel: level || null,
          ...avatar,
        }),
      });
      applyUser(updated);
      setPicture(undefined);
      if (fileInput.current) fileInput.current.value = '';
      setDone('บันทึกแล้ว');
    } catch (failure) {
      setMessage(errorText(failure, 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง'));
    } finally {
      setBusy(false);
    }
  }

  async function removePicture() {
    setMessage('');
    setDone('');
    setBusy(true);
    try {
      const { user: updated } = await api<{ user: Account }>('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name, bio, organization, position,
          occupation: occupation || null,
          educationLevel: level || null,
          avatarFileId: null,
        }),
      });
      applyUser(updated);
      setDone('เอารูปออกแล้ว');
    } catch (failure) {
      setMessage(errorText(failure, 'เอารูปออกไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel profile-block">
    <h2><UserRound size={18} aria-hidden="true" />ตัวตนและการเรียน</h2>
    <form className="settings-form" onSubmit={save} noValidate>
      <div className="avatar-row">
        {preview || user.avatarUrl
          ? <img className="profile-avatar" src={preview || user.avatarUrl!} alt="" width={58} height={58} />
          : <span className="profile-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>}
        <div>
          <label htmlFor="profile-picture">รูปโปรไฟล์</label>
          <input
            id="profile-picture" ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setPicture(event.target.files?.[0])}
          />
          <small className="muted">JPG, PNG หรือ WebP ไม่เกิน 5 MB · ถ้าไม่ใส่จะใช้ตัวอักษรแรกของชื่อ</small>
          {user.avatarUrl && <p>
            <button type="button" className="link-button" disabled={busy} onClick={removePicture}>เอารูปออก</button>
          </p>}
        </div>
      </div>

      <label>ชื่อที่แสดง *
        <input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      </label>

      <label>แนะนำตัวสั้น ๆ
        <textarea
          rows={3} maxLength={300} value={bio} onChange={(event) => setBio(event.target.value)}
          placeholder="เช่น สนใจเวทีนวัตกรรมและกำลังหาทีมทำ Hackathon"
        />
        <small className="muted">{bio.length} / 300</small>
      </label>

      {/* select ต้องใช้ label แยกกับ htmlFor ถ้าครอบไว้ ชื่อที่โปรแกรมอ่านหน้าจอได้
          จะกลายเป็นข้อความของตัวเลือกทุกอันต่อท้ายชื่อช่อง */}
      <div className="settings-pair">
        <span className="settings-field">
          <label htmlFor="profile-occupation">สถานะ</label>
          <select id="profile-occupation" value={occupation} onChange={(event) => setOccupation(event.target.value)}>
            <option value="">ยังไม่ระบุ</option>
            {occupations.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </span>
        <span className="settings-field">
          <label htmlFor="profile-level">ระดับการศึกษา</label>
          <select id="profile-level" value={level} onChange={(event) => setLevel(event.target.value as PersonLevel | '')}>
            <option value="">ยังไม่ระบุ</option>
            {personLevelKeys.map((item) => <option key={item} value={item}>{personLevels[item]}</option>)}
          </select>
        </span>
      </div>

      <div className="settings-pair">
        <label>โรงเรียน มหาวิทยาลัย หรือที่ทำงาน
          <input maxLength={100} value={organization} onChange={(event) => setOrganization(event.target.value)} />
        </label>
        <label>ชั้นปีหรือตำแหน่ง
          <input
            maxLength={100} value={position} onChange={(event) => setPosition(event.target.value)}
            placeholder="เช่น มัธยมศึกษาปีที่ 5"
          />
        </label>
      </div>

      {message && <p className="auth-message" role="alert">{message}</p>}
      <p className="settings-actions">
        <button className="primary-button" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}</button>
        <span className="settings-done" role="status">{done}</span>
      </p>
    </form>
  </section>;
}

function EmailForm({ user, applyUser }: FormProps) {
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setDone('');
    setBusy(true);
    try {
      const { user: updated } = await post<{ user: Account }>('/auth/email', { email, password });
      applyUser(updated);
      setPassword('');
      setDone('เปลี่ยนอีเมลแล้ว');
    } catch (failure) {
      setMessage(errorText(failure, 'เปลี่ยนอีเมลไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel profile-block">
    <h2><Mail size={18} aria-hidden="true" />อีเมล</h2>
    {/* บัญชีที่ผูก Google ใช้อีเมลของ Google เป็นตัวยืนยันตัวตน เปลี่ยนที่นี่แล้วจะไม่ตรงกัน */}
    {user.googleLinked ? <p className="muted">
      บัญชีนี้เข้าสู่ระบบด้วย Google อีเมลจึงตามบัญชี Google เสมอ
      ถ้าต้องการเปลี่ยน ให้เปลี่ยนที่บัญชี Google ของคุณ
    </p> : <form className="settings-form" onSubmit={save} noValidate>
      <label>อีเมลใหม่ *
        <input type="email" required maxLength={200} value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label>รหัสผ่านปัจจุบัน *
        <input
          type="password" required maxLength={200} autoComplete="current-password"
          value={password} onChange={(event) => setPassword(event.target.value)}
        />
        <small className="muted">ถามเพื่อยืนยันว่าเป็นเจ้าของบัญชีจริง ก่อนเปลี่ยนที่อยู่ที่ใช้เข้าระบบ</small>
      </label>
      {message && <p className="auth-message" role="alert">{message}</p>}
      <p className="settings-actions">
        <button className="primary-button" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'เปลี่ยนอีเมล'}</button>
        <span className="settings-done" role="status">{done}</span>
      </p>
    </form>}
  </section>;
}

function PasswordForm({ user, applyUser }: FormProps) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setDone('');
    setBusy(true);
    try {
      const { user: updated } = await post<{ user: Account }>('/auth/password', { current, next });
      applyUser(updated);
      setCurrent('');
      setNext('');
      setDone('เปลี่ยนรหัสผ่านแล้ว อุปกรณ์อื่นถูกออกจากระบบ');
    } catch (failure) {
      setMessage(errorText(failure, 'เปลี่ยนรหัสผ่านไม่สำเร็จ'));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel profile-block">
    <h2><KeyRound size={18} aria-hidden="true" />รหัสผ่าน</h2>
    <p className="muted">
      {user.hasPassword
        ? 'เปลี่ยนแล้วอุปกรณ์อื่นที่ค้างอยู่จะถูกออกจากระบบทั้งหมด เครื่องนี้ยังอยู่ต่อได้'
        : 'บัญชีนี้ยังไม่มีรหัสผ่านเพราะสมัครด้วย Google ตั้งไว้เพื่อให้เข้าระบบด้วยอีเมลได้อีกทาง'}
    </p>
    <form className="settings-form" onSubmit={save} noValidate>
      {user.hasPassword && <label>รหัสผ่านปัจจุบัน *
        <input
          type="password" required maxLength={200} autoComplete="current-password"
          value={current} onChange={(event) => setCurrent(event.target.value)}
        />
      </label>}
      <label>รหัสผ่านใหม่ *
        <input
          type="password" required maxLength={200} autoComplete="new-password"
          value={next} onChange={(event) => setNext(event.target.value)}
        />
        <small className="muted">อย่างน้อย 10 ตัวอักษร</small>
      </label>
      {message && <p className="auth-message" role="alert">{message}</p>}
      <p className="settings-actions">
        <button className="primary-button" disabled={busy}>
          {busy ? 'กำลังบันทึก…' : user.hasPassword ? 'เปลี่ยนรหัสผ่าน' : 'ตั้งรหัสผ่าน'}
        </button>
        <span className="settings-done" role="status">{done}</span>
      </p>
    </form>
  </section>;
}
