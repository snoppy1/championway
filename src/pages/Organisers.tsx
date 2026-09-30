import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Clock, Link2, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '../data/auth';
import { useI18n } from '../i18n';

/* เกณฑ์รับและไม่รับ (t.organisers.acceptedList / rejectedList) คือเกณฑ์เดียวกับที่ทีมตรวจใช้จริง
   เขียนไว้ให้ผู้จัดอ่านก่อนกรอก จะได้ไม่เสียเที่ยว */

export function Organisers() {
  const { t } = useI18n();
  const s = t.organisers;
  const { user } = useAuth();
  useEffect(() => { document.title = `${s.pageTitle} — ChampionWays`; }, [s.pageTitle]);

  return <main id="main" tabIndex={-1} className="shell page">
    <section className="organiser-hero">
      <p className="eyebrow">{s.eyebrow}</p>
      <h1>{s.title}</h1>
      <p className="organiser-lead">{s.lead}</p>
      <p className="organiser-actions">
        <Link className="primary-button" to="/organizers/submit">
          {s.start}<ArrowRight size={17} aria-hidden="true" />
        </Link>
        {!user && <Link className="ghost-button" to="/signin?next=/organizers/submit">{s.signIn}</Link>}
      </p>
    </section>

    <section className="organiser-steps" aria-labelledby="how-title">
      <h2 id="how-title">{s.howTitle}</h2>
      <ol className="step-list">
        {s.steps.map((step, index) => <li key={step.bold}><span>{index + 1}</span><p><b>{step.bold}</b>{step.text}</p></li>)}
      </ol>
    </section>

    <section className="organiser-rules" aria-labelledby="rules-title">
      <h2 id="rules-title">{s.rulesTitle}</h2>
      <div className="rules-grid">
        <div className="rules-card">
          <h3><Check size={17} aria-hidden="true" />{s.accepted}</h3>
          <ul>{s.acceptedList.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div className="rules-card is-no">
          <h3><X size={17} aria-hidden="true" />{s.rejected}</h3>
          <ul>{s.rejectedList.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </div>
    </section>

    <section className="organiser-notes" aria-labelledby="notes-title">
      <h2 id="notes-title">{s.notesTitle}</h2>
      <div className="notes-grid">
        {s.notes.map((note, index) => {
          const Icon = [Link2, ShieldCheck, Clock][index];
          return <div className="note-card" key={note.title}>
            <Icon size={18} aria-hidden="true" />
            <h3>{note.title}</h3>
            <p>{note.text}</p>
          </div>;
        })}
      </div>
    </section>

    <section className="organiser-cta">
      <h2>{s.ctaTitle}</h2>
      <p className="muted">{s.ctaText}</p>
      <Link className="primary-button" to="/organizers/submit">
        {s.ctaButton}<ArrowRight size={17} aria-hidden="true" />
      </Link>
    </section>
  </main>;
}
