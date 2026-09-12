import { useState } from 'react';
import { Check, Send, TriangleAlert, X } from 'lucide-react';

type Decision = 'publish' | 'info' | 'reject';

const labels: Record<Decision, string> = {
  publish: 'เผยแพร่', info: 'ขอข้อมูลเพิ่ม', reject: 'ไม่ผ่าน',
};

/**
 * เอาเกณฑ์การตรวจมาบังคับด้วยระบบ ไม่ใช่หวังว่าคนตรวจจะจำได้:
 * ปุ่มเผยแพร่กดไม่ได้จนกว่าจะติ๊กครบทุกข้อ และอีกสองปุ่มต้องมีเหตุผลติดไปด้วยเสมอ
 */
export function ReviewDecision({ checks, noun }: { checks: string[]; noun: string }) {
  const [ticked, setTicked] = useState<boolean[]>(() => checks.map(() => false));
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [done, setDone] = useState<Decision | null>(null);

  const remaining = ticked.filter((value) => !value).length;

  function decide(decision: Decision) {
    if (decision !== 'publish' && !note.trim()) {
      setMessage(`กรอกเหตุผลก่อน เพราะข้อความนี้คือสิ่งที่ผู้ส่ง${noun}จะได้อ่าน`);
      document.getElementById('review-note')?.focus();
      return;
    }
    setMessage('');
    setDone(decision);
  }

  function toggle(index: number) {
    setTicked((current) => current.map((value, position) => (position === index ? !value : value)));
    setDone(null);
  }

  return <section className="review-panel" aria-labelledby="review-title">
    <h2 id="review-title">ตรวจและตัดสิน</h2>

    <fieldset className="review-checks">
      <legend>รายการตรวจ <span className="admin-muted">({checks.length - remaining}/{checks.length})</span></legend>
      {checks.map((check, index) => <label className="review-check" key={check}>
        <input type="checkbox" checked={ticked[index]} onChange={() => toggle(index)} />
        <span>{check}</span>
      </label>)}
    </fieldset>

    <label className="review-note-field" htmlFor="review-note">
      เหตุผลที่จะส่งให้ผู้ส่ง
      <small>บังคับกรอกเมื่อขอข้อมูลเพิ่มหรือไม่ผ่าน เขียนให้ผู้ส่งแก้ต่อได้ ไม่ใช่แค่บอกว่าไม่ผ่าน</small>
      <textarea
        id="review-note" rows={4} value={note}
        onChange={(event) => { setNote(event.target.value); setDone(null); }}
      />
    </label>

    {remaining > 0 && <p className="review-gate">
      <TriangleAlert size={15} aria-hidden="true" />
      ยังเหลืออีก {remaining} ข้อที่ยังไม่ได้ตรวจ จึงยังกดเผยแพร่ไม่ได้
    </p>}

    <p className="admin-message" role="alert">{message}</p>

    <div className="review-actions">
      <button type="button" className="primary-button" disabled={remaining > 0} onClick={() => decide('publish')}>
        <Check size={16} aria-hidden="true" />เผยแพร่
      </button>
      <button type="button" className="ghost-button" onClick={() => decide('info')}>
        <Send size={16} aria-hidden="true" />ขอข้อมูลเพิ่ม
      </button>
      <button type="button" className="danger-button" onClick={() => decide('reject')}>
        <X size={16} aria-hidden="true" />ไม่ผ่าน
      </button>
    </div>

    <p className="review-result" role="status">
      {done && `ตัวอย่างการตัดสิน: ${labels[done]} — ต้นแบบนี้ยังไม่บันทึกผลและไม่ส่งอีเมลจริง`}
    </p>
  </section>;
}
