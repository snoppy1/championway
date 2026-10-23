import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import wordmark from '../assets/brand/wordmark.webp';
import '../match.css';

/* กรอบของหน้า หา Mentor ให้ฉัน (Claude Design "Find My Mentor"): พื้นม่วงอ่อน เนินโค้งด้านล่าง เครื่องบินกระดาษ
   แถบบนมีแค่โลโก้ ความคืบหน้า และปุ่มภาษา ไม่มีเมนูของเว็บ เพราะเป็นงานที่ต้องทำให้จบทีละขั้น */

export type ProgressPart = { label: string; done: number; total: number; current: boolean };

export function PaperPlane({ className = '' }: { className?: string }) {
  return <svg className={`mf-plane ${className}`} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="mf-plane-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#a78bfa" /><stop offset="1" stopColor="#6d28d9" /></linearGradient>
    </defs>
    <path d="M6 30 58 6 40 58 30 36Z" fill="url(#mf-plane-a)" />
    <path d="M30 36 58 6 34 44Z" fill="#c4b5fd" opacity=".85" />
    <path d="M30 36 34 44 26 48Z" fill="#f2d66d" />
  </svg>;
}

export function MatchShell({ parts, counter, counterLabel, deco = true, children }: {
  parts?: ProgressPart[]; counter?: string; counterLabel?: string; deco?: boolean; children: ReactNode;
}) {
  const { t, lang, setLang } = useI18n();
  const s = t.match;
  return <div className="mf">
    <div className="mf-wash" aria-hidden="true" />
    <div className="mf-hill" aria-hidden="true" />
    {deco && <div className="mf-deco" aria-hidden="true">
      <svg className="mf-trail" viewBox="0 0 200 260" focusable="false">
        <path d="M190 40 C 120 50, 110 70, 115 110 S 140 190, 60 200 S 10 240, 5 255" fill="none" stroke="#b9a5f5" strokeWidth="2.4" strokeDasharray="1 9" strokeLinecap="round" />
      </svg>
      <span className="mf-spark mf-spark--a">✦</span><span className="mf-spark mf-spark--b">✦</span>
      <PaperPlane />
    </div>}
    <header className="mf-top">
      <Link to="/" className="mf-logo" aria-label={t.common.homeLink}><img src={wordmark} alt="ChampionWays" width={150} height={67} /></Link>
      {parts && <div className="mf-progress" aria-label={counterLabel}>
        <div className="mf-progress__parts">
          {parts.map((part) => <div key={part.label} className="mf-progress__part" style={{ flexGrow: part.total }}>
            <span className="mf-progress__bar"><span style={{ width: `${(part.done / part.total) * 100}%` }} /></span>
            <span className={part.current ? 'mf-progress__label is-current' : 'mf-progress__label'}>{part.label}</span>
          </div>)}
        </div>
        {counter && <span className="mf-progress__count" aria-hidden="true">{counter}</span>}
      </div>}
      <button type="button" className="mf-lang" lang={lang === 'th' ? 'en' : 'th'} aria-label={s.langToggleLabel} onClick={() => setLang(lang === 'th' ? 'en' : 'th')}>{s.langToggle}</button>
    </header>
    {children}
  </div>;
}

/** หัวเรื่องสองบรรทัด บรรทัดที่สองเป็นสีม่วงไล่เฉด */
export function MatchHeading({ lines, helper, id }: { lines: [string, string]; helper?: string; id?: string }) {
  return <div className="mf-head">
    <h1 id={id} tabIndex={-1}><span>{lines[0]}</span> <span className="mf-head__accent">{lines[1]}</span></h1>
    {helper && <p>{helper}</p>}
  </div>;
}
