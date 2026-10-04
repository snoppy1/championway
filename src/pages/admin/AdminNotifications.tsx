import { useEffect, useId, useState } from 'react';
import { Mail } from 'lucide-react';
import { isAdmin, useAuth } from '../../data/auth';
import { ApiError, api } from '../../lib/api';
import { useApi } from '../../lib/useApi';

/* ตั้งค่าการแจ้งทีมงานทางอีเมลเมื่อมีเรื่องใหม่รอตรวจ (server/lib/staff-notify.ts)
   แต่ละเรื่องเปิด/ปิดได้ และเลือกว่าส่งถึง admin ทุกคน หรือเฉพาะคนที่เลือก (admin หรือผู้ตรวจ)
   admin เท่านั้นที่เปิดหน้านี้ได้ (หน้าจัดการเป็นภาษาไทยอย่างเดียว) */

type Kind = 'mentor_application' | 'competition_request' | 'competition_submission';
type Setting = { kind: Kind; enabled: boolean; audience: 'all' | 'selected'; recipientIds: string[] };
type Staff = { id: string; name: string; email: string; role: 'admin' | 'reviewer' };
type Payload = { settings: Setting[]; staff: Staff[] };

const labels: Record<Kind, { title: string; text: string }> = {
  mentor_application: { title: 'ใบสมัครเมนเทอร์ใหม่', text: 'มีคนส่งใบสมัครเป็นเมนเทอร์' },
  competition_request: { title: 'เมนเทอร์ขอเพิ่มเวที', text: 'เมนเทอร์ส่งเวทีที่เคยแข่งพร้อมหลักฐานจาก Mentor zone' },
  competition_submission: { title: 'งานแข่งใหม่จากผู้จัด', text: 'ผู้จัดส่งงานแข่งผ่านฟอร์ม "ลงงานแข่งขันฟรี"' },
};
const roleLabel = { admin: 'admin', reviewer: 'ผู้ตรวจ' } as const;

function SettingCard({ setting, staff, onSaved }: { setting: Setting; staff: Staff[]; onSaved: (settings: Setting[]) => void }) {
  const uid = useId();
  const [draft, setDraft] = useState(setting);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { setDraft(setting); }, [setting]);
  const admins = staff.filter((person) => person.role === 'admin');
  const dirty = JSON.stringify(draft) !== JSON.stringify(setting);
  const count = !draft.enabled ? 0 : draft.audience === 'all' ? admins.length : draft.recipientIds.length;

  async function save() {
    if (draft.enabled && draft.audience === 'selected' && !draft.recipientIds.length) {
      setMessage({ ok: false, text: 'เลือกผู้รับอย่างน้อยหนึ่งคน หรือเลือก "แจ้ง admin ทุกคน"' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await api<{ settings: Setting[] }>(`/admin/notifications/${setting.kind}`, {
        method: 'PUT', body: JSON.stringify({ enabled: draft.enabled, audience: draft.audience, recipientIds: draft.recipientIds }),
      });
      onSaved(result.settings);
      setMessage({ ok: true, text: 'บันทึกแล้ว' });
    } catch (failure) {
      setMessage({ ok: false, text: failure instanceof ApiError ? failure.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง' });
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-block notify-card" aria-labelledby={`${uid}-title`}>
    <div className="notify-head">
      <div>
        <h2 id={`${uid}-title`}>{labels[setting.kind].title}</h2>
        <p className="admin-muted">{labels[setting.kind].text}</p>
      </div>
      <label className="notify-switch">
        <input type="checkbox" role="switch" checked={draft.enabled} disabled={busy}
          onChange={(event) => { setDraft({ ...draft, enabled: event.target.checked }); setMessage(null); }} />
        <span>{draft.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</span>
      </label>
    </div>

    <fieldset className="notify-audience" disabled={!draft.enabled || busy}>
      <legend>ส่งถึงใคร</legend>
      <label className="notify-option">
        <input type="radio" name={`${uid}-audience`} checked={draft.audience === 'all'}
          onChange={() => { setDraft({ ...draft, audience: 'all' }); setMessage(null); }} />
        <span>แจ้ง admin ทุกคน <span className="admin-muted">({admins.length} คน)</span></span>
      </label>
      <label className="notify-option">
        <input type="radio" name={`${uid}-audience`} checked={draft.audience === 'selected'}
          onChange={() => { setDraft({ ...draft, audience: 'selected' }); setMessage(null); }} />
        <span>เลือกเฉพาะบางคน</span>
      </label>
      {draft.audience === 'selected' && <ul className="notify-people" aria-label="เลือกผู้รับ">
        {staff.map((person) => <li key={person.id}>
          <label className="notify-option">
            <input type="checkbox" checked={draft.recipientIds.includes(person.id)}
              onChange={(event) => {
                setDraft({ ...draft, recipientIds: event.target.checked
                  ? [...draft.recipientIds, person.id] : draft.recipientIds.filter((id) => id !== person.id) });
                setMessage(null);
              }} />
            <span>{person.name} <span className="admin-muted">{person.email} · {roleLabel[person.role]}</span></span>
          </label>
        </li>)}
      </ul>}
    </fieldset>

    <div className="notify-foot">
      <p className="admin-muted" role="status"><Mail size={14} aria-hidden="true" />
        {draft.enabled ? `จะส่งอีเมลถึง ${count} คน` : 'ไม่ส่งอีเมล'}</p>
      <button type="button" className="primary-button" disabled={busy || !dirty} onClick={() => { void save(); }}>
        {busy ? 'กำลังบันทึก…' : 'บันทึก'}
      </button>
    </div>
    {message && <p className={message.ok ? 'notify-message is-ok' : 'admin-message'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
  </section>;
}

export function AdminNotifications() {
  const { user } = useAuth();
  const allowed = isAdmin(user);
  const { data, error, loading, reload } = useApi<Payload>(allowed ? '/admin/notifications' : null);
  const [settings, setSettings] = useState<Setting[] | null>(null);
  useEffect(() => { if (data) setSettings(data.settings); }, [data]);

  if (!allowed) return <p className="admin-empty">หน้านี้สำหรับผู้ดูแล (admin) เท่านั้น</p>;
  return <>
    <header className="admin-page-head">
      <h1>การแจ้งเตือนทางอีเมล</h1>
      <p className="admin-muted">
        เมื่อมีเรื่องใหม่รอตรวจ ระบบส่งอีเมลพร้อมลิงก์ไปหน้าตรวจ ไม่ใส่อีเมลหรือเบอร์ของผู้สมัคร
        เลือกผู้รับได้จาก admin และผู้ตรวจ คนที่ถูกลดสิทธิ์จะไม่ได้รับอีเมลอีกเอง
      </p>
    </header>
    {loading && !data && <p className="admin-muted" role="status">กำลังโหลด…</p>}
    {error && <div className="admin-message" role="alert">{error} <button type="button" className="ghost-button" onClick={reload}>ลองใหม่</button></div>}
    {data && settings && <div className="notify-list">
      {settings.map((setting) => <SettingCard key={setting.kind} setting={setting} staff={data.staff} onSaved={setSettings} />)}
    </div>}
  </>;
}
