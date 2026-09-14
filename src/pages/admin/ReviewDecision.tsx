import { useState } from 'react';
import { Check, Send, TriangleAlert, X } from 'lucide-react';
import { ApiError, post } from '../../lib/api';

type Decision = 'publish' | 'info' | 'reject';

const labels: Record<Decision, string> = {
  publish: 'เผยแพร่', info: 'ขอข้อมูลเพิ่ม', reject: 'ไม่ผ่าน',
};

/**
 * เอาเกณฑ์การตรวจมาบังคับด้วยระบบ ไม่ใช่หวังว่าคนตรวจจะจำได้:
 * ปุ่มเผยแพร่กดไม่ได้จนกว่าจะติ๊กครบทุกข้อ และอีกสองปุ่มต้องมีเหตุผลติดไปด้วยเสมอ
 * กฎเดียวกันนี้ถูกบังคับซ้ำที่เซิร์ฟเวอร์ เพราะหน้าเว็บถูกข้ามได้เสมอ
 */
export function ReviewDecision({ checks, endpoint, noun, onDone, publication }: {
  checks: string[];
  endpoint: string;
  noun: string;
  onDone: () => void;
  publication?: { kind: string; themes: string[] };
}) {
  const [ticked, setTicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);

  const remaining = checks.filter((check) => !ticked.includes(check)).length;

  async function decide(decision: Decision) {
    if (decision === 'publish' && publication && (!publication.kind || !publication.themes.length)) {
      setMessage('เลือกประเภทการแข่งขันและอย่างน้อยหนึ่งหมวดก่อนเผยแพร่');
      return;
    }
    if (decision !== 'publish' && !note.trim()) {
      setMessage(`กรอกเหตุผลก่อน เพราะข้อความนี้คือสิ่งที่ผู้ส่ง${noun}จะได้อ่าน`);
      document.getElementById('review-note')?.focus();
      return;
    }
    setMessage('');
    setBusy(true);
    try {
      await post(`${endpoint}/decision`, { decision, note, checks: ticked, ...(publication && decision === 'publish' ? publication : {}) });
      setDone(`บันทึกผลแล้ว: ${labels[decision]}`);
      onDone();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'บันทึกผลไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  function toggle(check: string) {
    setTicked((current) => (current.includes(check)
      ? current.filter((item) => item !== check)
      : [...current, check]));
    setDone('');
  }

  return <section className="review-panel" aria-labelledby="review-title">
    <h2 id="review-title">ตรวจและตัดสิน</h2>

    <fieldset className="review-checks">
      <legend>รายการตรวจ <span className="admin-muted">({checks.length - remaining}/{checks.length})</span></legend>
      {checks.map((check) => <label className="review-check" key={check}>
        <input type="checkbox" checked={ticked.includes(check)} onChange={() => toggle(check)} />
        <span>{check}</span>
      </label>)}
    </fieldset>

    <label className="review-note-field" htmlFor="review-note">
      เหตุผลที่จะส่งให้ผู้ส่ง
      <small>บังคับกรอกเมื่อขอข้อมูลเพิ่มหรือไม่ผ่าน เขียนให้ผู้ส่งแก้ต่อได้ ไม่ใช่แค่บอกว่าไม่ผ่าน</small>
      <textarea
        id="review-note" rows={4} value={note}
        onChange={(event) => { setNote(event.target.value); setDone(''); }}
      />
    </label>

    {remaining > 0 && <p className="review-gate">
      <TriangleAlert size={15} aria-hidden="true" />
      ยังเหลืออีก {remaining} ข้อที่ยังไม่ได้ตรวจ จึงยังกดเผยแพร่ไม่ได้
    </p>}

    <p className="admin-message" role="alert">{message}</p>

    <div className="review-actions">
      <button type="button" className="primary-button" disabled={remaining > 0 || busy} onClick={() => decide('publish')}>
        <Check size={16} aria-hidden="true" />เผยแพร่
      </button>
      <button type="button" className="ghost-button" disabled={busy} onClick={() => decide('info')}>
        <Send size={16} aria-hidden="true" />ขอข้อมูลเพิ่ม
      </button>
      <button type="button" className="danger-button" disabled={busy} onClick={() => decide('reject')}>
        <X size={16} aria-hidden="true" />ไม่ผ่าน
      </button>
    </div>

    <p className="review-result" role="status">
      {done && `${done} — ผู้ส่งจะได้รับอีเมลแจ้งผล ซึ่งตอนนี้ระบบบันทึกไว้แทนการส่งจริง`}
    </p>
  </section>;
}
