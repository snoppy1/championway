import { useSearchParams } from 'react-router-dom';
import { kinds, kindKeys, themeKeys, themes, type Kind, type Theme } from '../data/focus';
import './competition-type-filter.css';

export function CompetitionTypeFilter() {
  const [params, setParams] = useSearchParams();
  const rawKind = params.get('kind') as Kind;
  const kind = kindKeys.includes(rawKind) ? rawKind : null;
  const selected = (params.get('theme') ?? '').split(',').filter((key): key is Theme => themeKeys.includes(key as Theme));
  const expanded = kind !== null;
  function change(type: Kind | null, theme: Theme[] = []) {
    const next = new URLSearchParams(params);
    for (const key of ['kind', 'theme', 'cat', 'category', 'page']) next.delete(key);
    if (type) next.set('kind', type);
    if (theme.length) next.set('theme', theme.join(','));
    setParams(next, { preventScrollReset: true });
  }
  return <div className="competition-type-filter">
    <div className="type-buttons" role="group" aria-label="ประเภทการแข่งขัน">
      {Object.entries(kinds).map(([id, label]) => <button key={id} type="button"
        className={`tab-button${kind === id ? ' active' : ''}`}
        aria-pressed={kind === id} aria-expanded={kind === id} aria-controls={expanded ? 'competition-subtypes' : undefined}
        onClick={() => change(kind === id ? null : id as Kind)}>{label}</button>)}
    </div>
    {expanded && <div className="subtype-reveal" id="competition-subtypes" key={kind}>
      <div className="subtype-options" role="group" aria-label={`หมวดย่อย ${kinds[kind!]}`}>
        {themeKeys.map(id => <button type="button" key={id} className={`tab-button${selected.includes(id) ? ' active' : ''}`}
          aria-pressed={selected.includes(id)} onClick={() => change(kind, selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id])}>{themes[id]}</button>)}
      </div>
      <button type="button" className="link-button type-reset" onClick={() => change(null)}>ล้างประเภทและหมวด</button>
    </div>}
  </div>;
}
