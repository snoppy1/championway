import { useEffect, useId, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useI18n } from '../i18n';
import '../safety.css';

/* เตือนความปลอดภัยก่อนเริ่มติดต่อเมนเทอร์ (เจ้าของสั่ง 27 ต.ค. 2569): ทั้งปุ่มเริ่มปรึกษาในผลจับคู่และปุ่มติดต่อบนโปรไฟล์
   ต้องติ๊กรับทราบก่อนจึงกดดำเนินการต่อได้ ปิดหรือกด Esc = ยกเลิก ไม่ติดต่อ */
export function SafetyDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  const s = t.safety;
  const ref = useRef<HTMLDialogElement>(null);
  const [ack, setAck] = useState(false);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return <dialog ref={ref} className="sd" aria-labelledby={`${id}-title`} aria-describedby={`${id}-lead`} onClose={onCancel}>
    <p className="sd-eyebrow"><ShieldAlert size={16} aria-hidden="true" />{s.eyebrow}</p>
    <h2 id={`${id}-title`}>{s.title}</h2>
    <p id={`${id}-lead`} className="sd-lead">{s.lead}</p>
    <p>{s.intro}</p>
    <ul>{s.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
    <div className="sd-note">
      <strong>{s.noteTitle}</strong>
      <p>{s.note}</p>
    </div>
    <label className="sd-ack">
      <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />
      <span>{s.ack}</span>
    </label>
    <div className="sd-actions">
      <button type="button" className="sd-cancel" onClick={() => ref.current?.close()}>{s.cancel}</button>
      <button type="button" className="sd-confirm" disabled={!ack} onClick={() => { const dialog = ref.current; onConfirm(); dialog?.close(); }}>{s.confirm}</button>
    </div>
  </dialog>;
}
