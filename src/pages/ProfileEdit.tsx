import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, KeyRound, Mail, UserRound } from 'lucide-react';
import { useAuth } from '../data/auth';
import type { Account } from '../data/auth';
import { api, post, ApiError } from '../lib/api';
import { personLevelKeys } from '../data/profile';
import type { PersonLevel } from '../data/profile';
import { occupationIds, occupationValues } from '../data/stored-values';
import { useI18n } from '../i18n';
import '../journey.css';

/* หน้าแก้ไขโปรไฟล์ของสมาชิกทั่วไป แยกเป็นสามฟอร์มที่บันทึกแยกกัน
   เพราะการเปลี่ยนอีเมลกับรหัสผ่านต้องยืนยันตัวตนซ้ำ ส่วนข้อมูลทั่วไปไม่ต้อง
   ถ้ารวมเป็นฟอร์มเดียวจะต้องถามรหัสผ่านทุกครั้งแม้แค่แก้ชื่อเล่น

   เครื่องมือของเมนเทอร์ (ความถนัด คิว งานที่รับ) ยังอยู่ที่ /profile ตามเดิม
   หน้านี้ว่าด้วยตัวตนและบัญชีเท่านั้น */

const errorText = (failure: unknown, fallback: string) =>
  (failure instanceof ApiError ? failure.message : fallback);

export function ProfileEdit() {
  const { t } = useI18n();
  const s = t.profileEdit;
  const { user, loading, applyUser } = useAuth();
  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);

  if (loading) return <main id="main" className="shell page">{s.loadingAccount}</main>;
  if (!user) return <Navigate to="/signin?next=/profile/edit" replace />;

  return <main id="main" tabIndex={-1} className="shell page journey-page">
    <p className="detail-breadcrumb">
      <Link to="/profile"><ArrowLeft size={16} aria-hidden="true" />{s.backToProfile}</Link>
    </p>
    <header className="profile-head">
      <div>
        <p className="eyebrow">{s.eyebrow}</p>
        <h1>{s.title}</h1>
        <p className="muted">{s.lead}</p>
      </div>
    </header>

    <DetailsForm user={user} applyUser={applyUser} />
    <EmailForm user={user} applyUser={applyUser} />
    <PasswordForm user={user} applyUser={applyUser} />
  </main>;
}

type FormProps = { user: Account; applyUser: (account: Account) => void };

function DetailsForm({ user, applyUser }: FormProps) {
  const { t } = useI18n();
  const s = t.profileEdit;
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
          throw new ApiError(uploaded.status, payload.error ?? s.uploadFailed);
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
      setDone(s.saved);
    } catch (failure) {
      setMessage(errorText(failure, s.saveFailed));
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
      setDone(s.photoRemoved);
    } catch (failure) {
      setMessage(errorText(failure, s.removeFailed));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel profile-block">
    <h2><UserRound size={18} aria-hidden="true" />{s.detailsHeading}</h2>
    <form className="settings-form" onSubmit={save} noValidate>
      <div className="avatar-row">
        {preview || user.avatarUrl
          ? <img className="profile-avatar" src={preview || user.avatarUrl!} alt="" width={58} height={58} />
          : <span className="profile-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>}
        <div>
          <label htmlFor="profile-picture">{s.picture}</label>
          <input
            id="profile-picture" ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setPicture(event.target.files?.[0])}
          />
          <small className="muted">{s.pictureHint}</small>
          {user.avatarUrl && <p>
            <button type="button" className="link-button" disabled={busy} onClick={removePicture}>{s.removePicture}</button>
          </p>}
        </div>
      </div>

      <label>{s.name}
        <input required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} />
      </label>

      <label>{s.bio}
        <textarea
          rows={3} maxLength={300} value={bio} onChange={(event) => setBio(event.target.value)}
          placeholder={s.bioPlaceholder}
        />
        <small className="muted">{bio.length} / 300</small>
      </label>

      {/* select ต้องใช้ label แยกกับ htmlFor ถ้าครอบไว้ ชื่อที่โปรแกรมอ่านหน้าจอได้
          จะกลายเป็นข้อความของตัวเลือกทุกอันต่อท้ายชื่อช่อง */}
      <div className="settings-pair">
        <span className="settings-field">
          <label htmlFor="profile-occupation">{s.occupation}</label>
          <select id="profile-occupation" value={occupation} onChange={(event) => setOccupation(event.target.value)}>
            <option value="">{s.unspecified}</option>
            {occupationIds.map((id) => <option key={id} value={occupationValues[id]}>{t.taxonomy.occupations[id]}</option>)}
          </select>
        </span>
        <span className="settings-field">
          <label htmlFor="profile-level">{s.level}</label>
          <select id="profile-level" value={level} onChange={(event) => setLevel(event.target.value as PersonLevel | '')}>
            <option value="">{s.unspecified}</option>
            {personLevelKeys.map((item) => <option key={item} value={item}>{t.taxonomy.personLevels[item]}</option>)}
          </select>
        </span>
      </div>

      <div className="settings-pair">
        <label>{s.organization}
          <input maxLength={100} value={organization} onChange={(event) => setOrganization(event.target.value)} />
        </label>
        <label>{s.position}
          <input
            maxLength={100} value={position} onChange={(event) => setPosition(event.target.value)}
            placeholder={s.positionPlaceholder}
          />
        </label>
      </div>

      {message && <p className="auth-message" role="alert">{message}</p>}
      <p className="settings-actions">
        <button className="primary-button" disabled={busy}>{busy ? s.saving : s.save}</button>
        <span className="settings-done" role="status">{done}</span>
      </p>
    </form>
  </section>;
}

function EmailForm({ user, applyUser }: FormProps) {
  const { t } = useI18n();
  const s = t.profileEdit;
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
      setDone(s.emailChanged);
    } catch (failure) {
      setMessage(errorText(failure, s.emailFailed));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel profile-block">
    <h2><Mail size={18} aria-hidden="true" />{s.emailHeading}</h2>
    {/* บัญชีที่ผูก Google ใช้อีเมลของ Google เป็นตัวยืนยันตัวตน เปลี่ยนที่นี่แล้วจะไม่ตรงกัน */}
    {user.googleLinked ? <p className="muted">{s.googleNote}</p> : <form className="settings-form" onSubmit={save} noValidate>
      <label>{s.newEmail}
        <input type="email" required maxLength={200} value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label>{s.currentPassword}
        <input
          type="password" required maxLength={200} autoComplete="current-password"
          value={password} onChange={(event) => setPassword(event.target.value)}
        />
        <small className="muted">{s.passwordAsk}</small>
      </label>
      {message && <p className="auth-message" role="alert">{message}</p>}
      <p className="settings-actions">
        <button className="primary-button" disabled={busy}>{busy ? s.saving : s.changeEmail}</button>
        <span className="settings-done" role="status">{done}</span>
      </p>
    </form>}
  </section>;
}

function PasswordForm({ user, applyUser }: FormProps) {
  const { t } = useI18n();
  const s = t.profileEdit;
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
      setDone(s.passwordChanged);
    } catch (failure) {
      setMessage(errorText(failure, s.passwordFailed));
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel profile-block">
    <h2><KeyRound size={18} aria-hidden="true" />{s.passwordHeading}</h2>
    <p className="muted">
      {user.hasPassword ? s.hasPassword : s.noPassword}
    </p>
    <form className="settings-form" onSubmit={save} noValidate>
      {user.hasPassword && <label>{s.currentPassword}
        <input
          type="password" required maxLength={200} autoComplete="current-password"
          value={current} onChange={(event) => setCurrent(event.target.value)}
        />
      </label>}
      <label>{s.newPassword}
        <input
          type="password" required maxLength={200} autoComplete="new-password"
          value={next} onChange={(event) => setNext(event.target.value)}
        />
        <small className="muted">{s.minLength}</small>
      </label>
      {message && <p className="auth-message" role="alert">{message}</p>}
      <p className="settings-actions">
        <button className="primary-button" disabled={busy}>
          {busy ? s.saving : user.hasPassword ? s.changePassword : s.setPassword}
        </button>
        <span className="settings-done" role="status">{done}</span>
      </p>
    </form>
  </section>;
}
