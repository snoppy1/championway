import { Fragment, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import { privacy } from '../legal/privacy';
import { terms } from '../legal/terms';
import { refunds } from '../legal/refunds';
import { CONTACT_EMAIL } from '../legal/types';
import type { LegalBlock, LegalPair } from '../legal/types';
import '../legal.css';

/* หน้าเอกสาร: นโยบายความเป็นส่วนตัว ข้อกำหนดการใช้งาน นโยบายคืนเงิน (5 ต.ค. 2569)
   เนื้อหาอยู่ใน src/legal/ ไทยและอังกฤษคู่กัน หน้านี้จัดรูปแบบ สารบัญ และลิงก์ไปเอกสารอื่น */

export type LegalId = 'privacy' | 'terms' | 'refunds';
const docs: Record<LegalId, LegalPair> = { privacy, terms, refunds };
export const legalPaths: Record<LegalId, string> = { privacy: '/privacy', terms: '/terms', refunds: '/refunds' };

/** อีเมลติดต่อในเนื้อหากลายเป็นลิงก์ส่งอีเมล */
function withEmail(text: string): ReactNode {
  const parts = text.split(CONTACT_EMAIL);
  return parts.map((part, index) => <Fragment key={index}>
    {part}
    {index < parts.length - 1 && <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>}
  </Fragment>);
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === 'string') return <p>{withEmail(block)}</p>;
  if ('list' in block) {
    return <ul>{block.list.map((item, index) => <li key={index}>
      {typeof item === 'string' ? withEmail(item) : <><strong>{item[0]}</strong>{withEmail(item[1])}</>}
    </li>)}</ul>;
  }
  return <div className="legal-table-wrap">
    <table className="legal-table">
      <thead><tr><th scope="col">{block.table.head[0]}</th><th scope="col">{block.table.head[1]}</th></tr></thead>
      <tbody>{block.table.rows.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody>
    </table>
  </div>;
}

export function Legal({ doc }: { doc: LegalId }) {
  const { t, lang } = useI18n();
  const s = t.legal;
  const page = docs[doc][lang];
  useEffect(() => { document.title = `${page.title} — ChampionWays`; }, [page.title]);

  return <main id="main" tabIndex={-1} className="legal">
    <div className="shell legal-layout">
      <header className="legal-head">
        <h1>{page.title}</h1>
        <p className="legal-updated">{page.updated}</p>
        <p className="legal-intro">{page.intro}</p>
      </header>
      <nav className="legal-toc" aria-label={s.onThisPage}>
        <p className="legal-toc__title">{s.onThisPage}</p>
        <ol>{page.sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.heading}</a></li>)}</ol>
        <p className="legal-toc__title">{s.related}</p>
        <ul>{(Object.keys(docs) as LegalId[]).filter((id) => id !== doc).map((id) => <li key={id}>
          <Link to={legalPaths[id]}>{docs[id][lang].title}</Link>
        </li>)}</ul>
      </nav>
      <div className="legal-body">
        {page.sections.map((section) => <section key={section.id} id={section.id} aria-labelledby={`${section.id}-h`}>
          <h2 id={`${section.id}-h`}>{section.heading}</h2>
          {section.blocks.map((block, index) => <Block key={index} block={block} />)}
        </section>)}
      </div>
    </div>
  </main>;
}
